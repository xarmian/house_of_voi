/**
 * Win Feed Service
 * Manages real-time subscriptions to hov_events for win notifications
 * Features self-limiting behavior based on activity levels
 */

import { supabaseService } from './supabase';
import { preferencesStore } from '$lib/stores/preferences';
import { get } from 'svelte/store';
import { PUBLIC_DEBUG_MODE } from '$env/static/public';

export interface WinEvent {
  round: bigint;
  intra: number;
  txid: string;
  app_id: bigint;
  who: string;
  amount: bigint;
  max_payline_index: bigint;
  payout: bigint;
  total_bet_amount: bigint;
  net_result: bigint;
  created_at: Date;
}

export interface WinFeedConfig {
  baseMinPayout: number; // Base minimum payout in VOI
  maxToastsPerMinute: number; // Rate limiting
  activityWindow: number; // Time window to measure activity (ms)
  scalingFactor: number; // How much to scale threshold based on activity
  deduplicationWindow: number; // Time to deduplicate similar events (ms)
}

const DEFAULT_CONFIG: WinFeedConfig = {
  baseMinPayout: 5, // 5 VOI minimum
  maxToastsPerMinute: 10,
  activityWindow: 60000, // 1 minute
  scalingFactor: 2, // Double threshold when busy
  deduplicationWindow: 5000 // 5 seconds
};

class WinFeedService {
  private subscription: (() => void) | null = null;
  private isInitialized = false;
  private config = DEFAULT_CONFIG;
  private recentEvents: Array<{ timestamp: number; payout: number }> = [];
  private recentToasts: Array<{ timestamp: number; txid: string }> = [];
  private eventHandlers: Array<(event: WinEvent) => void> = [];
  private connectionRetries = 0;
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds

  /**
   * Initialize the win feed service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure Supabase is ready
      if (!supabaseService.isReady()) {
        await supabaseService.initialize();
      }

      // Check if user has win feed enabled
      const preferences = get(preferencesStore);
      if (!preferences.feed?.enabled) {
        if (PUBLIC_DEBUG_MODE === 'true') {
          console.log('Win feed disabled in user preferences');
        }
        return;
      }

      this.setupRealtimeSubscription();
      this.isInitialized = true;

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('✅ Win Feed Service initialized');
      }
    } catch (error) {
      console.error('Failed to initialize Win Feed Service:', error);
      this.scheduleRetry();
    }
  }

  /**
   * Setup realtime subscription to hov_events
   */
  private setupRealtimeSubscription(): void {
    try {
      this.subscription = supabaseService.subscribe<any>(
        'hov_events',
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new && payload.new.payout > 0) {
            this.handleWinEvent(payload.new);
          }
        }
      );

