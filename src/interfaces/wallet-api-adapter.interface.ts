/**
 * Wallet API Adapter Interface
 * Implemented by game-specific services to provide game payloads for wallet API calls
 */
export interface WalletApiAdapter {
  /**
   * Get game-specific payloads to include in wallet API calls
   * @param gameCode - The game code
   * @returns Game payloads object (e.g., gameCode, gameName, platform, gameType, settleType)
   */
  getGamePayloads(gameCode: string): Promise<{
    gameCode: string;
    gameName?: string;
    platform?: string;
    gameType?: string;
    settleType?: string;
    [key: string]: any; // Allow any additional game-specific fields
  }>;
}
