import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bet } from '../../entities/bet.entity';
import { BetService, GAME_VALIDATION_SERVICE } from '../../services/bet/bet.service';
import { GameValidationService } from '../../interfaces/game-validation.interface';

@Module({})
export class BetModule {
  /**
   * Register BetModule with optional game validation service
   * @param gameValidationService - Optional game validation service implementation
   */
  static forRoot(gameValidationService?: GameValidationService): DynamicModule {
    const providers: any[] = [BetService];

    if (gameValidationService) {
      providers.push({
        provide: GAME_VALIDATION_SERVICE,
        useValue: gameValidationService,
      });
    }

    return {
      module: BetModule,
      imports: [TypeOrmModule.forFeature([Bet])],
      providers,
      exports: [BetService],
    };
  }

  /**
   * Register BetModule without game validation (validation will be skipped)
   */
  static forFeature(): DynamicModule {
    return {
      module: BetModule,
      imports: [TypeOrmModule.forFeature([Bet])],
      providers: [BetService],
      exports: [BetService],
    };
  }
}
