import type { Achievement, NextAchievementProgress } from '$lib/types/achievements';

/**
 * Finds the next eligible achievement in a series that the user can work toward
 * Returns the achievement with progress if available, null if all are complete or none eligible
 */
export function findNextAchievementInSeries(achievements: Achievement[]): Achievement | null {
  if (!achievements || achievements.length === 0) return null;

  // Sort by tier first, then order, to ensure proper progression
  const sortedAchievements = [...achievements].sort((a, b) => {
    const tierA = a.display?.tier || 999;
    const tierB = b.display?.tier || 999;
    if (tierA !== tierB) return tierA - tierB;
    
    const orderA = a.display?.order || 999;
    const orderB = b.display?.order || 999;
    return orderA - orderB;
  });

  // Find the first unowned achievement with progress
  for (const achievement of sortedAchievements) {
    if (!achievement.eligible && typeof achievement.progress === 'number' && achievement.progress > 0) {
      return achievement;
    }
  }

  // If no achievement has progress, find the next eligible one
  return sortedAchievements.find(achievement => 
    !achievement.owned && achievement.eligible
  ) || null;
}

/**
 * Gets progress information for the next achievements grouped by series
 */
export function getNextAchievementProgress(allAchievements: Achievement[]): Map<string, NextAchievementProgress> {
  const progressMap = new Map<string, NextAchievementProgress>();
  
  // Group achievements by series
  const seriesGroups = new Map<string, Achievement[]>();
  
  for (const achievement of allAchievements) {
    const seriesKey = achievement.display?.seriesKey || achievement.seriesKey || 'standalone';
    if (!seriesGroups.has(seriesKey)) {
      seriesGroups.set(seriesKey, []);
    }
    seriesGroups.get(seriesKey)!.push(achievement);
  }

  // Find next achievement for each series
  for (const [seriesKey, achievements] of seriesGroups) {
    const nextAchievement = findNextAchievementInSeries(achievements);
    
    if (nextAchievement && typeof nextAchievement.progress === 'number') {
      const category = nextAchievement.display?.category || nextAchievement.category || 'general';
      
      progressMap.set(seriesKey, {
        achievement: nextAchievement,
        progress: nextAchievement.progress,
        category,
        seriesKey
      });
    }
  }

  return progressMap;
}

/**
 * Formats progress as a percentage for display
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

/**
 * Determines if progress should show the "near completion" animation (90%+)
 */
export function isNearCompletion(progress: number): boolean {
  return progress >= 0.9;
}

/**
 * Gets the appropriate progress color based on completion level
 */
export function getProgressColor(progress: number): string {
  if (progress >= 0.9) {
    return '#ffc107'; // Gold for near completion
  } else if (progress >= 0.5) {
    return '#10b981'; // Green for good progress
  } else {
    return '#6b7280'; // Gray for early progress
  }
}

/**
 * Calculates the overall series completion rate including current progress
 */
export function getSeriesCompletionWithProgress(achievements: Achievement[]): number {
  if (achievements.length === 0) return 0;

  let totalProgress = 0;
  for (const achievement of achievements) {
    if (achievement.eligible) {
      totalProgress += 1; // Complete achievements count as 1
    } else if (typeof achievement.progress === 'number') {
      totalProgress += achievement.progress; // Partial progress
    }
    // Unstarted achievements add 0
  }

  return Math.min(totalProgress / achievements.length, 1); // Cap at 100%
}