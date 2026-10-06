export const GAME_CONSTANTS = {
  ARENA_WIDTH: 800,
  ARENA_HEIGHT: 500,
  PLAYER_RADIUS: 18,
  COIN_RADIUS: 10,
  NORMAL_COIN_VALUE: 1,
  GOLDEN_COIN_VALUE: 3,
  GOLDEN_COIN_PROBABILITY: 0.15,
  INITIAL_COINS: 15,
  MAX_COINS: 25,
  MATCH_DURATION_SECONDS: 60,
  RUSH_HOUR_THRESHOLD_SECONDS: 15,
  COUNTDOWN_SECONDS: 3,
  SERVER_TICK_RATE: 30, // 30 updates per second
  MOVEMENT_SPEED: 8,
  RECONNECT_GRACE_MS: 30_000,
  MOVE_RATE_LIMIT_PER_SEC: 30,
  MIN_PLAYERS_TO_START: 2,
  MAX_PLAYERS: 6,
  PLAYER_COLORS: [
    '#00f0ff', // Cyber cyan
    '#ff0077', // Neon magenta
    '#39ff14', // Electric green
    '#ffb800', // Neon amber
    '#bd00ff', // Vivid purple
    '#ff4500', // Blaze orange
  ],
} as const;
