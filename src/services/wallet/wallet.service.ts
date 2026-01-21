import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { AgentsService } from '../agents/agents.service';
import { WalletAuditService } from '../wallet-audit/wallet-audit.service';
import { WalletRetryService } from '../wallet-retry/wallet-retry.service';
import {
  WalletApiAction,
  WalletErrorType,
} from '../../enums/wallet.enums';
import { WalletAuditStatus } from '../../entities/wallet-audit.entity';
import { WalletApiAdapter } from '../../interfaces/wallet-api-adapter.interface';

export interface WalletResponse {
  balance: number;
  balanceTs: string | null;
  status: string;
  userId: string | null;
  raw: any;
}

export interface PlaceBetParams {
  agentId: string;
  userId: string;
  amount: number;
  roundId: string;
  platformTxId: string;
  currency?: string;
  gameCode: string;
}

export interface SettleBetParams {
  agentId: string;
  platformTxId: string;
  userId: string;
  winAmount: number;
  roundId: string;
  betAmount: number;
  gameCode: string;
  gameSession?: any;
}

export interface RefundTransaction {
  platformTxId: string;
  refundPlatformTxId: string;
  betAmount: number;
  winAmount: number;
  turnover?: number;
  betTime: string;
  updateTime: string;
  roundId: string;
  gameCode: string;
  gameInfo?: any;
}

export interface RefundBetParams {
  agentId: string;
  userId: string;
  refundTransactions: RefundTransaction[];
}

