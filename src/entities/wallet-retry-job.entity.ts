import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletApiAction } from '../enums/wallet.enums';

export enum WalletRetryJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/**
 * WalletRetryJob Entity
 * Tracks failed wallet operations that need to be retried
 */
@Entity({ name: 'wallet_retry_job' })
export class WalletRetryJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: false })
  platformTxId: string;

  @Column({ type: 'enum', enum: WalletApiAction, nullable: false })
  apiAction: WalletApiAction;

  @Column({ type: 'enum', enum: WalletRetryJobStatus, default: WalletRetryJobStatus.PENDING })
  status: WalletRetryJobStatus;

  @Column({ nullable: false, default: 0 })
  retryAttempt: number;

  @Column({ nullable: false })
  maxRetries: number;

  @Index()
  @Column({ type: 'datetime', precision: 3, nullable: false })
  nextRetryAt: Date;

  @Column({ type: 'datetime', precision: 3, nullable: false })
  initialFailureAt: Date;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  lastRetryAt: Date | null;

  @Index()
  @Column({ nullable: false })
  agentId: string;

  @Index()
  @Column({ nullable: false })
  userId: string;

  @Column({ type: 'json', nullable: false })
  requestPayload: any;

  @Column({ type: 'text', nullable: false })
  callbackUrl: string;

  @Column({ nullable: true })
  roundId: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  betAmount: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  winAmount: string;

  @Column({ length: 4, nullable: true })
  currency: string;

  @Column({ type: 'json', nullable: true })
  gamePayloads: any;

  @Column({ nullable: true })
  walletAuditId: string;

  @Column({ nullable: true })
  betId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
