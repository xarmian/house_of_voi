// Contract Data Cache Service
// Caches paylines and multiplier data to avoid repeated contract calls

import { CONTRACT } from 'ulujs';
import algosdk from 'algosdk';
import { NETWORK_CONFIG, CONTRACT_CONFIG } from '$lib/constants/network';
import { oddsCalculator, type OddsCalculationResult } from './oddsCalculator';

// Import the actual ABI from SlotMachineClient like React component does
import { APP_SPEC as SlotMachineAppSpec } from '../../clients/SlotMachineClient.js';

// Create a read-only account for contract calls
const readOnlyAccount = {
  addr: 'H7W63MIQJMYBOEYPM5NJEGX3P54H54RZIV2G3OQ2255AULG6U74BE5KFC4',
  sk: new Uint8Array(0) // Empty private key for read-only
};

// Slot Machine ABI for ulujs - use the real ABI like React component
const slotMachineABI = {
  name: "Slot Machine",
  desc: "A simple slot machine game",
  methods: SlotMachineAppSpec.contract.methods, // Use actual methods from generated client
  events: [
    {
      name: "BetPlaced",
      args: [
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" }
      ]
    },
    {
      name: "BetClaimed", 
      args: [
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" }
      ]
    }
  ]
};

export interface CachedPaylines {
  data: number[][];
  timestamp: number;
}

export interface CachedMultiplier {
  data: number;
  timestamp: number;
  symbol: string;
  count: number;
}

export interface CachedReelData {
  reelData: string;
  reelLength: number;
  reelCount: number;
  windowLength: number;
  timestamp: number;
}

interface CacheStorage {
  paylines: CachedPaylines | null;
  multipliers: { [key: string]: CachedMultiplier };
  reelData: CachedReelData | null;
  odds: OddsCalculationResult | null;
  version: string | null; // Contract version when cache was created
}

export class ContractDataCache {
  private readonly CACHE_KEY = 'voi_contract_data_cache';
  private readonly CACHE_DURATION: number;
  private cache: CacheStorage = {
    paylines: null,
    multipliers: {},
    reelData: null,
    odds: null,
    version: null
  };
  private client: algosdk.Algodv2;
  private appId: number;
  private isPreloading = false; // Prevent concurrent preload operations

  constructor() {
    this.client = new algosdk.Algodv2(
      NETWORK_CONFIG.token || '',
      NETWORK_CONFIG.nodeUrl || '',
      NETWORK_CONFIG.port
    );
    this.appId = CONTRACT_CONFIG.slotMachineAppId;
    this.CACHE_DURATION = CONTRACT_CONFIG.cacheDuration;
    this.loadFromStorage();
  }

  /**
   * Load cached data from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        this.cache = JSON.parse(cached);
        this.cleanupExpired();
      }
    } catch (error) {
      console.warn('Failed to load contract data cache:', error);
      this.cache = { paylines: null, multipliers: {}, reelData: null, odds: null, version: null };
    }
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.warn('Failed to save contract data cache:', error);
    }
  }

  /**
   * Remove expired cache entries
   */
  private cleanupExpired(): void {
    const now = Date.now();

    // Check paylines cache
    if (this.cache.paylines && now - this.cache.paylines.timestamp > this.CACHE_DURATION) {
      this.cache.paylines = null;
    }

    // Check reel data cache
    if (this.cache.reelData && now - this.cache.reelData.timestamp > this.CACHE_DURATION) {
      this.cache.reelData = null;
    }

    // Check odds cache
    if (this.cache.odds && now - this.cache.odds.calculatedAt > this.CACHE_DURATION) {
      this.cache.odds = null;
    }

    // Check multipliers cache
    Object.keys(this.cache.multipliers).forEach(key => {
      const multiplier = this.cache.multipliers[key];
      if (now - multiplier.timestamp > this.CACHE_DURATION) {
        delete this.cache.multipliers[key];
      }
    });
  }

  /**
   * Generate cache key for multiplier
   */
  private getMultiplierKey(symbol: string, count: number): string {
    return `${symbol}_${count}`;
  }

  /**
   * Check if cached data is valid
   */
  private isValidCache(timestamp: number): boolean {
    // Check version first - if contract version changed, cache is invalid
    if (this.cache.version !== CONTRACT_CONFIG.version) {
      console.log(`🔄 Contract version changed from ${this.cache.version} to ${CONTRACT_CONFIG.version}, invalidating cache`);
      return false;
    }
    
    // Then check time-based expiration
    return Date.now() - timestamp < this.CACHE_DURATION;
  }
  