export const WALLET_API_ADAPTER = Symbol('WalletApiAdapter');

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly http: HttpService,
    private readonly walletAuditService: WalletAuditService,
    private readonly retryJobService: WalletRetryService,
    @Optional()
    @Inject(WALLET_API_ADAPTER)
    private readonly walletApiAdapter?: WalletApiAdapter,
  ) {
    // Diagnostic logging to verify adapter injection
    if (this.walletApiAdapter) {
      this.logger.log('[WalletService] WalletApiAdapter is available and injected');
    } else {
      this.logger.warn('[WalletService] WalletApiAdapter is NOT available - game payloads will be minimal');
    }
  }

  private async resolveAgent(agentId: string) {
    const agent = await this.agentsService.findOne(agentId);
    if (!agent) {
      throw new NotFoundException(`Agent '${agentId}' not found`);
    }
    return {
      callbackURL: agent.callbackURL,
      cert: agent.cert,
      agentId: agent.agentId,
    };
  }

  // Unified agent response interface
  private mapAgentResponse(data: any): WalletResponse {
    if (!data || typeof data.status !== 'string') {
      throw new InternalServerErrorException('Malformed agent response');
    }
    return {
      balance: Number(data.balance ?? 0),
      balanceTs: data.balanceTs ?? null,
      status: data.status,
      userId: data.userId ?? null,
      raw: data,
    } as const;
  }

  /**
   * Log audit record (non-blocking, fire-and-forget)
   * Errors are caught and logged but don't throw to avoid breaking API calls
   */
  private logAudit(params: {
    requestId: string;
    agentId: string;
    userId: string;
    apiAction: WalletApiAction;
    status: WalletAuditStatus;
    requestPayload?: any;
    requestUrl?: string;
    responseData?: any;
    httpStatus?: number;
    responseTime?: number;
    failureType?: WalletErrorType;
    errorMessage?: string;
    errorStack?: string;
    platformTxId?: string;
    roundId?: string;
    betAmount?: number | string;
    winAmount?: number | string;
    currency?: string;
    callbackUrl?: string;
    rawError?: string;
  }): void {
    try {
      const auditPromise = this.walletAuditService.logAudit(params);
      if (auditPromise && typeof auditPromise.catch === 'function') {
        auditPromise.catch((err: any) => {
          try {
            this.logger.error(
              `Failed to log wallet audit (non-blocking): ${err?.message || 'Unknown error'}`,
              err?.stack,
            );
          } catch (logError) {
            console.error('Critical: Failed to log audit error', logError);
          }
        });
      }
    } catch (syncError: any) {
      try {
        this.logger.error(
          `Failed to initiate wallet audit logging (sync error): ${syncError?.message || 'Unknown error'}`,
          syncError?.stack,
        );
      } catch {
        console.error('Critical: Failed to log sync audit error', syncError);
      }
    }
  }

  /**
   * Safely create retry job - never throws, never crashes the app
   */
  private createRetryJobSafely(params: {
    platformTxId: string;
    apiAction: WalletApiAction;
    agentId: string;
    userId: string;
    requestPayload: any;
    callbackUrl: string;
    roundId?: string;
    betAmount?: number | string;
    winAmount?: number | string;
    currency?: string;
    gamePayloads?: any;
    walletAuditId?: string;
    errorMessage?: string;
  }): void {
    try {
      const retryPromise = this.retryJobService.createRetryJob(params);
      if (retryPromise && typeof retryPromise.catch === 'function') {
        retryPromise.catch((err: any) => {
          try {
            this.logger.error(
              `Failed to create retry job (non-blocking): ${err?.message || 'Unknown error'}`,
              err?.stack,
            );
          } catch (logError) {
            console.error('Critical: Failed to log retry job error', logError);
          }
        });
      }
    } catch (syncError: any) {
      try {
        this.logger.error(
          `Failed to initiate retry job creation (sync error): ${syncError?.message || 'Unknown error'}`,
          syncError?.stack,
        );
      } catch {
        console.error('Critical: Failed to log sync retry job error', syncError);
      }
    }
  }

  async getBalance(
    agentId: string,
    userId: string,
  ): Promise<WalletResponse> {
    const requestId = uuidv4();
    const { callbackURL, cert } = await this.resolveAgent(agentId);
    const url = callbackURL;
    const messageObj = { action: 'getBalance', userId };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    const requestStartTime = Date.now();
    this.logger.debug(`Calling getBalance url=${url} agent=${agentId} requestId=${requestId}`);
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      const responseTime = Date.now() - requestStartTime;
      const mappedResponse = this.mapAgentResponse((resp as any).data);

      // Check if agent rejected the request (status !== '0000' means failure)
      if (mappedResponse.status !== '0000') {
        const errorMessage = `Agent rejected getBalance with status: ${mappedResponse.status}`;

        // Log to audit (non-blocking)
        this.logAudit({
          requestId,
          agentId,
          userId,
          apiAction: WalletApiAction.GET_BALANCE,
          status: WalletAuditStatus.FAILURE,
          requestPayload: { messageObj, url },
          requestUrl: url,
          responseData: mappedResponse.raw,
          httpStatus: (resp as any).status,
          responseTime,
          failureType: WalletErrorType.AGENT_REJECTED,
          errorMessage,
          callbackUrl: url,
        });

        throw new InternalServerErrorException(errorMessage);
      }

      // Log success to audit (non-blocking)
      this.logAudit({
        requestId,
        agentId,
        userId,
        apiAction: WalletApiAction.GET_BALANCE,
        status: WalletAuditStatus.SUCCESS,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData: mappedResponse.raw,
        httpStatus: resp.status,
        responseTime,
        callbackUrl: url,
      });

      return mappedResponse;
    } catch (err: any) {
      const responseTime = Date.now() - requestStartTime;
      this.logger.error(
        `getBalance failed agent=${agentId} user=${userId} requestId=${requestId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log to audit (non-blocking)
      this.logAudit({
        requestId,
        agentId,
        userId,
        apiAction: WalletApiAction.GET_BALANCE,
        status: WalletAuditStatus.FAILURE,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData,
        httpStatus,
        responseTime,
        failureType: errorType,
        errorMessage: err.message || 'Unknown error',
        errorStack: err.stack,
        callbackUrl: url,
        rawError: JSON.stringify(err),
      });

      throw err;
    }
  }

  async placeBet(params: PlaceBetParams): Promise<WalletResponse> {
    const requestId = uuidv4();
    let requestStartTime: number | undefined;
    let url: string | undefined;
    let messageObj: any;
    let currency: string = params.currency || 'USD';
    
    this.logger.log(
      `[WALLET_PLACE_BET_START] requestId=${requestId} user=${params.userId} agent=${params.agentId} gameCode=${params.gameCode} amount=${params.amount} roundId=${params.roundId} txId=${params.platformTxId}`,
    );

    try {
      const { callbackURL, cert } = await this.resolveAgent(params.agentId);
      url = callbackURL;
      const betTime = new Date().toISOString();
      currency = params.currency || 'USD';

      this.logger.debug(
        `[WALLET_PLACE_BET] Resolved agent: agentId=${params.agentId} url=${url} currency=${currency}`,
      );

      // Get game payloads from adapter if available
      // Wrap in try-catch to handle errors gracefully (e.g., game not found in DB)
      let gamePayloads: { gameCode: string; [key: string]: any } = { gameCode: params.gameCode };
      if (this.walletApiAdapter) {
        this.logger.debug(
          `[WALLET_PLACE_BET] WalletApiAdapter available, fetching game payloads for gameCode=${params.gameCode}`,
        );
        try {
          gamePayloads = await this.walletApiAdapter.getGamePayloads(params.gameCode);
          this.logger.log(
            `[WALLET_PLACE_BET] Successfully fetched game payloads: gameCode=${params.gameCode} payloads=${JSON.stringify(gamePayloads)}`,
          );
        } catch (error) {
          // Log error but continue with minimal payload
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `[WALLET_PLACE_BET] Failed to get game payloads for gameCode=${params.gameCode}, using minimal payload. Error: ${errorMessage}${errorStack ? ` Stack: ${errorStack}` : ''}`,
          );
          // Fall back to minimal payload (already set above)
        }
      } else {
        this.logger.warn(
          `[WALLET_PLACE_BET] WalletApiAdapter not available, using minimal payload for gameCode=${params.gameCode}`,
        );
      }

      const txn = {
        platformTxId: params.platformTxId,
        userId: params.userId,
        currency,
        ...gamePayloads,
        betType: null,
        betAmount: params.amount,
        betTime,
        roundId: params.roundId,
        isPremium: false,
      };

      this.logger.debug(
        `[WALLET_PLACE_BET] Transaction object: ${JSON.stringify(txn, null, 2)}`,
      );

      messageObj = { action: 'bet', txns: [txn] };
      const payload = { key: cert, message: JSON.stringify(messageObj) };
      requestStartTime = Date.now();
      this.logger.log(
        `[WALLET_API_REQUEST] requestId=${requestId} user=${params.userId} agent=${params.agentId} action=placeBet url=${url} amount=${params.amount} roundId=${params.roundId} txId=${params.platformTxId} gamePayloads=${JSON.stringify(gamePayloads)}`,
      );
      
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      const responseTime = Date.now() - requestStartTime;
      const mappedResponse = this.mapAgentResponse((resp as any).data);
      this.logger.log(
        `[WALLET_API_RESPONSE] user=${params.userId} agent=${params.agentId} action=placeBet status=${mappedResponse.status} balance=${mappedResponse.balance} responseTime=${responseTime}ms`,
      );

      // Check if agent rejected the bet (status !== '0000' means failure)
      if (mappedResponse.status !== '0000') {
        const errorMessage = `Agent rejected bet with status: ${mappedResponse.status}`;

        // Log to audit (non-blocking)
        this.logAudit({
          requestId,
          agentId: params.agentId,
          userId: params.userId,
          apiAction: WalletApiAction.PLACE_BET,
          status: WalletAuditStatus.FAILURE,
          requestPayload: { messageObj, url },
          requestUrl: url,
          responseData: mappedResponse.raw,
          httpStatus: (resp as any).status,
          responseTime,
          failureType: WalletErrorType.AGENT_REJECTED,
          errorMessage,
          platformTxId: params.platformTxId,
          roundId: params.roundId,
          betAmount: params.amount,
          currency,
          callbackUrl: url,
        });

        throw new InternalServerErrorException(errorMessage);
      }

      // Log success to audit (non-blocking)
      this.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.PLACE_BET,
        status: WalletAuditStatus.SUCCESS,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData: mappedResponse.raw,
        httpStatus: resp.status,
        responseTime,
        platformTxId: params.platformTxId,
        roundId: params.roundId,
        betAmount: params.amount,
        currency,
        callbackUrl: url,
      });

      this.logger.log(
        `[WALLET_PLACE_BET_SUCCESS] requestId=${requestId} user=${params.userId} agent=${params.agentId} status=${mappedResponse.status} balance=${mappedResponse.balance}`,
      );
      return mappedResponse;
    } catch (err: any) {
      const responseTime = requestStartTime ? Date.now() - requestStartTime : 0;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      const errorName = err instanceof Error ? err.name : typeof err;
      
      this.logger.error(
        `[WALLET_PLACE_BET_ERROR] requestId=${requestId} agent=${params.agentId} user=${params.userId} gameCode=${params.gameCode} amount=${params.amount} roundId=${params.roundId} txId=${params.platformTxId} error=${errorName}: ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ''}${err.response ? `\nHTTP Status: ${err.response.status}\nResponse Data: ${JSON.stringify(err.response.data)}` : ''}${err.code ? `\nError Code: ${err.code}` : ''}`,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log to audit (non-blocking)
      this.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.PLACE_BET,
        status: WalletAuditStatus.FAILURE,
        requestPayload: messageObj ? { messageObj, url } : undefined,
        requestUrl: url,
        responseData,
        httpStatus,
        responseTime,
        failureType: errorType,
        errorMessage: err.message || 'Unknown error',
        errorStack: err.stack,
        platformTxId: params.platformTxId,
        roundId: params.roundId,
        betAmount: params.amount,
        currency,
        callbackUrl: url,
        rawError: JSON.stringify(err),
      });

      throw err;
    }
  }

  async settleBet(params: SettleBetParams): Promise<WalletResponse> {
    const requestId = uuidv4();
    const { callbackURL, cert } = await this.resolveAgent(params.agentId);
    const url = callbackURL;
    const txTime = new Date().toISOString();

    // Get game payloads from adapter if available
    // Wrap in try-catch to handle errors gracefully (e.g., game not found in DB)
    let gamePayloads: { gameCode: string; [key: string]: any } = { gameCode: params.gameCode };
    if (this.walletApiAdapter) {
      try {
        gamePayloads = await this.walletApiAdapter.getGamePayloads(params.gameCode);
      } catch (error) {
        // Log error but continue with minimal payload
        this.logger.warn(
          `Failed to get game payloads for gameCode=${params.gameCode}, using minimal payload. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fall back to minimal payload (already set above)
      }
    }

    const txn: any = {
      platformTxId: params.platformTxId,
      userId: params.userId,
      ...gamePayloads,
      refPlatformTxId: null,
      settleType: gamePayloads.settleType,
      gameType: gamePayloads.gameType,
      gameCode: gamePayloads.gameCode,
      gameName: gamePayloads.gameName,
      betType: null,
      betAmount: Number(params.betAmount),
      winAmount: Number(params.winAmount),
      betTime: txTime,
      roundId: params.roundId,
    };
    if (params.gameSession) {
      txn.gameInfo = typeof params.gameSession === 'string'
        ? params.gameSession
        : JSON.stringify(params.gameSession);
    }
    const messageObj = { action: 'settle', txns: [txn] };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    const requestStartTime = Date.now();
    this.logger.debug(
      `[WALLET_API_REQUEST] user=${params.userId} agent=${params.agentId} action=settleBet url=${url} txId=${params.platformTxId} betAmount=${params.betAmount} winAmount=${params.winAmount} roundId=${params.roundId} requestId=${requestId}`,
    );
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      const responseTime = Date.now() - requestStartTime;
      const mappedResponse = this.mapAgentResponse((resp as any).data);
      this.logger.log(
        `[WALLET_API_RESPONSE] user=${params.userId} agent=${params.agentId} action=settleBet status=${mappedResponse.status} balance=${mappedResponse.balance} responseTime=${responseTime}ms`,
      );

      // Check if agent rejected the settlement (status !== '0000' means failure)
      if (mappedResponse.status !== '0000') {
        const errorMessage = `Agent rejected settlement with status: ${mappedResponse.status}`;
        const currency = gamePayloads.currency || 'USD';

        // Log to audit first (non-blocking)
        this.walletAuditService.logAudit({
          requestId,
          agentId: params.agentId,
          userId: params.userId,
          apiAction: WalletApiAction.SETTLE_BET,
          status: WalletAuditStatus.FAILURE,
          requestPayload: { messageObj, url },
          requestUrl: url,
          responseData: mappedResponse.raw,
          httpStatus: (resp as any).status,
          responseTime,
          failureType: WalletErrorType.AGENT_REJECTED,
          errorMessage,
          platformTxId: params.platformTxId,
          roundId: params.roundId,
          betAmount: params.betAmount,
          winAmount: params.winAmount,
          currency,
          callbackUrl: url,
        }).then(async (auditRecord) => {
          // Create retry job (non-blocking)
          this.createRetryJobSafely({
            platformTxId: params.platformTxId,
            apiAction: WalletApiAction.SETTLE_BET,
            agentId: params.agentId,
            userId: params.userId,
            requestPayload: { messageObj, url, payload },
            callbackUrl: url,
            roundId: params.roundId,
            betAmount: params.betAmount,
            winAmount: params.winAmount,
            currency,
            gamePayloads,
            walletAuditId: auditRecord?.id,
            errorMessage,
          });
        }).catch((auditError) => {
          this.logger.error(
            `Failed to log audit for settleBet: ${auditError?.message || 'Unknown error'}`,
          );
        });

        throw new InternalServerErrorException(errorMessage);
      }

      // Log success to audit (non-blocking)
      const currency = gamePayloads.currency || 'USD';
      this.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.SETTLE_BET,
        status: WalletAuditStatus.SUCCESS,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData: mappedResponse.raw,
        httpStatus: resp.status,
        responseTime,
        platformTxId: params.platformTxId,
        roundId: params.roundId,
        betAmount: params.betAmount,
        winAmount: params.winAmount,
        currency,
        callbackUrl: url,
      });

      return mappedResponse;
    } catch (err: any) {
      const responseTime = Date.now() - requestStartTime;
      // Get game payloads from adapter if available (with error handling)
      let gamePayloads: { gameCode: string; currency?: string; [key: string]: any } = { gameCode: params.gameCode };
      if (this.walletApiAdapter) {
        try {
          gamePayloads = await this.walletApiAdapter.getGamePayloads(params.gameCode);
        } catch (error) {
          // Log error but continue with minimal payload
          this.logger.warn(
            `Failed to get game payloads for gameCode=${params.gameCode}, using minimal payload. Error: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Fall back to minimal payload (already set above)
        }
      }
      const currency = gamePayloads.currency || 'USD';

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      this.logger.error(
        `[WALLET_API_ERROR] user=${params.userId} agent=${params.agentId} action=settleBet txId=${params.platformTxId} errorType=${errorType} httpStatus=${httpStatus || 'N/A'} responseTime=${responseTime}ms error=${err.message} requestId=${requestId}`,
        err.stack,
      );

      // Log to audit first (non-blocking), then create retry job
      this.walletAuditService.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.SETTLE_BET,
        status: WalletAuditStatus.FAILURE,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData,
        httpStatus,
        responseTime,
        failureType: errorType,
        errorMessage: err.message || 'Unknown error',
        errorStack: err.stack,
        platformTxId: params.platformTxId,
        roundId: params.roundId,
        betAmount: params.betAmount,
        winAmount: params.winAmount,
        currency,
        callbackUrl: url,
        rawError: JSON.stringify(err),
      }).then(async (auditRecord) => {
        // Create retry job (non-blocking)
        this.createRetryJobSafely({
          platformTxId: params.platformTxId,
          apiAction: WalletApiAction.SETTLE_BET,
          agentId: params.agentId,
          userId: params.userId,
          requestPayload: { messageObj, url, payload },
          callbackUrl: url,
          roundId: params.roundId,
          betAmount: params.betAmount,
          winAmount: params.winAmount,
          currency,
          gamePayloads,
          walletAuditId: auditRecord?.id,
          errorMessage: err.message || 'Unknown error',
        });
      }).catch((auditError) => {
        this.logger.error(
          `Failed to log audit for settleBet: ${auditError?.message || 'Unknown error'}`,
        );
      });

      throw err;
    }
  }

  async refundBet(params: RefundBetParams): Promise<WalletResponse> {
    const requestId = uuidv4();
    const { callbackURL, cert } = await this.resolveAgent(params.agentId);
    const url = callbackURL;
    const firstTransaction = params.refundTransactions[0];
    const gameCode = firstTransaction?.gameCode || '';

    // Get game payloads from adapter if available
    // Wrap in try-catch to handle errors gracefully (e.g., game not found in DB)
    let gamePayloads: { gameCode: string; currency?: string; [key: string]: any } = { gameCode };
    if (this.walletApiAdapter && gameCode) {
      try {
        gamePayloads = await this.walletApiAdapter.getGamePayloads(gameCode);
      } catch (error) {
        // Log error but continue with minimal payload
        this.logger.warn(
          `Failed to get game payloads for gameCode=${gameCode}, using minimal payload. Error: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Fall back to minimal payload (already set above)
      }
    }

    const currency = gamePayloads.currency || 'USD';

    // Build transaction array from refund transactions
    const txns = params.refundTransactions.map((refundTxn) => {
      const txn: any = {
        platformTxId: refundTxn.platformTxId,
        userId: params.userId,
        platform: gamePayloads.platform,
        gameType: gamePayloads.gameType,
        gameCode: gamePayloads.gameCode,
        gameName: gamePayloads.gameName,
        betType: null,
        betAmount: Number(refundTxn.betAmount),
        winAmount: Number(refundTxn.winAmount),
        turnover: Number(refundTxn.turnover ?? 0),
        betTime: refundTxn.betTime,
        updateTime: refundTxn.updateTime,
        roundId: refundTxn.roundId,
        refundPlatformTxId: refundTxn.refundPlatformTxId,
      };

      // Add gameInfo if provided
      if (refundTxn.gameInfo) {
        txn.gameInfo = typeof refundTxn.gameInfo === 'string'
          ? refundTxn.gameInfo
          : JSON.stringify(refundTxn.gameInfo);
      }

      return txn;
    });

    const messageObj = { action: 'cancelBet', txns };
    const payload = { key: cert, message: JSON.stringify(messageObj) };
    const requestStartTime = Date.now();
    const txIds = txns.map(t => t.platformTxId).join(',');
    this.logger.debug(
      `[WALLET_API_REQUEST] user=${params.userId} agent=${params.agentId} action=refundBet url=${url} txCount=${txns.length} txIds=[${txIds}] requestId=${requestId}`,
    );
    try {
      const resp = await firstValueFrom(this.http.post<any>(url, payload));
      const responseTime = Date.now() - requestStartTime;
      const mappedResponse = this.mapAgentResponse((resp as any).data);
      this.logger.log(
        `[WALLET_API_RESPONSE] user=${params.userId} agent=${params.agentId} action=refundBet status=${mappedResponse.status} balance=${mappedResponse.balance} txCount=${txns.length} responseTime=${responseTime}ms`,
      );

      // Check if agent rejected the refund (status !== '0000' means failure)
      if (mappedResponse.status !== '0000') {
        const errorMessage = `Agent rejected refund with status: ${mappedResponse.status}`;
        const totalBetAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.betAmount, 0);
        const totalWinAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.winAmount, 0);

        // Log to audit first (non-blocking)
        this.walletAuditService.logAudit({
          requestId,
          agentId: params.agentId,
          userId: params.userId,
          apiAction: WalletApiAction.REFUND_BET,
          status: WalletAuditStatus.FAILURE,
          requestPayload: { messageObj, url },
          requestUrl: url,
          responseData: mappedResponse.raw,
          httpStatus: (resp as any).status,
          responseTime,
          failureType: WalletErrorType.AGENT_REJECTED,
          errorMessage,
          platformTxId: firstTransaction?.platformTxId,
          roundId: firstTransaction?.roundId,
          betAmount: totalBetAmount,
          winAmount: totalWinAmount,
          currency,
          callbackUrl: url,
        }).then(async (auditRecord) => {
          // Create retry job for first transaction (non-blocking)
          if (firstTransaction) {
            this.createRetryJobSafely({
              platformTxId: firstTransaction.platformTxId,
              apiAction: WalletApiAction.REFUND_BET,
              agentId: params.agentId,
              userId: params.userId,
              requestPayload: { messageObj, url, payload, refundTransactions: params.refundTransactions },
              callbackUrl: url,
              roundId: firstTransaction.roundId,
              betAmount: totalBetAmount,
              winAmount: totalWinAmount,
              currency,
              gamePayloads,
              walletAuditId: auditRecord?.id,
              errorMessage,
            });
          }
        }).catch((auditError) => {
          this.logger.error(
            `Failed to log audit for refundBet: ${auditError?.message || 'Unknown error'}`,
          );
        });

        throw new InternalServerErrorException(errorMessage);
      }

      // Log success to audit (non-blocking)
      const totalBetAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.betAmount, 0);
      const totalWinAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.winAmount, 0);
      this.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.REFUND_BET,
        status: WalletAuditStatus.SUCCESS,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData: mappedResponse.raw,
        httpStatus: resp.status,
        responseTime,
        platformTxId: firstTransaction?.platformTxId,
        roundId: firstTransaction?.roundId,
        betAmount: totalBetAmount,
        winAmount: totalWinAmount,
        currency,
        callbackUrl: url,
      });

      return mappedResponse;
    } catch (err: any) {
      const responseTime = Date.now() - requestStartTime;
      const totalBetAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.betAmount, 0);
      const totalWinAmount = params.refundTransactions.reduce((sum, txn) => sum + txn.winAmount, 0);
      this.logger.error(
        `refundBet failed agent=${params.agentId} user=${params.userId} requestId=${requestId}`,
        err,
      );

      // Determine error type
      let errorType = WalletErrorType.UNKNOWN_ERROR;
      let httpStatus: number | undefined;
      let responseData: any = null;

      if (err.response) {
        httpStatus = err.response.status;
        responseData = err.response.data;
        errorType = WalletErrorType.HTTP_ERROR;
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        errorType = WalletErrorType.NETWORK_ERROR;
      } else if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
        errorType = WalletErrorType.TIMEOUT_ERROR;
      }

      // Log to audit first (non-blocking), then create retry job
      this.walletAuditService.logAudit({
        requestId,
        agentId: params.agentId,
        userId: params.userId,
        apiAction: WalletApiAction.REFUND_BET,
        status: WalletAuditStatus.FAILURE,
        requestPayload: { messageObj, url },
        requestUrl: url,
        responseData,
        httpStatus,
        responseTime,
        failureType: errorType,
        errorMessage: err.message || 'Unknown error',
        errorStack: err.stack,
        platformTxId: firstTransaction?.platformTxId,
        roundId: firstTransaction?.roundId,
        betAmount: totalBetAmount,
        winAmount: totalWinAmount,
        currency,
        callbackUrl: url,
        rawError: JSON.stringify(err),
      }).then(async (auditRecord) => {
        // Create retry job for first transaction (non-blocking)
        if (firstTransaction) {
          this.createRetryJobSafely({
            platformTxId: firstTransaction.platformTxId,
            apiAction: WalletApiAction.REFUND_BET,
            agentId: params.agentId,
            userId: params.userId,
            requestPayload: { messageObj, url, payload, refundTransactions: params.refundTransactions },
            callbackUrl: url,
            roundId: firstTransaction.roundId,
            betAmount: totalBetAmount,
            winAmount: totalWinAmount,
            currency,
            gamePayloads,
            walletAuditId: auditRecord?.id,
            errorMessage: err.message || 'Unknown error',
          });
        }
      }).catch((auditError) => {
        this.logger.error(
          `Failed to log audit for refundBet: ${auditError?.message || 'Unknown error'}`,
        );
      });

      throw err;
    }
  }
}
