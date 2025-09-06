// Contract Data Cache Service
// Caches paylines and multiplier data to avoid repeated contract calls

import { CONTRACT } from 'ulujs';
import algosdk from 'algosdk';
import { NETWORK_CONFIG, MULTI_CONTRACT_CONFIG } from '$lib/constants/network';
import { oddsCalculator, type OddsCalculationResult } from './oddsCalculator';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';

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

interface CacheVersions {
  contractVersion: number | null; // contract_version from global state
  deploymentVersion: number | null; // deployment_version from global state  
  publicVersion: string | null; // PUBLIC_CONTRACT_VERSION from env
}

interface CacheStorage {
  paylines: CachedPaylines | null;
  multipliers: { [key: string]: CachedMultiplier };
  reelData: CachedReelData | null;
  odds: OddsCalculationResult | null;
  versions: CacheVersions | null; // All version information when cache was created
}

export class ContractDataCache {
  private readonly CACHE_KEY_PREFIX = 'voi_contract_data_cache';
  private readonly CACHE_DURATION: number;
  private caches: { [contractId: number]: CacheStorage } = {}; // Per-contract caches
  private client: algosdk.Algodv2;
  private isPreloading = false; // Prevent concurrent preload operations
  private sessionVersions: { [contractId: number]: CacheVersions } = {}; // Per-contract session versions

  constructor() {
    this.client = new algosdk.Algodv2(
      NETWORK_CONFIG.token || '',
      NETWORK_CONFIG.nodeUrl || '',
      NETWORK_CONFIG.port
    );
    this.CACHE_DURATION = 86400000; // 24 hours
    
    // Load from storage asynchronously (fire and forget)
    this.loadFromStorage().catch(error => {
      console.warn('Failed to load cache from storage:', error);
    });
  }

  /**
   * Get cache key for a specific contract
   */
  private getCacheKey(contractId: number): string {
    return `${this.CACHE_KEY_PREFIX}_${contractId}`;
  }

  /**
   * Get cache storage for a specific contract (creates if doesn't exist)
   */
  private getContractCache(contractId: number): CacheStorage {
    if (!this.caches[contractId]) {
      this.caches[contractId] = {
        paylines: null,
        multipliers: {},
        reelData: null,
        odds: null,
        versions: null
      };
    }
    return this.caches[contractId];
  }

  /**
   * Get session versions for a specific contract (creates if doesn't exist)
   */
  private getSessionVersions(contractId: number): CacheVersions {
    if (!this.sessionVersions[contractId]) {
      this.sessionVersions[contractId] = {
        contractVersion: null,
        deploymentVersion: null,
        publicVersion: MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0'
      };
    }
    return this.sessionVersions[contractId];
  }

  /**
   * Get the current slot machine app ID from the selected contract
   */
  private async getCurrentSlotMachineAppId(): Promise<number> {
    // Import selectedContract dynamically to avoid circular deps
    const { selectedContract } = await import('$lib/stores/multiContract');
    const { get } = await import('svelte/store');
    const currentContract = get(selectedContract);
    
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log('🔍 getCurrentSlotMachineAppId - selectedContract:', currentContract);
      console.log('🔍 getCurrentSlotMachineAppId - slotMachineAppId:', currentContract?.slotMachineAppId);
    }
    
    if (!currentContract) {
      throw new Error('❌ No contract selected! selectedContract store returned null/undefined');
    }
    
    if (!currentContract.slotMachineAppId) {
      throw new Error(`❌ Selected contract has no slotMachineAppId! Contract: ${JSON.stringify(currentContract)}`);
    }
    