  /**
   * Update cache version to current contract version
   */
  private updateCacheVersion(): void {
    this.cache.version = CONTRACT_CONFIG.version;
  }

  /**
   * Fetch paylines directly from contract
   */
  private async fetchPaylinesFromContract(address: string): Promise<number[][]> {
    // Create Ulujs CONTRACT instance
    const ci = new CONTRACT(
      this.appId,
      this.client,
      undefined, // Use undefined for indexer
      slotMachineABI,
      readOnlyAccount
    );

    // Configure CONTRACT instance 
    ci.setEnableRawBytes(true);
    
    // Call get_paylines method - gets return value without submitting
    const result = await ci.get_paylines();

    // Convert BigInt array to number array and reshape to paylines
    const flatPaylines = (result.returnValue as bigint[]).map(x => Number(x));
    
    // Convert flat array to 2D array (assuming 20 paylines with 5 positions each)
    const paylines: number[][] = [];
    for (let i = 0; i < flatPaylines.length; i += 5) {
      paylines.push(flatPaylines.slice(i, i + 5));
    }

    return paylines;
  }

  /**
   * Fetch reel data directly from contract
   */
  private async fetchReelDataFromContract(address: string): Promise<{
    reelData: string;
    reelLength: number;
    reelCount: number;
    windowLength: number;
  }> {

    // Create Ulujs CONTRACT instance
    const ci = new CONTRACT(
      this.appId,
      this.client,
      undefined,
      slotMachineABI,
      readOnlyAccount
    );

    ci.setEnableRawBytes(true);

    // Get all reel data in parallel
    const [reelsResult, reelLengthResult, reelCountResult] = await Promise.all([
      ci.get_reels(),
      ci.get_reel_length(), 
      ci.get_reel_count()
    ]);

    if (!reelsResult.success || !reelLengthResult.success || !reelCountResult.success) {
      throw new Error('Failed to fetch reel data from contract');
    }

    // Convert bytes to string
    const reelBytes = new Uint8Array(reelsResult.returnValue);
    const reelData = Array.from(reelBytes).map(byte => String.fromCharCode(byte)).join('');
    
    const reelLength = Number(reelLengthResult.returnValue);
    const reelCount = Number(reelCountResult.returnValue);
    const windowLength = 3; // Standard window length

    return { reelData, reelLength, reelCount, windowLength };
  }

  /**
   * Fetch payout multiplier directly from contract
   */
  private async fetchMultiplierFromContract(symbol: string, count: number, address: string): Promise<number> {
    // Create Ulujs CONTRACT instance
    const ci = new CONTRACT(
      this.appId,
      this.client,
      undefined, // Use undefined for indexer
      slotMachineABI,
      readOnlyAccount
    );

    // Configure CONTRACT instance 
    ci.setEnableRawBytes(true);
    
    // Convert symbol to byte
    const symbolByte = new TextEncoder().encode(symbol)[0];

    // Call get_payout_multiplier method - gets return value without submitting
    const result = await ci.get_payout_multiplier(symbolByte, BigInt(count));

    return Number(result.returnValue);
  }

  /**
   * Get cached paylines or fetch from contract
   */
  async getPaylines(address: string): Promise<number[][]> {
    // Check cache first
    if (this.cache.paylines && this.isValidCache(this.cache.paylines.timestamp)) {
      console.log('📦 Using cached paylines data');
      return this.cache.paylines.data;
    }

    // Cache miss - fetch from contract
    console.log('🔄 Fetching paylines from contract');
    try {
      const paylines = await this.fetchPaylinesFromContract(address);
      
      // Cache the result
      this.cache.paylines = {
        data: paylines,
        timestamp: Date.now()
      };
      this.updateCacheVersion();
      this.saveToStorage();

      return paylines;
    } catch (error) {
      console.error('Failed to fetch paylines from contract:', error);
      // Return cached data even if expired as fallback
      if (this.cache.paylines) {
        console.log('⚠️ Using expired cached paylines as fallback');
        return this.cache.paylines.data;
      }
      throw error;
    }
  }

