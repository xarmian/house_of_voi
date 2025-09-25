/**
 * Name Resolution Service
 * Handles forward and reverse resolution between addresses and hov.voi domain names
 */

import { supabaseService } from './supabase';
import { browser } from '$app/environment';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';

// ENVoi app ID for hov.voi domain resolution
const ENVOI_APP_ID = '45327686';

// Types
export interface NameLookupResult {
  name: string;
  address: string;
  metadata: Record<string, any>;
}

export interface ResolvedAddress {
  address: string;
  name: string | null; // Full domain name (e.g., "alice.hov.voi") or null if not resolved
  hasName: boolean;
}

// Simple cache implementation
class NameCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private ttl = 300000; // 5 minutes
  private maxSize = 1000;

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: any): void {
    // Clean up old entries if cache is too large
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      // Remove oldest 30% of cache
      const toRemove = Math.floor(this.maxSize * 0.3);
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.cache.delete(entries[i][0]);
      }
    }

    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }
}

class NameResolutionService {
  private reverseCache = new NameCache();  // address -> name
  private forwardCache = new NameCache();  // name -> address

  /**
   * Initialize the service (ensures Supabase is ready)
   */
  async initialize(): Promise<void> {
    if (!supabaseService.isReady()) {
      await supabaseService.initialize();
    }
  }

  /**
   * Resolve multiple addresses to names (reverse lookup)
   * @param addresses Array of wallet addresses
   * @returns Map of address -> ResolvedAddress
   */
  async resolveAddresses(addresses: string[]): Promise<Map<string, ResolvedAddress>> {
    const result = new Map<string, ResolvedAddress>();
    const uncachedAddresses: string[] = [];

    // Check cache first
    for (const address of addresses) {
      const cached = this.reverseCache.get(address);
      if (cached !== null) {
        result.set(address, cached);
      } else {
        uncachedAddresses.push(address);
      }
    }

    // Fetch uncached addresses
    if (uncachedAddresses.length > 0) {
      try {
        await this.initialize();

        const client = supabaseService.getClient();
        const { data, error } = await client.rpc('envoi_lookup_names_by_owner', {
          p_addresses: uncachedAddresses.join(','),
          p_app_id: ENVOI_APP_ID,
          p_limit: uncachedAddresses.length
        });

        if (error) {
          console.warn('Name resolution failed:', error);
        } else if (data) {
          // Process successful lookups
          const lookupMap = new Map<string, string>();
          for (const item of data) {
            if (item.name && item.address) {
              // Append .hov.voi to the subdomain
              const fullDomain = `${item.name}.hov.voi`;
              lookupMap.set(item.address, fullDomain);
            }
          }

          // Create resolved addresses for all requested addresses
          for (const address of uncachedAddresses) {
            const name = lookupMap.get(address) || null;
            const resolved: ResolvedAddress = {
              address,
              name,
              hasName: name !== null
            };

            result.set(address, resolved);
            this.reverseCache.set(address, resolved);
          }
        }
      } catch (error) {
        console.warn('Name resolution service error:', error);
      }

      // For any addresses that still don't have results, create fallback entries
      for (const address of uncachedAddresses) {
        if (!result.has(address)) {
          const resolved: ResolvedAddress = {
            address,
            name: null,
            hasName: false
          };
          result.set(address, resolved);
          this.reverseCache.set(address, resolved);
        }
      }
    }

    return result;
  }

  /**
   * Resolve a single address to name
   * @param address Wallet address
   * @returns ResolvedAddress
   */
  async resolveAddress(address: string): Promise<ResolvedAddress> {
    const results = await this.resolveAddresses([address]);
    return results.get(address) || { address, name: null, hasName: false };
  }

  /**
   * Resolve domain names to addresses (forward lookup)
   * @param names Array of domain names (e.g., ["alice.hov.voi", "bob.voi"])
   * @returns Array of NameLookupResult
   */
  async resolveNames(names: string[]): Promise<NameLookupResult[]> {
    const results: NameLookupResult[] = [];
    const uncachedNames: string[] = [];

    // Check cache first
    for (const name of names) {
      const cached = this.forwardCache.get(name);
      if (cached !== null) {
        results.push(cached);
      } else {
        uncachedNames.push(name);
      }
    }

    // Fetch uncached names
    if (uncachedNames.length > 0) {
      try {
        await this.initialize();

        const client = supabaseService.getClient();
        const { data, error } = await client.rpc('envoi_resolve_name', {
          p_names: uncachedNames.join(',')
        });

        if (error) {
          console.warn('Forward name resolution failed:', error);
        } else if (data) {
          for (const item of data) {
            if (item.name && item.address) {
              results.push(item);
              this.forwardCache.set(item.name, item);
            }
          }
        }
      } catch (error) {
        console.warn('Forward name resolution service error:', error);
      }
    }

    return results;
  }

  /**
   * Search for addresses by domain name patterns
   * @param searchTerm Search term (e.g., "alice.hov.voi" or "alice")
   * @returns Array of NameLookupResult
   */
  async searchByName(searchTerm: string): Promise<NameLookupResult[]> {
    // Normalize search term
    let normalizedTerm = searchTerm.trim().toLowerCase();

    // If the term doesn't contain a dot, assume it's a subdomain and add .hov.voi
    if (!normalizedTerm.includes('.')) {
      normalizedTerm = `${normalizedTerm}.hov.voi`;
    }

    // Try exact match first
    const exactMatches = await this.resolveNames([normalizedTerm]);
    if (exactMatches.length > 0) {
      return exactMatches;
    }

    // If no exact match and term doesn't end with .voi, try with .voi
    if (!normalizedTerm.endsWith('.voi')) {
      const withVoi = normalizedTerm.replace(/\.hov\.voi$/, '.voi');
      const voiMatches = await this.resolveNames([withVoi]);
      if (voiMatches.length > 0) {
        return voiMatches;
      }
    }

    return [];
  }

  /**
   * Format an address for display (fallback when no name is available)
   * @param address Wallet address
   * @param length Optional length for shortened display
   * @returns Formatted address string
   */
  formatAddress(address: string, length: 'short' | 'medium' | 'long' = 'short'): string {
    if (!address) return '';

    switch (length) {
      case 'short':
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      case 'medium':
        return `${address.slice(0, 12)}...${address.slice(-8)}`;
      case 'long':
        return `${address.slice(0, 16)}...${address.slice(-12)}`;
      default:
        return address;
    }
  }

  /**
   * Get display string for an address (name if available, otherwise formatted address)
   * @param resolved ResolvedAddress object
   * @param addressFormat Format for fallback address display
   * @returns Display string
   */
  getDisplayString(resolved: ResolvedAddress, addressFormat: 'short' | 'medium' | 'long' = 'short'): string {
    if (resolved.hasName && resolved.name) {
      return resolved.name;
    }
    return this.formatAddress(resolved.address, addressFormat);
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.reverseCache.clear();
    this.forwardCache.clear();
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log('Name resolution cache cleared');
    }
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats(): { reverseSize: number; forwardSize: number } {
    return {
      reverseSize: (this.reverseCache as any).cache.size,
      forwardSize: (this.forwardCache as any).cache.size
    };
  }
}

// Export singleton instance
export const nameResolutionService = new NameResolutionService();