    return currentContract.slotMachineAppId;
  }

  /**
   * Load cached data from localStorage for all contracts
   */
  private async loadFromStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Load all contract-specific caches
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_KEY_PREFIX + '_')) {
          const contractId = parseInt(key.replace(this.CACHE_KEY_PREFIX + '_', ''));
          if (!isNaN(contractId)) {
            const cached = localStorage.getItem(key);
            if (cached) {
              this.caches[contractId] = JSON.parse(cached);
              this.cleanupExpired(contractId);
              
              // Validate cached versions against current contract versions
              const contractCache = this.caches[contractId];
              if (contractCache.versions && !(await this.validateCachedVersions(contractId))) {
                if (PUBLIC_DEBUG_MODE === 'true') {
                  console.log(`🔄 Cached versions are outdated for contract ${contractId}, clearing cache`);
                }
                this.clearContractCache(contractId);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load contract data cache:', error);
      this.caches = {};
    }
  }

  /**
   * Save cache to localStorage for a specific contract
   */
  private saveToStorage(contractId: number): void {
    if (typeof window === 'undefined') return;

    try {
      const cacheKey = this.getCacheKey(contractId);
      const contractCache = this.getContractCache(contractId);
      localStorage.setItem(cacheKey, JSON.stringify(contractCache));
    } catch (error) {
      console.warn(`Failed to save contract data cache for contract ${contractId}:`, error);
    }
  }

  /**
   * Remove expired cache entries for a specific contract
   */
  private cleanupExpired(contractId: number): void {
    const now = Date.now();
    const cache = this.getContractCache(contractId);

    // Check paylines cache
    if (cache.paylines && now - cache.paylines.timestamp > this.CACHE_DURATION) {
      cache.paylines = null;
    }

    // Check reel data cache
    if (cache.reelData && now - cache.reelData.timestamp > this.CACHE_DURATION) {
      cache.reelData = null;
    }

    // Check odds cache
    if (cache.odds && now - cache.odds.calculatedAt > this.CACHE_DURATION) {
      cache.odds = null;
    }

    // Check multipliers cache
    Object.keys(cache.multipliers).forEach(key => {
      const multiplier = cache.multipliers[key];
      if (now - multiplier.timestamp > this.CACHE_DURATION) {
        delete cache.multipliers[key];
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
   * Fetch contract_version and deployment_version from contract global state
   */
  private async fetchContractVersions(contractId: number): Promise<{ contractVersion: number; deploymentVersion: number }> {
    try {
      // Get application information directly from algosdk
      const appInfo = await this.client.getApplicationByID(contractId).do();
      const globalState = appInfo.params['global-state'] || [];
      
      let contractVersion = 0;
      let deploymentVersion = 0;
      
      // Decode global state to find contract_version and deployment_version
      for (const item of globalState) {
        const keyBytes = new Uint8Array(atob(item.key).split('').map(c => c.charCodeAt(0)));
        const key = new TextDecoder().decode(keyBytes);
        
        if (key === 'contract_version') {
          contractVersion = item.value.uint || 0;
        } else if (key === 'deployment_version') {
          deploymentVersion = item.value.uint || 0;
        }
      }
      
      return { contractVersion, deploymentVersion };
    } catch (error) {
      console.error(`Failed to fetch contract versions from global state for contract ${contractId}:`, error);
      throw error;
    }
  }

  /**
   * Check if cached data is valid (time-based and version-based)
   */
  private isValidCache(contractId: number, timestamp: number): boolean {
    // Check time-based expiration first (fast check)
    if (Date.now() - timestamp >= this.CACHE_DURATION) {
      return false;
    }

    const cache = this.getContractCache(contractId);
    
    // If no versions cached, use a more lenient approach
    if (!cache.versions) {
      // Cache is valid if it's recent and we haven't checked versions yet
      return Date.now() - timestamp < this.CACHE_DURATION;
    }

    // Check if PUBLIC_CONTRACT_VERSION changed (this is the only version we can check synchronously)
    const currentPublicVersion = MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0';
    if (cache.versions.publicVersion !== currentPublicVersion) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`🔄 Public contract version changed from ${cache.versions.publicVersion} to ${currentPublicVersion}, invalidating cache for contract ${contractId}`);
      }
      return false;
    }

    // Cache is valid (contract versions will be checked when updating cache)
    return true;
  }
  
  /**
   * Validate cached versions against current contract versions
   */
  private async validateCachedVersions(contractId: number): Promise<boolean> {
    const cache = this.getContractCache(contractId);
    if (!cache.versions) {
      return false;
    }

    try {
      const { contractVersion, deploymentVersion } = await this.fetchContractVersions(contractId);
      const currentPublicVersion = MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0';
      const cached = cache.versions;

      // Check if contract_version changed
      if (cached.contractVersion !== contractVersion) {
        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log(`🔄 Contract version changed from ${cached.contractVersion} to ${contractVersion}, invalidating cache for contract ${contractId}`);
        }
        return false;
      }

      // Check if deployment_version changed
      if (cached.deploymentVersion !== deploymentVersion) {
        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log(`🔄 Deployment version changed from ${cached.deploymentVersion} to ${deploymentVersion}, invalidating cache for contract ${contractId}`);
        }
        return false;
      }

      // Check if PUBLIC_CONTRACT_VERSION changed
      if (cached.publicVersion !== currentPublicVersion) {
        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log(`🔄 Public contract version changed from ${cached.publicVersion} to ${currentPublicVersion}, invalidating cache for contract ${contractId}`);
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Error validating cached versions for contract ${contractId}:`, error);
      return false;
    }
  }

  /**
   * Ensure session versions are loaded (fetch once per session)
   */
  private async ensureSessionVersions(contractId: number): Promise<void> {
    if (!this.sessionVersions[contractId]) {
      try {
        const { contractVersion, deploymentVersion } = await this.fetchContractVersions(contractId);
        this.sessionVersions[contractId] = {
          contractVersion,
          deploymentVersion,
          publicVersion: MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0'
        };
      } catch (error) {
        console.error(`Failed to fetch session versions for contract ${contractId}:`, error);
        throw error;
      }
    }
  }

  /**
   * Update cache versions to current contract and public versions
   */
  private async updateCacheVersion(contractId: number): Promise<void> {
    await this.ensureSessionVersions(contractId);
    const sessionVersions = this.getSessionVersions(contractId);
    const cache = this.getContractCache(contractId);
    cache.versions = { ...sessionVersions };
  }

  /**
   * Fetch paylines directly from contract
   */
  private async fetchPaylinesFromContract(contractId: number): Promise<number[][]> {
    // Create Ulujs CONTRACT instance
    const ci = new CONTRACT(
      contractId,
      this.client,
      undefined, // Use undefined for indexer
      slotMachineABI,
      readOnlyAccount
    );

    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🔄 Fetching paylines from contract ${contractId}...`);
    }

    // Configure CONTRACT instance 
    ci.setEnableRawBytes(true);
    
    // Call get_paylines method - gets return value without submitting
    const result = await ci.get_paylines();

    // Check if returnValue exists and is an array before mapping
    if (!result.returnValue || !Array.isArray(result.returnValue)) {
      throw new Error(`get_paylines returned invalid data for contract ${contractId}: ${result.returnValue}`);
    }

    // Convert BigInt array to number array and reshape to paylines
    const flatPaylines = (result.returnValue as bigint[]).map(x => Number(x));
    
    // Convert flat array to 2D array (assuming 20 paylines with 5 positions each)
    const paylines: number[][] = [];
    for (let i = 0; i < flatPaylines.length; i += 5) {
      paylines.push(flatPaylines.slice(i, i + 5));
    }

    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`📊 Contract returned flat paylines array length: ${flatPaylines.length}`);
      console.log(`📋 First 20 payline values:`, flatPaylines.slice(0, 20));
      console.log(`✅ Parsed into ${paylines.length} paylines`);
      console.log(`📈 First 3 paylines:`, paylines.slice(0, 3));
    }

    return paylines;
  }

  /**
   * Fetch reel data directly from contract
   */
  private async fetchReelDataFromContract(contractId: number): Promise<{
    reelData: string;
    reelLength: number;
    reelCount: number;
    windowLength: number;
  }> {
    console.log(`🔄 Fetching reel data from contract ${contractId}...`);

    // Create Ulujs CONTRACT instance
    const ci = new CONTRACT(
      contractId,
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

    // Check each result individually for better error reporting
    if (!reelsResult.success) {
      console.error('❌ get_reels() failed:', reelsResult);
      throw new Error(`Failed to fetch reel symbols from contract: ${reelsResult.error || 'Unknown error'}`);
    }
    if (!reelLengthResult.success) {
      console.error('❌ get_reel_length() failed:', reelLengthResult);
      throw new Error(`Failed to fetch reel length from contract: ${reelLengthResult.error || 'Unknown error'}`);
    }
    if (!reelCountResult.success) {
      console.error('❌ get_reel_count() failed:', reelCountResult);
      throw new Error(`Failed to fetch reel count from contract: ${reelCountResult.error || 'Unknown error'}`);
    }

    // Convert bytes to string
    const reelBytes = new Uint8Array(reelsResult.returnValue);
    const reelData = Array.from(reelBytes).map(byte => String.fromCharCode(byte)).join('');
    
    const reelLength = Number(reelLengthResult.returnValue);
    const reelCount = Number(reelCountResult.returnValue);
    const windowLength = 3; // Standard window length

    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🎰 Contract reel data:`, {
        totalLength: reelData.length,
        reelLength,
        reelCount,
        windowLength,
        first50Chars: reelData.substring(0, 50),
        uniqueSymbols: [...new Set(reelData)].sort(),
        symbolCounts: [...new Set(reelData)].map(symbol => 
          `${symbol}:${(reelData.match(new RegExp(`\\${symbol}`, 'g')) || []).length}`
        )
      });
    }

    return { reelData, reelLength, reelCount, windowLength };
  }

  /**
   * Fetch payout multiplier directly from contract
   */
  private async fetchMultiplierFromContract(symbol: string, count: number, contractId: number): Promise<number> {
    try {
      // Create Ulujs CONTRACT instance
      const ci = new CONTRACT(
        contractId,
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
      
      // Validate and convert result
      if (!result || result.returnValue === undefined || result.returnValue === null) {
        console.warn(`⚠️ Contract returned undefined multiplier for ${symbol}_${count}`);
        return 0; // Default to 0 for invalid multipliers
      }

      const multiplier = Number(result.returnValue);
      
      if (isNaN(multiplier)) {
        console.warn(`⚠️ Contract returned NaN multiplier for ${symbol}_${count}, result was:`, result.returnValue);
        return 0; // Default to 0 for NaN multipliers
      }
      
      return multiplier;
    } catch (error) {
      console.error(`❌ Failed to fetch multiplier for ${symbol}_${count}:`, error);
      return 0; // Default to 0 on error
    }
  }

  /**
   * Get cached paylines or fetch from contract
   */
  async getPaylines(address: string): Promise<number[][]> {
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    
    // Check cache first
    if (cache.paylines && this.isValidCache(contractId, cache.paylines.timestamp)) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`📦 Using cached paylines data for contract ${contractId}`);
      }
      return cache.paylines.data;
    }

    // Cache miss - fetch from contract
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🔄 Fetching paylines from contract ${contractId}`);
    }
    try {
      const paylines = await this.fetchPaylinesFromContract(contractId);
      
      // Cache the result
      cache.paylines = {
        data: paylines,
        timestamp: Date.now()
      };
      this.saveToStorage(contractId);

      return paylines;
    } catch (error) {
      console.error(`Failed to fetch paylines from contract ${contractId}:`, error);
      // Return cached data even if expired as fallback
      if (cache.paylines) {
        console.log(`⚠️ Using expired cached paylines as fallback for contract ${contractId}`);
        return cache.paylines.data;
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
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    
    // Check cache first
    if (cache.reelData && this.isValidCache(contractId, cache.reelData.timestamp)) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`📦 Using cached reel data for contract ${contractId}`);
      }
      return {
        reelData: cache.reelData.reelData,
        reelLength: cache.reelData.reelLength,
        reelCount: cache.reelData.reelCount,
        windowLength: cache.reelData.windowLength,
      };
    }

    // Cache miss - fetch from contract
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🔄 Fetching reel data from contract ${contractId}`);
    }
    try {
      const reelData = await this.fetchReelDataFromContract(contractId);
      
      // Cache the result
      cache.reelData = {
        ...reelData,
        timestamp: Date.now()
      };
      this.saveToStorage(contractId);

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`✅ Fetched and cached reel data for contract ${contractId}:`, {
          reelDataLength: reelData.reelData.length,
          reelLength: reelData.reelLength,
          reelCount: reelData.reelCount,
          windowLength: reelData.windowLength
        });
      }

      return reelData;
    } catch (error) {
      console.error(`Failed to fetch reel data from contract ${contractId}:`, error);
      // Return cached data even if expired as fallback
      if (cache.reelData) {
        console.log(`⚠️ Using expired cached reel data as fallback for contract ${contractId}`);
        return {
          reelData: cache.reelData.reelData,
          reelLength: cache.reelData.reelLength,
          reelCount: cache.reelData.reelCount,
          windowLength: cache.reelData.windowLength,
        };
      }
      throw error;
    }
  }

  /**
   * Get cached payout multiplier or fetch from contract
   */
  async getPayoutMultiplier(symbol: string, count: number, address: string): Promise<number> {
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    const PAYOUTS = {
      A: { 3: 200, 4: 1000, 5: 10000 },
      B: { 3: 60,  4: 200, 5: 1000 },
      C: { 3: 30,  4: 100, 5: 500 },
      D: { 3: 10,  4: 55,  5: 250 },
      _: {}
    };

    return PAYOUTS[symbol as keyof typeof PAYOUTS][count as keyof typeof PAYOUTS[typeof symbol]] || 0;

    /*const cacheKey = this.getMultiplierKey(symbol, count);

    // Check cache first
    if (this.cache.multipliers[cacheKey] && 
        this.isValidCache(this.cache.multipliers[cacheKey].timestamp)) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`📦 Using cached multiplier for ${symbol}x${count}`);
      }
      return this.cache.multipliers[cacheKey].data;
    }

    // Cache miss - fetch from contract
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🔄 Fetching multiplier for ${symbol}x${count} from contract`);
    }
    try {
      const multiplier = await this.fetchMultiplierFromContract(symbol, count, address);
      
      // Cache the result
      this.cache.multipliers[cacheKey] = {
        data: multiplier,
        timestamp: Date.now(),
        symbol: symbol,
        count: count
      };
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
    }*/
  }

  /**
   * Pre-load common contract data for faster gameplay
   */
  async preloadContractData(address: string): Promise<void> {
    // Prevent concurrent preload operations
    if (this.isPreloading) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('⏳ Contract data preload already in progress, skipping...');
      }
      return;
    }

    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    
    // Check if we already have recent cached data
    if (cache.paylines && this.isValidCache(contractId, cache.paylines.timestamp)) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`📦 Contract data already cached and valid for contract ${contractId}, skipping preload`);
      }
      return;
    }

    this.isPreloading = true;
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log(`🚀 Pre-loading contract data for contract ${contractId}...`);
    }
    
    try {
      // Update cache versions once at the beginning
      await this.updateCacheVersion(contractId);
      
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
      
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('✅ Contract data pre-loading completed');
      }
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
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    
    // Check cache first
    if (cache.odds && this.isValidCache(contractId, cache.odds.calculatedAt)) {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`📦 Using cached odds data for contract ${contractId}`);
      }
      return cache.odds;
    }

    // Need fresh data to calculate odds
    try {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('🔄 Calculating new odds from current data');
      }
      
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

      // DEBUG: Log all the data we're about to use for calculation
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`🔍 CONTRACT DATA DEBUG - About to calculate odds for contract ${contractId} with:`);
        console.log('📊 Reel Data:', {
          length: reelData.reelData.length,
          reelCount: reelData.reelCount,
          reelLength: reelData.reelLength,
          sample: reelData.reelData.substring(0, 50) + '...'
        });
        console.log('📈 Paylines:', {
          count: paylines.length,
          first5: paylines.slice(0, 5),
          samplePattern: paylines[0]
        });
        console.log('🎰 Multipliers loaded:', {
          count: Object.keys(cache.multipliers).length,
          keys: Object.keys(cache.multipliers).sort(),
          values: Object.fromEntries(Object.entries(cache.multipliers).map(([k, v]) => [k, v.data])),
          fullCache: cache.multipliers
        });
      }

      // Calculate odds
      const odds = oddsCalculator.calculateOdds(reelData, cache.multipliers, paylines);
      
      // Cache the result
      cache.odds = odds;
      this.saveToStorage(contractId);

      return odds;
    } catch (error) {
      console.error(`Failed to calculate odds for contract ${contractId}:`, error);
      // Return cached data even if expired as fallback
      if (cache.odds) {
        console.log(`⚠️ Using expired cached odds as fallback for contract ${contractId}`);
        return cache.odds;
      }
      return null;
    }
  }

  /**
   * Force recalculation of odds (clears cache)
   */
  async recalculateOdds(address: string): Promise<OddsCalculationResult | null> {
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    cache.odds = null;
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
   * Clear cache for a specific contract
   */
  clearContractCache(contractId: number): void {
    if (this.caches[contractId]) {
      delete this.caches[contractId];
    }
    if (this.sessionVersions[contractId]) {
      delete this.sessionVersions[contractId];
    }
    if (typeof window !== 'undefined') {
      const cacheKey = this.getCacheKey(contractId);
      localStorage.removeItem(cacheKey);
    }
    console.log(`🧹 Contract data cache cleared for contract ${contractId}`);
  }

  /**
   * Clear all cached data for all contracts
   */
  clearCache(): void {
    this.caches = {};
    this.sessionVersions = {};
    if (typeof window !== 'undefined') {
      // Remove all contract-specific cache entries
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.CACHE_KEY_PREFIX + '_')) {
          localStorage.removeItem(key);
        }
      }
    }
    console.log('🧹 All contract data caches cleared');
  }

  /**
   * Clear only the odds cache to force recalculation for current contract
   */
  async clearOddsCache(): Promise<void> {
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    cache.odds = null;
    this.saveToStorage(contractId);
    console.log(`🗑️ Odds cache cleared for contract ${contractId} - will force fresh calculation`);
  }
  
  /**
   * Force refresh cached data for current contract - useful when contract is updated
   */
  async forceRefresh(address: string): Promise<void> {
    const contractId = await this.getCurrentSlotMachineAppId();
    console.log(`🔄 Force refreshing contract data for contract ${contractId}...`);
    this.clearContractCache(contractId);
    
    // Pre-load fresh data
    await this.preloadContractData(address);
  }

  /**
   * Get cache statistics for debugging
   */
  async getCacheStats(): Promise<{ 
    currentContractId: number;
    paylinesCached: boolean; 
    reelDataCached: boolean; 
    multipliersCached: number; 
    oddsCached: boolean;
    cacheSize: string;
    cachedContractVersion: number | null;
    cachedDeploymentVersion: number | null;
    cachedPublicVersion: string | null;
    currentPublicVersion: string;
    cacheDuration: number;
    totalContractsCached: number;
  }> {
    const contractId = await this.getCurrentSlotMachineAppId();
    const cache = this.getContractCache(contractId);
    
    const stats = {
      currentContractId: contractId,
      paylinesCached: cache.paylines !== null,
      reelDataCached: cache.reelData !== null,
      multipliersCached: Object.keys(cache.multipliers).length,
      oddsCached: cache.odds !== null,
      cacheSize: typeof window !== 'undefined' 
        ? `${(new Blob([JSON.stringify(this.caches)]).size / 1024).toFixed(2)} KB`
        : '0 KB',
      cachedContractVersion: cache.versions?.contractVersion || null,
      cachedDeploymentVersion: cache.versions?.deploymentVersion || null,
      cachedPublicVersion: cache.versions?.publicVersion || null,
      currentPublicVersion: MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0',
      cacheDuration: this.CACHE_DURATION,
      totalContractsCached: Object.keys(this.caches).length
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
    clearContract: (contractId: number) => contractDataCache.clearContractCache(contractId),
    forceRefresh: (address: string) => contractDataCache.forceRefresh(address),
    preload: (address: string) => contractDataCache.preloadContractData(address),
    odds: (address: string) => contractDataCache.getWinOdds(address),
    summary: (address: string) => contractDataCache.getOddsSummary(address),
    betOdds: (address: string, betPerLine: number, selectedPaylines: number) => 
      contractDataCache.calculateBetOdds(address, betPerLine, selectedPaylines),
    version: () => MULTI_CONTRACT_CONFIG.contracts[0]?.metadata.version || '1.0.0',
    cacheDuration: () => 86400000,
    allCaches: () => contractDataCache.caches
  };
}