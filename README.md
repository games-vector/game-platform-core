# @vector-games/game-core

Core game platform services for bet, wallet, and auth management. This package provides reusable components for building game platforms with NestJS.

## Installation

```bash
npm install @vector-games/game-core
```

## Features

### Entities
- **Bet** - Bet entity with `gameMetadata` JSON field for game-specific data
- **User** - User entity with composite primary key `(userId, agentId)`
- **Agents** - Agent/operator entity
- **WalletAudit** - Wallet operation audit entity
- **WalletRetryJob** - Retry job entity for failed wallet operations

### Enums
- **BetStatus** - Bet status enum
- **WalletApiAction** - Wallet operation types
- **WalletErrorType** - Error classification
- **WalletAuditStatus** - Audit status enum
- **WalletRetryJobStatus** - Retry job status enum

### Services
- **UserService** - User CRUD operations
- **AgentsService** - Agent/operator management
- **WalletAuditService** - Wallet operation auditing
- **JwtTokenService** - JWT token management
- **BetService** - Bet lifecycle management with optional game validation
- **WalletService** - Wallet API integration (getBalance, placeBet, settleBet, refundBet)
- **WalletRetryService** - Retry job management with production retry schedule

### Guards
- **AgentAuthGuard** - Agent authentication guard with IP whitelist validation

### Interfaces
- **GameValidationService** - Interface for game validation
- **WalletApiAdapter** - Interface for game payloads in wallet calls
- **IpHeaderConfigProvider** - Interface for IP header configuration

## Usage

### Basic Setup

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { 
  UserModule, 
  AgentsModule, 
  WalletAuditModule,
  JwtTokenModule,
  BetModule,
  WalletModule,
  WalletRetryModule,
  AuthModule
} from '@vector-games/game-core';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // Your database configuration
    }),
    UserModule,
    AgentsModule,
    WalletAuditModule,
    JwtTokenModule.forRoot({
      secret: process.env.JWT_SECRET,
      expiresIn: '24h',
      genericExpiresIn: '1h',
    }),
    BetModule.forFeature(), // or BetModule.forRoot(gameValidationService)
    WalletModule.forFeature(), // or WalletModule.forRoot(walletApiAdapter)
    WalletRetryModule,
    AuthModule.forFeature(), // or AuthModule.forRoot(ipHeaderConfigProvider)
  ],
})
export class AppModule {}
```

### Using Services with Game-Specific Implementations

```typescript
import { Module } from '@nestjs/common';
import { 
  BetModule, 
  WalletModule, 
  AuthModule,
  GameValidationService,
  WalletApiAdapter,
  IpHeaderConfigProvider 
} from '@vector-games/game-core';

// Implement interfaces for your game
class MyGameValidationService implements GameValidationService {
  async validateGame(gameCode: string): Promise<void> {
    // Your game validation logic
    const game = await this.gameRepository.findOne({ where: { gameCode } });
    if (!game || !game.isActive) {
      throw new NotFoundException(`Game ${gameCode} not found or inactive`);
    }
  }
}

class MyWalletApiAdapter implements WalletApiAdapter {
  async getGamePayloads(gameCode: string) {
    const game = await this.gameRepository.findOne({ where: { gameCode } });
    return {
      gameCode: game.gameCode,
      gameName: game.gameName,
      platform: game.platform,
      gameType: game.gameType,
      settleType: game.settleType,
    };
  }
}

class MyIpHeaderConfigProvider implements IpHeaderConfigProvider {
  async getIpHeader(gameCode: string): Promise<string | undefined> {
    const config = await this.configService.get(`games.${gameCode}.ipHeader`);
    return config;
  }
}

@Module({
  imports: [
    BetModule.forRoot(new MyGameValidationService()),
    WalletModule.forRoot(new MyWalletApiAdapter()),
    AuthModule.forRoot(new MyIpHeaderConfigProvider()),
  ],
})
export class AppModule {}
```

### Using Services

```typescript
import { Injectable } from '@nestjs/common';
import { BetService, WalletService, CreateBetParams } from '@vector-games/game-core';

@Injectable()
export class MyService {
  constructor(
    private readonly betService: BetService,
    private readonly walletService: WalletService,
  ) {}

  async placeBet(params: {
    userId: string;
    agentId: string;
    gameCode: string;
    amount: number;
    roundId: string;
    platformTxId: string;
  }) {
    // Place bet via wallet
    const walletResponse = await this.walletService.placeBet({
      agentId: params.agentId,
      userId: params.userId,
      amount: params.amount,
      roundId: params.roundId,
      platformTxId: params.platformTxId,
      gameCode: params.gameCode,
    });

    // Create bet record
    const bet = await this.betService.createPlacement({
      externalPlatformTxId: params.platformTxId,
      userId: params.userId,
      roundId: params.roundId,
      gameMetadata: {
        difficulty: 'EASY', // Game-specific data
        betType: 'NORMAL',
      },
      betAmount: params.amount.toString(),
      currency: 'USD',
      gameCode: params.gameCode,
      createdBy: params.userId,
      operatorId: params.agentId,
    });

    return { bet, walletResponse };
  }
}
```

## Key Design Decisions

1. **Bet Entity Abstraction**: 
   - Game-specific fields (e.g., `difficulty`) moved to `gameMetadata` JSON field
   - Allows games to store any game-specific data without schema changes

2. **Interface-Based Dependencies**:
   - Services depend on interfaces, not concrete implementations
   - Game-specific logic provided via dependency injection

3. **Optional Dependencies**:
   - All game-specific dependencies are optional
   - Modules can be used with or without game-specific implementations

## License

MIT
