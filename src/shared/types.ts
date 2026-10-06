export type RoomStatus = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'ENDED';
export type CoinType = 'normal' | 'golden';

export interface Position {
  x: number;
  y: number;
}

export interface PlayerState {
  id: string;
  nickname: string;
  color: string;
  x: number;
  y: number;
  score: number;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  radius: number;
  ping: number;
  joinedAt: number;
}

export interface CoinState {
  id: string;
  type: CoinType;
  x: number;
  y: number;
  value: number;
  radius: number;
}

export interface ScoreAchievement {
  playerId: string;
  score: number;
  timestamp: number;
}

export interface PlayerResult {
  id: string;
  nickname: string;
  color: string;
  score: number;
  rank: number;
  isBot: boolean;
}

export interface MatchResults {
  roomCode: string;
  winner: PlayerResult | null;
  tieBreakApplied: boolean;
  leaderboard: PlayerResult[];
  totalCoinsCollected: number;
  matchDurationSeconds: number;
}

export interface GameStateSnapshot {
  roomCode: string;
  status: RoomStatus;
  timeRemaining: number;
  isRushHour: boolean;
  players: PlayerState[];
  coins: CoinState[];
  countdownValue: number;
  results: MatchResults | null;
  timestamp: number;
}

export interface PublicRoomInfo {
  code: string;
  hostNickname: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  isSoloFriendly: boolean;
}

export interface RoomResponse {
  success: boolean;
  roomCode?: string;
  playerId?: string;
  sessionToken?: string;
  isHost?: boolean;
  error?: string;
}

export interface GameEvent {
  type:
    | 'coin_collected'
    | 'countdown'
    | 'rush_hour_start'
    | 'match_started'
    | 'match_ended'
    | 'player_joined'
    | 'player_left'
    | 'host_migrated'
    | 'reconnected';
  data: any;
}
