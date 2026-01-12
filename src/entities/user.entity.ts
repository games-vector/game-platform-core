import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * User Entity
 * Represents a user in the game platform
 * Composite primary key: (userId, agentId)
 */
@Entity()
export class User {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  agentId: string;

  @Column()
  currency: string;

  @Column({ nullable: true })
  language?: string;

  @Column({ nullable: true })
  username?: string;

  @Column()
  betLimit: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  passwordHash?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  createdBy?: string;

  @Column({ nullable: true })
  updatedBy?: string;
}