  /**
   * Get cached reel data or fetch from contract
   */
  async getReelData(address: string): Promise<{
    reelData: string;
    reelLength: number;
    reelCount: number;
    windowLength: number;
  }> {
    // Check cache first
    if (this.cache.reelData && this.isValidCache(this.cache.reelData.timestamp)) {
      console.log('📦 Using cached reel data');
      return {
        reelData: this.cache.reelData.reelData,
        reelLength: this.cache.reelData.reelLength,
        reelCount: this.cache.reelData.reelCount,
        windowLength: this.cache.reelData.windowLength,
      };
    }

    // Cache miss - fetch from contract
    console.log('🔄 Fetching reel data from contract');
    try {
      const reelData = await this.fetchReelDataFromContract(address);
      
      // Cache the result
      this.cache.reelData = {
        ...reelData,
        timestamp: Date.now()
      };
      this.updateCacheVersion();
      this.saveToStorage();

      console.log('✅ Fetched and cached reel data:', {
        reelDataLength: reelData.reelData.length,
        reelLength: reelData.reelLength,
        reelCount: reelData.reelCount,
        windowLength: reelData.windowLength
      });

      return reelData;
    } catch (error) {
      console.error('Failed to fetch reel data from contract:', error);
      // Return cached data even if expired as fallback
      if (this.cache.reelData) {
        console.log('⚠️ Using expired cached reel data as fallback');
        return {
          reelData: this.cache.reelData.reelData,
          reelLength: this.cache.reelData.reelLength,
          reelCount: this.cache.reelData.reelCount,
          windowLength: this.cache.reelData.windowLength,
        };
      }
      throw error;
    }
  }

  /**
   * Get cached payout multiplier or fetch from contract
   */
  async getPayoutMultiplier(symbol: string, count: number, address: string): Promise<number> {
    const cacheKey = this.getMultiplierKey(symbol, count);

    // Check cache first
    if (this.cache.multipliers[cacheKey] && 
        this.isValidCache(this.cache.multipliers[cacheKey].timestamp)) {
      console.log(`📦 Using cached multiplier for ${symbol}x${count}`);
      return this.cache.multipliers[cacheKey].data;
    }

    // Cache miss - fetch from contract
    console.log(`🔄 Fetching multiplier for ${symbol}x${count} from contract`);
    try {
      const multiplier = await this.fetchMultiplierFromContract(symbol, count, address);
      
      // Cache the result
      this.cache.multipliers[cacheKey] = {
        data: multiplier,
        timestamp: Date.now(),
        symbol: symbol,
        count: count
      };
      this.updateCacheVersion();
      this.saveToStorage();

      return multiplier;
    } catch (error) {
      console.error(`Failed to fetch multiplier for ${symbol}x${count} from contract:`, error);
      // Return cached data even if expired as fallback
      if (this.cache.multipliers[cacheKey]) {
        console.log(`⚠️ Using expired cached multiplier for ${symbol}x${count} as fallback`);
        return this.cache.multipliers[cacheKey].data;
      }
      throw error;
    }
  }

