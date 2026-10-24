export type Category = 'main' | 'side';
export type ProgressMode = 'percent' | 'hours' | 'count' | 'milestones';
export type Intensity = 'light' | 'moderate' | 'deep';

export interface Milestone { id: string; title: string; done: boolean }

export interface Quest {
  id: string;
  title: string;
  description: string;
  category: Category;
  isGlobal: boolean;
  isWeekly: boolean;
  /** Base importance rating chosen by the user (higher = more important). */
  rating: number;
  /** Number of times this quest was carried over a week boundary unfinished. */
  rollovers: number;
  /** Optional total effort estimate in hours. */
  estimateHours?: number;
  /** Optional deadline, YYYY-MM-DD (local). */
  deadline?: string;
  progressMode: ProgressMode;
  percent: number;
  countDone: number;
  countTarget: number;
  countUnit: string;
  milestones: Milestone[];
  preferredSessionMin: number;
  minSessionMin: number;
  intensity: Intensity;
  pausable: boolean;
  xpReward: number;
  crystalReward: number;
  status: 'active' | 'completed' | 'deleted';
  createdAt: string;
  completedAt?: string;
}

export interface WeekEntry {
  questId: string;
  plannedMinutes: number;
  done: boolean;
  doneAt?: string;
  carried?: boolean;
}

export interface Week {
  id: string;
  /** Monday of the week, YYYY-MM-DD (local). */
  weekStart: string;
  status: 'active' | 'upcoming' | 'closed';
  entries: WeekEntry[];
  confirmed: boolean;
  closedAt?: string;
  /** Quest ids that were unfinished when the week closed (kept for history). */
  carriedQuestIds?: string[];
}

export interface TimeLog {
  id: string;
  questId: string;
  date: string;
  minutes: number;
  sessionId?: string;
  note?: string;
  createdAt: string;
}

export interface FreeWindow {
  id: string;
  /** 0 = Monday … 6 = Sunday */
  day: number;
  start: string; // HH:MM
  end: string; // HH:MM
  /** Usable minutes inside the window (defaults to the full window). */
  usableMinutes: number;
  enabled: boolean;
}

export type SessionStatus =
  | 'planned' | 'accepted' | 'completed' | 'incomplete'
  | 'rescheduled' | 'deferred' | 'missed';

export interface Session {
  id: string;
  questId: string;
  weekStart: string;
  windowId: string;
  date: string; // YYYY-MM-DD
  start: string;
  end: string;
  minutes: number;
  status: SessionStatus;
  manual?: boolean;
  reason?: string;
  loggedMinutes?: number;
  rescheduledFrom?: string;
  createdAt: string;
  respondedAt?: string;
}

export interface LedgerEntry {
  id: string;
  /** Idempotency key: an entry with an existing key is never added twice. */
  key: string;
  kind: 'xp' | 'crystal';
  amount: number;
  reason: string;
  at: string;
}

export interface Reward { id: string; name: string; description: string; cost: number; archived?: boolean }
export interface Redemption { id: string; rewardId: string; rewardName: string; cost: number; at: string }

export type ThemeId = 'black' | 'cream' | 'red' | 'forest' | 'midnight';
export interface Settings {
  name: string;
  theme: ThemeId;
  accent: string; // '' = theme default
  /** p in the notebook: the "main quest" point threshold. */
  mainThreshold: number;
  bumpPerRollover: number;
  bumpCap: number;
  selectionMode: 'weighted' | 'top';
  aggregation: 'average' | 'weighted';
  browserNotifications: boolean;
  deferralReasons: string[];
}

export interface AppState {
  schemaVersion: number;
  quests: Quest[];
  weeks: Week[];
  logs: TimeLog[];
  windows: FreeWindow[];
  sessions: Session[];
  ledger: LedgerEntry[];
  rewards: Reward[];
  redemptions: Redemption[];
  settings: Settings;
  plannerSeed: number;
}
