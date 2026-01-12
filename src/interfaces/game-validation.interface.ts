/**
 * Game Validation Service Interface
 * Implemented by game-specific services to validate game codes
 */
export interface GameValidationService {
  /**
   * Validate that a game code exists and is active
   * @param gameCode - The game code to validate
   * @throws NotFoundException if game doesn't exist or is not active
   */
  validateGame(gameCode: string): Promise<void>;
}