  /**
   * Pre-load common contract data for faster gameplay
   */
  async preloadContractData(address: string): Promise<void> {
    // Prevent concurrent preload operations
    if (this.isPreloading) {
      console.log('⏳ Contract data preload already in progress, skipping...');
      return;
    }

    // Check if we already have recent cached data
    if (this.cache.paylines && this.isValidCache(this.cache.paylines.timestamp)) {
      console.log('📦 Contract data already cached and valid, skipping preload');
      return;
    }

    this.isPreloading = true;
    console.log('🚀 Pre-loading contract data...');
    
    try {
      // Pre-load paylines and reel data in parallel
      await Promise.all([
        this.getPaylines(address),
        this.getReelData(address)
      ]);

      // Pre-load common payout multipliers in parallel
      const symbols = ['A', 'B', 'C', 'D'];
      const counts = [3, 4, 5];
      
      const multiplierPromises: Promise<number>[] = [];
      
      symbols.forEach(symbol => {
        counts.forEach(count => {
          multiplierPromises.push(this.getPayoutMultiplier(symbol, count, address));
        });
      });

      await Promise.all(multiplierPromises);
      
      console.log('✅ Contract data pre-loading completed');
    } catch (error) {
      console.error('❌ Contract data pre-loading failed:', error);
      // Don't throw - pre-loading failure shouldn't block the app
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Get cached win odds or calculate them from current data
   */
  async getWinOdds(address: string): Promise<OddsCalculationResult | null> {
    // Check cache first
    if (this.cache.odds && this.isValidCache(this.cache.odds.calculatedAt)) {
      console.log('📦 Using cached odds data');
      return this.cache.odds;
    }

    // Need fresh data to calculate odds
    try {
      console.log('🔄 Calculating new odds from current data');
      
      // Get all required data in parallel
      const [paylines, reelData] = await Promise.all([
        this.getPaylines(address),
        this.getReelData(address)
      ]);

      // Ensure we have all multipliers
      const symbols = ['A', 'B', 'C', 'D'];
      const counts = [3, 4, 5];
      
      const multiplierPromises: Promise<number>[] = [];
      
      symbols.forEach(symbol => {
        counts.forEach(count => {
          multiplierPromises.push(this.getPayoutMultiplier(symbol, count, address));
        });
      });

      await Promise.all(multiplierPromises);

      // Calculate odds
      const odds = oddsCalculator.calculateOdds(reelData, this.cache.multipliers, paylines);
      
      // Cache the result
      this.cache.odds = odds;
      this.updateCacheVersion();
      this.saveToStorage();

      return odds;
    } catch (error) {
      console.error('Failed to calculate odds:', error);
      // Return cached data even if expired as fallback
      if (this.cache.odds) {
        console.log('⚠️ Using expired cached odds as fallback');
        return this.cache.odds;
      }
      return null;
    }
  }

  /**
   * Force recalculation of odds (clears cache)
   */
  async recalculateOdds(address: string): Promise<OddsCalculationResult | null> {
    this.cache.odds = null;
    return this.getWinOdds(address);
  }

  /**
   * Get a quick odds summary for display
   */
  async getOddsSummary(address: string): Promise<{
    rtpPercentage: string;
    hitFrequency: string;
    mostLikelyWin: string;
    bestPayout: string;
  } | null> {
    const odds = await this.getWinOdds(address);
    if (!odds) return null;
    
    return oddsCalculator.getOddsSummary(odds);
  }

  /**
   * Calculate odds for a specific bet
   */
  async calculateBetOdds(
    address: string,
    betPerLine: number,
    selectedPaylines: number
  ): Promise<{
    expectedReturn: number;
    expectedLoss: number;
    breakEvenProbability: number;
  } | null> {
    const odds = await this.getWinOdds(address);
    if (!odds) return null;
    
    return oddsCalculator.calculateBetOdds(odds, betPerLine, selectedPaylines);
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache = { paylines: null, multipliers: {}, reelData: null, odds: null, version: null };
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.CACHE_KEY);
    }
    console.log('🧹 Contract data cache cleared');
  }
  
  /**
   * Force refresh all cached data - useful when contract is updated
   */
  async forceRefresh(address: string): Promise<void> {
    console.log('🔄 Force refreshing all contract data...');
    this.clearCache();
    
    // Pre-load fresh data
    await this.preloadContractData(address);
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { 
    paylinesCached: boolean; 
    reelDataCached: boolean; 
    multipliersCached: number; 
    oddsCached: boolean;
    cacheSize: string;
    cacheVersion: string | null;
    contractVersion: string;
    cacheDuration: number;
  } {
    const stats = {
      paylinesCached: this.cache.paylines !== null,
      reelDataCached: this.cache.reelData !== null,
      multipliersCached: Object.keys(this.cache.multipliers).length,
      oddsCached: this.cache.odds !== null,
      cacheSize: typeof window !== 'undefined' 
        ? `${(new Blob([JSON.stringify(this.cache)]).size / 1024).toFixed(2)} KB`
        : '0 KB',
      cacheVersion: this.cache.version,
      contractVersion: CONTRACT_CONFIG.version,
      cacheDuration: this.CACHE_DURATION
    };
    
    return stats;
  }
}

// Create and export singleton instance
export const contractDataCache = new ContractDataCache();

// Add debug methods to window for development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).contractCache = {
    stats: () => contractDataCache.getCacheStats(),
    clear: () => contractDataCache.clearCache(),
    forceRefresh: (address: string) => contractDataCache.forceRefresh(address),
    preload: (address: string) => contractDataCache.preloadContractData(address),
    odds: (address: string) => contractDataCache.getWinOdds(address),
    summary: (address: string) => contractDataCache.getOddsSummary(address),
    betOdds: (address: string, betPerLine: number, selectedPaylines: number) => 
      contractDataCache.calculateBetOdds(address, betPerLine, selectedPaylines),
    version: () => CONTRACT_CONFIG.version,
    cacheDuration: () => CONTRACT_CONFIG.cacheDuration
  };
}