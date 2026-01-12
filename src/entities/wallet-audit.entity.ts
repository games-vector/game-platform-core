import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletApiAction, WalletErrorType } from '../enums/wallet.enums';

export enum WalletAuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

/**
 * WalletAudit Entity
 * Tracks all wallet API operations for auditing and debugging
 */
@Entity({ name: 'wallet_audit' })
export class WalletAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ nullable: false })
  agentId: string;

  @Index()
  @Column({ nullable: false })
  userId: string;

  @Index()
  @Column({ nullable: true })
  requestId: string;

  @Column({ type: 'enum', enum: WalletApiAction, nullable: false })
  apiAction: WalletApiAction;

  @Column({ type: 'enum', enum: WalletAuditStatus, nullable: false })
  status: WalletAuditStatus;

  @Column({ type: 'json', nullable: true })
  requestPayload: any;

  @Column({ type: 'text', nullable: true })
  requestUrl: string;

  @Column({ nullable: true, default: 'POST' })
  requestMethod: string;

  @Column({ type: 'json', nullable: true })
  responseData: any;

  @Column({ nullable: true })
  httpStatus: number;

  @Column({ nullable: true })
  responseTime: number;

  @Column({ type: 'enum', enum: WalletErrorType, nullable: true })
  failureType: WalletErrorType;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'text', nullable: true })
  errorStack: string;

  @Index()
  @Column({ nullable: true })
  platformTxId: string;

  @Column({ nullable: true })
  roundId: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  betAmount: string;

  @Column('decimal', { precision: 18, scale: 4, nullable: true })
  winAmount: string;

  @Column({ length: 4, nullable: true })
  currency: string;

  @Column({ type: 'text', nullable: true })
  callbackUrl: string;

  @Column({ type: 'text', nullable: true })
  rawError: string;

  @Column({ nullable: true })
  retryJobId: string;

  @Column({ default: false })
  isRetry: boolean;

  @Column({ nullable: true })
  retryAttempt: number;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true, default: false })
  resolved: boolean;

  @Column({ type: 'datetime', precision: 3, nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string;
}
