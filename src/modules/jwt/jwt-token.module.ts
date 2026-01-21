import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtTokenService, JwtTokenServiceConfig } from '../../services/jwt/jwt-token.service';

@Module({})
export class JwtTokenModule {
  static forRoot(config: JwtTokenServiceConfig): DynamicModule {
    return {
      module: JwtTokenModule,
      global: true, // Make module global so JwtTokenService is available everywhere
      imports: [JwtModule.register({})],
      providers: [
        {
          provide: 'JWT_CONFIG',
          useValue: config,
        },
        JwtTokenService,
      ],
      exports: [JwtTokenService],
    };
  }
}