      this.connectionRetries = 0; // Reset retry counter on successful connection

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Win feed subscription established');
      }
    } catch (error) {
      console.error('Failed to setup realtime subscription:', error);
      this.scheduleRetry();
    }
  }

  /**
   * Handle incoming win events
   */
  private handleWinEvent(eventData: any): void {
    try {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Raw event data:', eventData);
      }

      // Parse the event data with defensive checks
      const winEvent: WinEvent = {
        round: BigInt(eventData.round || 0),
        intra: eventData.intra || 0,
        txid: eventData.txid || '',
        app_id: BigInt(eventData.app_id || 0),
        who: eventData.who || '',
        amount: BigInt(eventData.amount || 0),
        max_payline_index: BigInt(eventData.max_payline_index || 0),
        payout: BigInt(eventData.payout || 0),
        total_bet_amount: BigInt(eventData.total_bet_amount || 0),
        net_result: BigInt(eventData.net_result || 0),
        created_at: new Date(eventData.created_at || eventData.updated_at || Date.now())
      };

      // Apply filtering logic
      if (this.shouldShowWinEvent(winEvent)) {
        // Record this toast to prevent spam
        this.recordToast(winEvent.txid);
        
        // Notify all handlers
        this.eventHandlers.forEach(handler => {
          try {
            handler(winEvent);
          } catch (error) {
            console.error('Error in win event handler:', error);
          }
        });
      }

      // Always record the event for activity tracking
      this.recordEvent(Number(winEvent.payout) / 1000000); // Convert to VOI

      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log('Win event processed:', {
          txid: winEvent.txid,
          payout: Number(winEvent.payout) / 1000000,
          threshold: this.calculateCurrentThreshold()
        });
      }
    } catch (error) {
      console.error('Error handling win event:', error);
    }
  }

  /**
   * Determine if a win event should be shown as a toast
   */
  private shouldShowWinEvent(event: WinEvent): boolean {
    const preferences = get(preferencesStore);
    const feedPrefs = preferences.feed;

    // Check if feed is enabled
    if (!feedPrefs?.enabled) return false;

    // Check if we should show our own wins
    const userAddress = this.getCurrentUserAddress();
    if (!feedPrefs.showOwnWins && event.who === userAddress) {
      return false;
    }

    // Check rate limiting
    if (!this.checkRateLimit()) return false;

    // Check deduplication
    if (this.isDuplicate(event.txid)) return false;

    // Check minimum payout threshold (dynamic based on activity)
    const payoutVOI = Number(event.payout) / 1000000;
    const currentThreshold = this.calculateCurrentThreshold();
    
    return payoutVOI >= currentThreshold;
  }

  /**
   * Calculate current threshold based on recent activity
   */
  private calculateCurrentThreshold(): number {
    const preferences = get(preferencesStore);
    const baseThreshold = preferences.feed?.minPayout || this.config.baseMinPayout;

    // Clean old events
    const now = Date.now();
    this.recentEvents = this.recentEvents.filter(
      e => now - e.timestamp < this.config.activityWindow
    );

    // If no recent activity, use base threshold
    if (this.recentEvents.length === 0) return baseThreshold;

    // Calculate activity level (events per minute)
    const eventsPerMinute = this.recentEvents.length / (this.config.activityWindow / 60000);

    // Scale threshold based on activity
    // More activity = higher threshold to show only bigger wins
    if (eventsPerMinute > 5) {
      return baseThreshold * this.config.scalingFactor;
    } else if (eventsPerMinute > 10) {
      return baseThreshold * this.config.scalingFactor * 2;
    }

    return baseThreshold;
  }

  /**
   * Check rate limiting for toasts
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const preferences = get(preferencesStore);
    const maxPerMinute = preferences.feed?.maxToastsPerMinute || this.config.maxToastsPerMinute;

    // Clean old toasts
    this.recentToasts = this.recentToasts.filter(
      t => now - t.timestamp < 60000 // 1 minute
    );

    return this.recentToasts.length < maxPerMinute;
  }

  /**
   * Check if event is a duplicate within the deduplication window
   */
  private isDuplicate(txid: string): boolean {
    const now = Date.now();
    return this.recentToasts.some(
      t => t.txid === txid && now - t.timestamp < this.config.deduplicationWindow
    );
  }

  /**
   * Record an event for activity tracking
   */
  private recordEvent(payoutVOI: number): void {
    this.recentEvents.push({
      timestamp: Date.now(),
      payout: payoutVOI
    });

    // Limit array size to prevent memory leaks
    if (this.recentEvents.length > 100) {
      this.recentEvents = this.recentEvents.slice(-50);
    }
  }

  /**
   * Record a toast to prevent spam
   */
  private recordToast(txid: string): void {
    this.recentToasts.push({
      timestamp: Date.now(),
      txid
    });

    // Limit array size to prevent memory leaks
    if (this.recentToasts.length > 50) {
      this.recentToasts = this.recentToasts.slice(-25);
    }
  }

  /**
   * Get current user address for filtering own wins
   */
  private getCurrentUserAddress(): string | null {
    try {
      // Import wallet service dynamically to avoid circular dependencies
      if (typeof window !== 'undefined' && (window as any).walletService) {
        const walletData = (window as any).walletService.getPublicWalletData();
        return walletData?.address || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Schedule retry connection
   */
  private scheduleRetry(): void {
    if (this.connectionRetries >= this.maxRetries) {
      console.error('Max retries reached for win feed service');
      return;
    }

    this.connectionRetries++;
    
    setTimeout(() => {
      if (PUBLIC_DEBUG_MODE === 'true') {
        console.log(`Retrying win feed connection (attempt ${this.connectionRetries})`);
      }
      this.initialize();
    }, this.retryDelay * this.connectionRetries);
  }

  /**
   * Add event handler
   */
  onWinEvent(handler: (event: WinEvent) => void): () => void {
    this.eventHandlers.push(handler);
    
    // Return cleanup function
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WinFeedConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current activity level for debugging
   */
  getActivityLevel(): {
    eventsPerMinute: number;
    currentThreshold: number;
    recentEventCount: number;
  } {
    const now = Date.now();
    this.recentEvents = this.recentEvents.filter(
      e => now - e.timestamp < this.config.activityWindow
    );

    return {
      eventsPerMinute: this.recentEvents.length / (this.config.activityWindow / 60000),
      currentThreshold: this.calculateCurrentThreshold(),
      recentEventCount: this.recentEvents.length
    };
  }

  /**
   * Cleanup and destroy service
   */
  destroy(): void {
    if (this.subscription) {
      this.subscription();
      this.subscription = null;
    }
    
    this.eventHandlers = [];
    this.recentEvents = [];
    this.recentToasts = [];
    this.isInitialized = false;
    
    if (PUBLIC_DEBUG_MODE === 'true') {
      console.log('Win Feed Service destroyed');
    }
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const winFeedService = new WinFeedService();