export interface Achievement {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  category?: string;
  seriesKey?: string;
  game?: string;
  owned?: boolean;
  eligible?: boolean;
  display?: {
    category?: string;
    series?: string;
    seriesKey?: string;
    tier?: number;
    tiersTotal?: number;
    order?: number;
    tags?: string[];
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
    color?: string;
    icon?: string;
  };
}

export interface AchievementMetadata {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  display?: {
    rarity?: 'common' | 'rare' | 'epic' | 'legendary';
    color?: string;
    icon?: string;
  };
}

export interface PlayerAchievement extends Achievement {
  owned: true;
  claimedAt?: string;
  progress?: number;
  maxProgress?: number;
}

export interface ClaimResult {
  minted: Achievement[];
  errors: Array<{
    id: string;
    reason: string;
  }>;
}

export interface AchievementApiResponse {
  achievements: Achievement[];
  total: number;
}

export interface ClaimRequest {
  account: string;
  id?: string;
  dryRun?: boolean;
}

export type AchievementCategory = 'wagering' | 'wins' | 'streaks' | 'milestones' | 'special';

export interface AchievementFilter {
  category?: AchievementCategory;
  owned?: boolean;
  game?: string;
  seriesKey?: string;
}

export interface AchievementState {
  allAchievements: Achievement[];
  playerAchievements: PlayerAchievement[];
  availableAchievements: Achievement[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}