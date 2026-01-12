import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentAuthGuard, IP_HEADER_CONFIG_PROVIDER } from '../../guards/agent-auth.guard';
import { IpHeaderConfigProvider } from '../../interfaces/ip-header-config.interface';
import { AgentsModule } from '../agents/agents.module';

@Module({})
export class AuthModule {
  /**
   * Register AuthModule with optional IP header config provider
   * @param ipHeaderConfigProvider - Optional IP header config provider implementation
   */
  static forRoot(ipHeaderConfigProvider?: IpHeaderConfigProvider): DynamicModule {
    const providers: any[] = [AgentAuthGuard];

    if (ipHeaderConfigProvider) {
      providers.push({
        provide: IP_HEADER_CONFIG_PROVIDER,
        useValue: ipHeaderConfigProvider,
      });
    }

    return {
      module: AuthModule,
      imports: [ConfigModule, AgentsModule],
      providers,
      exports: [AgentAuthGuard],
    };
  }

  /**
   * Register AuthModule without IP header config provider (uses default headers)
   */
  static forFeature(): DynamicModule {
    return {
      module: AuthModule,
      imports: [ConfigModule, AgentsModule],
      providers: [AgentAuthGuard],
      exports: [AgentAuthGuard],
    };
  }
}
