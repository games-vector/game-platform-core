/**
 * IP Header Configuration Provider Interface
 * Implemented by game-specific services to provide IP header configuration
 */
export interface IpHeaderConfigProvider {
  /**
   * Get the configured IP header name for a game
   * @param gameCode - The game code
   * @returns The IP header name (e.g., 'x-real-ip', 'x-forwarded-for') or undefined to use default
   */
  getIpHeader(gameCode: string): Promise<string | undefined>;
}
