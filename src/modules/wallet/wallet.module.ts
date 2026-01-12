import { DynamicModule, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WalletService, WALLET_API_ADAPTER } from '../../services/wallet/wallet.service';
import { WalletApiAdapter } from '../../interfaces/wallet-api-adapter.interface';
import { AgentsModule } from '../agents/agents.module';
import { WalletAuditModule } from '../wallet-audit/wallet-audit.module';
import { WalletRetryModule } from '../wallet-retry/wallet-retry.module';

@Module({})
export class WalletModule {
  /**
   * Register WalletModule with optional wallet API adapter
   * @param walletApiAdapter - Optional wallet API adapter implementation
   */
  static forRoot(walletApiAdapter?: WalletApiAdapter): DynamicModule {
    const providers: any[] = [WalletService];

    if (walletApiAdapter) {
      providers.push({
        provide: WALLET_API_ADAPTER,
        useValue: walletApiAdapter,
      });
    }

    return {
      module: WalletModule,
      imports: [
        HttpModule,
        AgentsModule,
        WalletAuditModule,
        WalletRetryModule,
      ],
      providers,
      exports: [WalletService],
    };
  }

  /**
   * Register WalletModule without wallet API adapter (gamePayloads will be minimal)
   */
  static forFeature(): DynamicModule {
    return {
      module: WalletModule,
      imports: [
        HttpModule,
        AgentsModule,
        WalletAuditModule,
        WalletRetryModule,
      ],
      providers: [WalletService],
      exports: [WalletService],
    };
  }
}
