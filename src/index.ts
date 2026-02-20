/**
 * @vector-games/game-core
 * Core game platform services for bet, wallet, and auth management
 */

// Entities
export { Bet } from './entities/bet.entity';
export { User } from './entities/user.entity';
export { Agents } from './entities/agents.entity';
export { WalletAudit, WalletAuditStatus } from './entities/wallet-audit.entity';
export { WalletRetryJob, WalletRetryJobStatus } from './entities/wallet-retry-job.entity';

// Enums
export { BetStatus } from './enums/bet-status.enum';
export { WalletApiAction, WalletErrorType } from './enums/wallet.enums';

// Services
export { UserService, CreateUserParams, UpdateUserParams } from './services/user/user.service';
export { AgentsService, CreateAgentParams, UpdateAgentParams } from './services/agents/agents.service';
export { WalletAuditService, CreateWalletAuditParams } from './services/wallet-audit/wallet-audit.service';
export { JwtTokenService, UserTokenPayload, JwtTokenServiceConfig } from './services/jwt/jwt-token.service';
export {
  BetService,
  CreateBetParams,
  SettlementParams,
  UpdateBetStatusParams,
  UpdateBetParams,
} from './services/bet/bet.service';
export {
  WalletService,
  WalletResponse,
  PlaceBetParams,
  SettleBetParams,
  RefundBetParams,
  RefundTransaction,
} from './services/wallet/wallet.service';
export {
  WalletRetryService,
  CreateRetryJobParams,
} from './services/wallet-retry/wallet-retry.service';

// Modules
export { UserModule } from './modules/user/user.module';
export { AgentsModule } from './modules/agents/agents.module';
export { WalletAuditModule } from './modules/wallet-audit/wallet-audit.module';
export { JwtTokenModule } from './modules/jwt/jwt-token.module';
export { BetModule } from './modules/bet/bet.module';
export { WalletModule } from './modules/wallet/wallet.module';
export { WalletRetryModule } from './modules/wallet-retry/wallet-retry.module';
export { AuthModule } from './modules/auth/auth.module';

// Guards
export { AgentAuthGuard } from './guards/agent-auth.guard';

// Interfaces
export { GameValidationService } from './interfaces/game-validation.interface';
export { WalletApiAdapter } from './interfaces/wallet-api-adapter.interface';
export { IpHeaderConfigProvider } from './interfaces/ip-header-config.interface';