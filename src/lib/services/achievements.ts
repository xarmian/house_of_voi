import type { 
  Achievement, 
  ClaimResult, 
  ClaimRequest, 
  AchievementFilter,
  AchievementApiResponse 
} from '$lib/types/achievements';

export class AchievementsService {
  private baseUrl = 'https://achievements.houseofvoi.com/api';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  private getCacheKey(endpoint: string, params?: Record<string, any>): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${endpoint}:${paramStr}`;
  }

  private isValidCache(timestamp: number): boolean {
    return Date.now() - timestamp < this.cacheTTL;
  }

  private async fetchWithCache<T>(
    endpoint: string, 
    options: RequestInit = {}, 
    params?: Record<string, any>
  ): Promise<T> {
    const cacheKey = this.getCacheKey(endpoint, params);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      return cached.data;
    }

    try {
      const url = new URL(`${this.baseUrl}${endpoint}`);
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, String(value));
          }
        });
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache successful responses
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      return data;
    } catch (error) {
      console.error('Achievements API error:', error);
      throw error;
    }
  }

  async getAllAchievements(filter?: AchievementFilter): Promise<Achievement[]> {
    const params: Record<string, any> = {};
    
    if (filter?.category) params.category = filter.category;
    if (filter?.game) params.game = filter.game;
    if (filter?.seriesKey) params.seriesKey = filter.seriesKey;

    const response = await this.fetchWithCache<Achievement[]>('/achievements', {}, params);
    return Array.isArray(response) ? response : [];
  }

  async getPlayerAchievements(account: string, filter?: AchievementFilter): Promise<Achievement[]> {
    if (!account) {
      throw new Error('Account address is required');
    }

    const params: Record<string, any> = { account };
    
    if (filter?.category) params.category = filter.category;
    if (filter?.game) params.game = filter.game;
    if (filter?.seriesKey) params.seriesKey = filter.seriesKey;

    const response = await this.fetchWithCache<Achievement[]>('/achievements', {}, params);
    return Array.isArray(response) ? response : [];
  }

  async getAchievementById(id: string, account?: string): Promise<Achievement | null> {
    const params: Record<string, any> = { id };
    if (account) params.account = account;

    try {
      const response = await this.fetchWithCache<Achievement>('/achievements', {}, params);
      return response || null;
    } catch (error) {
      console.error('Failed to fetch achievement:', error);
      return null;
    }
  }

  async claimAchievements(request: ClaimRequest): Promise<ClaimResult> {
    if (!request.account) {
      throw new Error('Account address is required');
    }

    // Clear cache for this account after claiming
    const cacheKeysToRemove = Array.from(this.cache.keys()).filter(key => 
      key.includes(request.account)
    );
    
    try {
      const response = await fetch(`${this.baseUrl}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`Claim request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as ClaimResult;
      
      // Clear relevant cache entries on successful claim (unless dry run)
      if (!request.dryRun && result.minted.length > 0) {
        cacheKeysToRemove.forEach(key => this.cache.delete(key));
      }
      
      return result;
    } catch (error) {
      console.error('Achievement claim error:', error);
      throw error;
    }
  }

  async validateClaim(account: string, id?: string): Promise<ClaimResult> {
    return this.claimAchievements({ account, id, dryRun: true });
  }

  clearCache(account?: string): void {
    if (account) {
      // Clear cache entries for specific account
      const keysToRemove = Array.from(this.cache.keys()).filter(key => 
        key.includes(account)
      );
      keysToRemove.forEach(key => this.cache.delete(key));
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export const achievementsService = new AchievementsService();