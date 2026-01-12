import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletRetryJob } from '../../entities/wallet-retry-job.entity';
import { WalletRetryService } from '../../services/wallet-retry/wallet-retry.service';

@Module({
  imports: [TypeOrmModule.forFeature([WalletRetryJob])],
  providers: [WalletRetryService],
  exports: [WalletRetryService],
})
export class WalletRetryModule {}
