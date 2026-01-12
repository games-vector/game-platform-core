import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletAudit } from '../../entities/wallet-audit.entity';
import { WalletAuditService } from '../../services/wallet-audit/wallet-audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([WalletAudit])],
  providers: [WalletAuditService],
  exports: [WalletAuditService],
})
export class WalletAuditModule {}
