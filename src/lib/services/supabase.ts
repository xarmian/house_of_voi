/**
 * Supabase Client Service
 * Provides a configured Supabase client for HOV application
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { browser } from '$app/environment';
import { 
  PUBLIC_SUPABASE_URL, 
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_DEBUG_MODE
} from '$env/static/public';

export interface Database {
  public: {
    Tables: {
      hov_events: {
        Row: {
          round: bigint;
          intra: number;
          txid: string;
          app_id: bigint;
          event_type: string;
          who: string;
          amount: bigint;
          max_payline_index: bigint;
          index_value: bigint;
          claim_round: bigint;
          payout: bigint | null;
          created_at: string;
          updated_at: string | null;
          total_bet_amount: bigint;
          net_result: bigint;
          is_win: boolean;
        };
        Insert: {
          round: bigint;
          intra: number;
          txid: string;
          app_id: bigint;
          event_type: string;
          who: string;
          amount: bigint;
          max_payline_index: bigint;
          index_value: bigint;
          claim_round: bigint;
          payout?: bigint | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          round?: bigint;
          intra?: number;
          txid?: string;
          app_id?: bigint;
          event_type?: string;
          who?: string;
          amount?: bigint;
          max_payline_index?: bigint;
          index_value?: bigint;
          claim_round?: bigint;
          payout?: bigint | null;
          created_at?: string;
          updated_at?: string | null;
        };
      };
    };
    Views: {
      mv_hov_leaderboard: {
        Row: {
          app_id: bigint;
          who: string;
          total_spins: bigint;
          total_amount_bet: bigint;
          total_amount_won: bigint;
          net_result: bigint;
          winning_spins: bigint;
          largest_single_win: bigint;
          avg_bet_size: number;
          win_rate: number;
          first_bet_round: bigint;
          last_bet_round: bigint;
          longest_streak: number;
        };
      };
    };
    Functions: {
      get_balance_history: {
        Args: {
          algorand_address: string;
          start_round: string;
          end_round: string;
        };
        Returns: unknown;
      };
      get_hov_platform_stats: {
        Args: {
          p_app_id: string;
          p_start_round?: string;
          p_end_round?: string;
        };
        Returns: unknown;
      };
      get_hov_leaderboard: {
        Args: {
          p_app_id: string;
          p_metric?: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      get_hov_tournament: {
        Args: {
          p_app_id: string;
          p_start_ts: string;
          p_end_ts: string;
          p_limit?: number;
          p_min_spins?: number;
          p_min_volume_micro?: string;
        };
        Returns: unknown;
      };
      get_user_ybt_transfers: {
        Args: {
          p_user_addr: string;
          p_machine_app_id: string;
          p_ybt_app_id: string;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          transactions: Array<{
            round: number;
            intra: number;
            ts: string;
            txid: string;
            direction: 'in' | 'out';
            amount: string;
          }>;
          totals: {
            in: string;
            out: string;
            net: string;
          };
        };
      };
      // ... add other function definitions as needed
    };
  };
}

class SupabaseService {
  private client: SupabaseClient<Database> | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  /**
   * Get the Supabase client instance
   */
  public getClient(): SupabaseClient<Database> {
    if (!this.client) {
      throw new Error('Supabase client not initialized. Call initialize() first.');
    }
    return this.client;
  }

  /**
   * Initialize the Supabase client
   */
  public async initialize(): Promise<void> {
    // Prevent multiple initializations
    if (this.isInitialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this._initialize();
    await this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // Check if we have the required environment variables
      if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
        throw new Error('Missing Supabase configuration. Please set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY environment variables.');
      }

      // Validate URLs
      if (!this.isValidUrl(PUBLIC_SUPABASE_URL)) {
        throw new Error('Invalid Supabase URL format');
      }

      // Create the client
      this.client = createClient<Database>(
        PUBLIC_SUPABASE_URL,
        PUBLIC_SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: browser,
            autoRefreshToken: browser,
          },
          realtime: {
            params: {
              eventsPerSecond: 10,
            },
          },
          global: {
            headers: {
              'User-Agent': 'House-of-Voi/1.0.0'
            }
          }
        }
      );

      // Test the connection
      await this.testConnection();

      this.isInitialized = true;

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('✅ Supabase client initialized successfully');
      }
    } catch (error) {
      this.isInitialized = false;
      this.client = null;
      throw new Error(`Failed to initialize Supabase client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Test the Supabase connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    try {
      // Simple query to test connection
      const { error } = await this.client
        .from('hov_events')
        .select('count', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        throw new Error(`Connection test failed: ${error.message}`);
      }
    } catch (error) {
      throw new Error(`Supabase connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if client is initialized and ready
   */
  public isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Get connection status
   */
  public getStatus(): 'not_initialized' | 'initializing' | 'ready' | 'error' {
    if (this.isInitialized && this.client) return 'ready';
    if (this.initializationPromise) return 'initializing';
    return 'not_initialized';
  }

  /**
   * Reset the client (for testing or reconnection)
   */
  public reset(): void {
    this.isInitialized = false;
    this.client = null;
    this.initializationPromise = null;
  }

  /**
   * Subscribe to real-time changes on a table.
   * Returns an unsubscribe function that cleans up the channel.
   */
  public subscribe<T = any>(
    table: keyof Database['public']['Tables'],
    callback: (payload: { eventType: string; new: T; old: T }) => void,
    filter?: string
  ): () => void {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    const channel = this.client
      .channel(`${String(table)}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table as string,
          filter: filter
        },
        callback
      );

    // Start the subscription. We don’t need to await here.
    channel.subscribe();

    let unsubscribed = false;
    return () => {
      if (unsubscribed) return;
      unsubscribed = true;
      try {
        // Prefer channel-level unsubscribe in case client outlives this call site
        // @ts-ignore – runtime API provides unsubscribe()
        channel.unsubscribe?.();
      } catch {}
      try {
        // Remove channel from client as an extra guard
        this.client?.removeChannel?.(channel as any);
      } catch {}
    };
  }

  /**
   * Health check function
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    timestamp: Date;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      const { error } = await this.client
        .from('hov_events')
        .select('count', { count: 'exact', head: true })
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      const latency = Date.now() - startTime;

      return {
        status: 'healthy',
        timestamp: new Date(),
        latency
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      // Just check for https protocol and valid hostname
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService();

// Export the client getter for direct access (use with caution)
export const getSupabaseClient = () => supabaseService.getClient();

// Export types
export type { Database, SupabaseClient };
