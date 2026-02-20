import {
  ConflictException,
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { Bet } from '../../entities/bet.entity';
import { BetStatus } from '../../enums/bet-status.enum';
import { GameValidationService } from '../../interfaces/game-validation.interface';

/**
 * Comprehensive interface for creating a bet with all Bet entity columns
 * All fields except id, createdAt, updatedAt can be provided
 */
export interface CreateBetParams {
  // Required fields
  externalPlatformTxId: string;
  userId: string;
  roundId: string;
  betAmount: string;
  currency: string;
  gameCode: string;
  createdBy: string;
  operatorId: string;

  // Optional fields - all Bet entity columns
  gameMetadata?: {
    difficulty?: string;
    betType?: string;
    [key: string]: any; // Allow any game-specific fields
  };
  winAmount?: string;
  status?: BetStatus;
  settlementRefTxId?: string;
  isPremium?: boolean;
  betPlacedAt?: Date;
  settledAt?: Date;
  gameInfo?: string;
  balanceAfterBet?: string;
  balanceAfterSettlement?: string;
  updatedBy?: string;
  finalCoeff?: string;
  withdrawCoeff?: string;
  fairnessData?: {
    decimal?: string;
    clientSeed?: string;
    serverSeed?: string;
    combinedHash?: string;
    hashedServerSeed?: string;
  };
}

/**
 * Comprehensive interface for settling a bet with all Bet entity columns
 * All fields can be updated during settlement
 */
export interface SettlementParams {
  externalPlatformTxId: string;
  winAmount: string;
  updatedBy: string;

  // All other Bet entity columns that can be updated during settlement
  gameMetadata?: {
    difficulty?: string;
    betType?: string;
    [key: string]: any; // Allow any game-specific fields
  };
  settlementRefTxId?: string;
  settledAt?: Date;
  balanceAfterSettlement?: string;
  gameInfo?: string;
  finalCoeff?: string;
  withdrawCoeff?: string;
  fairnessData?: {
    decimal?: string;
    clientSeed?: string;
    serverSeed?: string;
    combinedHash?: string;
    hashedServerSeed?: string;
  };
  status?: BetStatus; // Allow overriding status if needed
  // Additional fields that might need updating during settlement
  userId?: string;
  roundId?: string;
  betAmount?: string;
  currency?: string;
  gameCode?: string;
  isPremium?: boolean;
  betPlacedAt?: Date;
  balanceAfterBet?: string;
  operatorId?: string;
}

/**
 * Interface for updating bet status
 */
export interface UpdateBetStatusParams {
  externalPlatformTxId: string;
  status: BetStatus;
  updatedBy: string;
}

/**
 * Comprehensive interface for updating any Bet entity column
 * All fields except id, createdAt, updatedAt can be updated
 */
export interface UpdateBetParams {
  externalPlatformTxId: string;
  updatedBy: string;

  // All updatable Bet entity columns
  userId?: string;
  roundId?: string;
  gameMetadata?: {
    difficulty?: string;
    betType?: string;
    [key: string]: any;
  };
  betAmount?: string;
  winAmount?: string;
  currency?: string;
  status?: BetStatus;
  settlementRefTxId?: string;
  isPremium?: boolean;
  betPlacedAt?: Date;
  settledAt?: Date;
  gameCode?: string;
  gameInfo?: string;
  balanceAfterBet?: string;
  balanceAfterSettlement?: string;
  operatorId?: string;
  finalCoeff?: string;
  withdrawCoeff?: string;
  fairnessData?: {
    decimal?: string;
    clientSeed?: string;
    serverSeed?: string;
    combinedHash?: string;
    hashedServerSeed?: string;
  };
}

const ERROR_MESSAGES = {
  BET_EXISTS: 'Bet already exists (idempotent placement)',
  BET_NOT_FOUND: 'Bet not found',
  SETTLEMENT_NOT_FOUND: 'Bet not found for settlement',
} as const;

export const GAME_VALIDATION_SERVICE = Symbol('GameValidationService');

@Injectable()
export class BetService {
  private readonly logger = new Logger(BetService.name);

  constructor(
    @InjectRepository(Bet) private readonly repo: Repository<Bet>,
    @Optional()
    @Inject(GAME_VALIDATION_SERVICE)
    private readonly gameValidationService?: GameValidationService,
  ) {}

  private whereByExternalTx(
    externalPlatformTxId: string,
    gameCode?: string,
  ): FindOptionsWhere<Bet> {
    const where: FindOptionsWhere<Bet> = { externalPlatformTxId };
    if (gameCode) {
      where.gameCode = gameCode;
    }
    return where;
  }

  async createPlacement(params: CreateBetParams): Promise<Bet> {
    // Validate gameCode exists and is active (if validation service is provided)
    if (this.gameValidationService) {
      await this.gameValidationService.validateGame(params.gameCode);
    }

    const existing = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId, params.gameCode),
    });
    if (existing) {
      this.logger.warn(
        `Duplicate bet placement attempt: ${params.externalPlatformTxId}`,
      );
      throw new ConflictException(ERROR_MESSAGES.BET_EXISTS);
    }
    
    // Create entity with all provided fields
    const entity = this.repo.create({
      externalPlatformTxId: params.externalPlatformTxId,
      userId: params.userId,
      roundId: params.roundId,
      gameMetadata: params.gameMetadata,
      betAmount: params.betAmount,
      currency: params.currency,
      gameCode: params.gameCode,
      operatorId: params.operatorId,
      createdBy: params.createdBy,
      updatedBy: params.updatedBy ?? params.createdBy,
      // Optional fields
      winAmount: params.winAmount,
      status: params.status ?? BetStatus.PLACED,
      settlementRefTxId: params.settlementRefTxId,
      isPremium: params.isPremium,
      betPlacedAt: params.betPlacedAt,
      settledAt: params.settledAt,
      gameInfo: params.gameInfo,
      balanceAfterBet: params.balanceAfterBet,
      balanceAfterSettlement: params.balanceAfterSettlement,
      finalCoeff: params.finalCoeff,
      withdrawCoeff: params.withdrawCoeff,
      fairnessData: params.fairnessData,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(
      `Bet placed: ${params.externalPlatformTxId} (game: ${params.gameCode}, user: ${params.userId}, amount: ${params.betAmount})`,
    );
    return saved;
  }

  async recordSettlement(params: SettlementParams): Promise<Bet> {
    const bet = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (!bet) {
      this.logger.warn(
        `Settlement failed: bet not found (${params.externalPlatformTxId})`,
      );
      throw new NotFoundException(ERROR_MESSAGES.SETTLEMENT_NOT_FOUND);
    }

    // Idempotency check: if bet is already settled, return existing bet
    if (bet.status === BetStatus.WON || bet.status === BetStatus.LOST) {
      this.logger.warn(
        `Settlement idempotency: bet already settled (${params.externalPlatformTxId}, status: ${bet.status})`,
      );
      return bet; // Return existing settled bet to prevent double settlement
    }

    // Update all provided fields
    bet.winAmount = params.winAmount;
    bet.updatedBy = params.updatedBy;
    
    // Update optional fields if provided
    if (params.gameMetadata !== undefined) {
      bet.gameMetadata = params.gameMetadata;
    }
    if (params.settlementRefTxId !== undefined) {
      bet.settlementRefTxId = params.settlementRefTxId;
    }
    if (params.settledAt !== undefined) {
      bet.settledAt = params.settledAt;
    } else {
      bet.settledAt = new Date();
    }
    if (params.balanceAfterSettlement !== undefined) {
      bet.balanceAfterSettlement = params.balanceAfterSettlement;
    }
    if (params.gameInfo !== undefined) {
      bet.gameInfo = params.gameInfo;
    }
    if (params.finalCoeff !== undefined) {
      bet.finalCoeff = params.finalCoeff;
    }
    if (params.withdrawCoeff !== undefined) {
      bet.withdrawCoeff = params.withdrawCoeff;
    }
    if (params.fairnessData !== undefined) {
      bet.fairnessData = params.fairnessData;
    }
    
    // Update additional fields if provided
    if (params.userId !== undefined) {
      bet.userId = params.userId;
    }
    if (params.roundId !== undefined) {
      bet.roundId = params.roundId;
    }
    if (params.betAmount !== undefined) {
      bet.betAmount = params.betAmount;
    }
    if (params.currency !== undefined) {
      bet.currency = params.currency;
    }
    if (params.gameCode !== undefined) {
      bet.gameCode = params.gameCode;
    }
    if (params.isPremium !== undefined) {
      bet.isPremium = params.isPremium;
    }
    if (params.betPlacedAt !== undefined) {
      bet.betPlacedAt = params.betPlacedAt;
    }
    if (params.balanceAfterBet !== undefined) {
      bet.balanceAfterBet = params.balanceAfterBet;
    }
    if (params.operatorId !== undefined) {
      bet.operatorId = params.operatorId;
    }

    // Determine status: use provided status or auto-determine based on winAmount
    if (params.status !== undefined) {
      bet.status = params.status;
    } else if (bet.winAmount && Number(bet.winAmount) > 0) {
      bet.status = BetStatus.WON;
    } else {
      bet.status = BetStatus.LOST;
    }

    const settled = await this.repo.save(bet);
    this.logger.log(
      `Bet settled: ${params.externalPlatformTxId} (status: ${bet.status}, win: ${params.winAmount})`,
    );
    return settled;
  }

  async updateStatus(params: UpdateBetStatusParams): Promise<Bet> {
    const bet = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (!bet) {
      this.logger.warn(
        `Status update failed: bet not found (${params.externalPlatformTxId})`,
      );
      throw new NotFoundException(ERROR_MESSAGES.BET_NOT_FOUND);
    }
    bet.status = params.status;
    bet.updatedBy = params.updatedBy;
    return this.repo.save(bet);
  }

  /**
   * Comprehensive update method that allows updating any Bet entity column
   * @param params - Update parameters with externalPlatformTxId, updatedBy, and any fields to update
   * @returns Updated Bet entity
   */
  async updateBet(params: UpdateBetParams): Promise<Bet> {
    const bet = await this.repo.findOne({
      where: this.whereByExternalTx(params.externalPlatformTxId),
    });
    if (!bet) {
      this.logger.warn(
        `Bet update failed: bet not found (${params.externalPlatformTxId})`,
      );
      throw new NotFoundException(ERROR_MESSAGES.BET_NOT_FOUND);
    }

    // Update all provided fields
    bet.updatedBy = params.updatedBy;

    if (params.userId !== undefined) {
      bet.userId = params.userId;
    }
    if (params.roundId !== undefined) {
      bet.roundId = params.roundId;
    }
    if (params.gameMetadata !== undefined) {
      bet.gameMetadata = params.gameMetadata;
    }
    if (params.betAmount !== undefined) {
      bet.betAmount = params.betAmount;
    }
    if (params.winAmount !== undefined) {
      bet.winAmount = params.winAmount;
    }
    if (params.currency !== undefined) {
      bet.currency = params.currency;
    }
    if (params.status !== undefined) {
      bet.status = params.status;
    }
    if (params.settlementRefTxId !== undefined) {
      bet.settlementRefTxId = params.settlementRefTxId;
    }
    if (params.isPremium !== undefined) {
      bet.isPremium = params.isPremium;
    }
    if (params.betPlacedAt !== undefined) {
      bet.betPlacedAt = params.betPlacedAt;
    }
    if (params.settledAt !== undefined) {
      bet.settledAt = params.settledAt;
    }
    if (params.gameCode !== undefined) {
      bet.gameCode = params.gameCode;
    }
    if (params.gameInfo !== undefined) {
      bet.gameInfo = params.gameInfo;
    }
    if (params.balanceAfterBet !== undefined) {
      bet.balanceAfterBet = params.balanceAfterBet;
    }
    if (params.balanceAfterSettlement !== undefined) {
      bet.balanceAfterSettlement = params.balanceAfterSettlement;
    }
    if (params.operatorId !== undefined) {
      bet.operatorId = params.operatorId;
    }
    if (params.finalCoeff !== undefined) {
      bet.finalCoeff = params.finalCoeff;
    }
    if (params.withdrawCoeff !== undefined) {
      bet.withdrawCoeff = params.withdrawCoeff;
    }
    if (params.fairnessData !== undefined) {
      bet.fairnessData = params.fairnessData;
    }

    const updated = await this.repo.save(bet);
    this.logger.log(
      `Bet updated: ${params.externalPlatformTxId}`,
    );
    return updated;
  }

  async markPendingSettlement(
    externalPlatformTxId: string,
    updatedBy: string,
  ): Promise<Bet> {
    return this.updateStatus({
      externalPlatformTxId,
      status: BetStatus.PENDING_SETTLEMENT,
      updatedBy,
    });
  }

  async markSettlementFailed(
    externalPlatformTxId: string,
    updatedBy: string,
  ): Promise<Bet> {
    return this.updateStatus({
      externalPlatformTxId,
      status: BetStatus.SETTLEMENT_FAILED,
      updatedBy,
    });
  }

  async getByExternalTxId(externalPlatformTxId: string, gameCode?: string): Promise<Bet | null> {
    return this.repo.findOne({
      where: this.whereByExternalTx(externalPlatformTxId, gameCode),
    });
  }

  async findBetByRoundId(gameCode: string, roundId: string): Promise<Bet | null> {
    return this.repo.findOne({
      where: { gameCode, roundId },
    });
  }

  async findBetByPlatformTxId(gameCode: string, externalPlatformTxId: string): Promise<Bet | null> {
    return this.repo.findOne({
      where: { gameCode, externalPlatformTxId },
    });
  }

  async listUserBets(userId: string, gameCode?: string, limit: number = 100): Promise<Bet[]> {
    const where: FindOptionsWhere<Bet> = { userId };
    if (gameCode) {
      where.gameCode = gameCode;
    }
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listUserBetsByTimeRange(
    userId: string,
    startTime: Date,
    endTime: Date,
    gameCode?: string,
    limit: number = 100,
  ): Promise<Bet[]> {
    const where: FindOptionsWhere<Bet> = {
      userId,
      createdAt: Between(startTime, endTime),
    };
    if (gameCode) {
      where.gameCode = gameCode;
    }
    return this.repo.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async listByRound(gameCode: string, roundId: string): Promise<Bet[]> {
    return this.repo.find({ where: { gameCode, roundId } });
  }

  async deletePlacedBets(): Promise<number> {
    const result = await this.repo.delete({ status: BetStatus.PLACED });
    const count = result.affected || 0;
    if (count > 0) {
      this.logger.log(`Deleted ${count} placed bets`);
    }
    return count;
  }

  /**
   * Find all PLACED bets that are older than the specified time threshold
   * Checks both betPlacedAt and createdAt to handle cases where betPlacedAt might be null
   * @param olderThanMs - Time threshold in milliseconds
   * @returns Array of bets that need to be refunded
   */
  async findOldPlacedBets(olderThanMs: number): Promise<Bet[]> {
    const thresholdDate = new Date(Date.now() - olderThanMs);
    return this.repo
      .createQueryBuilder('bet')
      .where('bet.status = :status', { status: BetStatus.PLACED })
      .andWhere(
        '(bet.betPlacedAt < :threshold OR (bet.betPlacedAt IS NULL AND bet.createdAt < :threshold))',
        { threshold: thresholdDate },
      )
      .getMany();
  }

  /**
   * Delete all bets older than the specified date
   * @param beforeDate - Delete bets created before this date
   * @returns Number of bets deleted
   */
  async deleteBetsBeforeDate(beforeDate: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(Bet)
      .where('createdAt < :beforeDate', { beforeDate })
      .execute();

    const count = result.affected || 0;
    this.logger.log(
      `Deleted ${count} bet(s) created before ${beforeDate.toISOString()}`,
    );
    return count;
  }
}
