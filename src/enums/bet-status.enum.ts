/**
 * BetStatus Enum
 * Represents the current status of a bet
 */
export enum BetStatus {
  PLACED = 'placed',
  PENDING_SETTLEMENT = 'pending_settlement',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  SETTLEMENT_FAILED = 'settlement_failed',
}
