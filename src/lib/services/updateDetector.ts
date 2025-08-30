import { browser } from '$app/environment';
import { toastStore } from '$lib/stores/toast';

interface VersionInfo {
  timestamp: number;
  buildTime: string;
  version: string;
}

class UpdateDetector {
  private checkInterval = 300000; // Check every 5 minutes
  private intervalId: number | null = null;
  private currentVersion: number | null = null;
  private isCheckingUpdate = false;
  private isInitialized = false;
  private hasRunFirstCheck = false;
  private readonly STORAGE_KEY = 'app_current_version';
  private readonly INIT_KEY = 'app_version_initialized';

  constructor() {
    if (browser) {
      // Try to load the current version from localStorage
      const stored = localStorage.getItem(this.STORAGE_KEY);
      const initialized = localStorage.getItem(this.INIT_KEY);
      
      if (stored && initialized) {
        this.currentVersion = parseInt(stored, 10);
        this.isInitialized = true;
      }
    }
  }

  start() {
    if (!browser || this.intervalId) return;
    
    // Initial check after a short delay to ensure page is loaded
    setTimeout(() => this.checkForUpdates(), 5000);
    
    // Set up periodic checks
    this.intervalId = window.setInterval(() => {
      this.checkForUpdates();
    }, this.checkInterval);
  }

  stop() {
    if (this.intervalId) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkForUpdates() {
    if (!browser || this.isCheckingUpdate) return;
    
    this.isCheckingUpdate = true;
    
    try {
      const response = await fetch('/version.json?' + Date.now(), {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      if (!response.ok) {
        // Version endpoint not available yet, silently continue
        return;
      }
      
      const versionInfo: VersionInfo = await response.json();
      
      console.debug('Version check:', {
        isInitialized: this.isInitialized,
        currentVersion: this.currentVersion,
        fetchedVersion: versionInfo.timestamp,
        comparison: this.currentVersion ? versionInfo.timestamp - this.currentVersion : 'N/A'
      });
      
      if (!this.hasRunFirstCheck) {
        // First check after page load - sync localStorage with current deployment
        console.debug('First check: syncing localStorage with current deployment');
        this.updateCurrentVersion(versionInfo.timestamp);
        this.hasRunFirstCheck = true;
        return; // Never show notification on first check
      }
      
      if (this.currentVersion && versionInfo.timestamp > this.currentVersion) {
        // Subsequent checks - compare and potentially notify
        console.debug('Update detected on periodic check, showing notification');
        this.showUpdateNotification();
        this.stop();
      } else {
        console.debug('No update detected on periodic check');
      }
    } catch (error) {
      // Silently handle errors - version.json might not be available in dev mode
      console.debug('Version check failed:', error);
    } finally {
      this.isCheckingUpdate = false;
    }
  }

  private updateCurrentVersion(timestamp: number) {
    this.currentVersion = timestamp;
    this.isInitialized = true;
    
    if (browser) {
      localStorage.setItem(this.STORAGE_KEY, timestamp.toString());
      localStorage.setItem(this.INIT_KEY, 'true');
    }
  }

  private showUpdateNotification() {
    toastStore.update(
      'Update Available',
      'A new version of the app is available. Click reload to get the latest updates.',
      () => {
        // Force a hard reload to get the new version
        window.location.reload();
      }
    );
  }

  // Method to manually check for updates
  async checkNow() {
    await this.checkForUpdates();
  }

  // Method to manually trigger update notification (for testing)
  triggerUpdateNotification() {
    this.showUpdateNotification();
  }

  // Method to reset version tracking (for testing)
  resetVersionTracking() {
    if (browser) {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.INIT_KEY);
      this.currentVersion = null;
      this.isInitialized = false;
    }
  }
}

// Export singleton instance
export const updateDetector = new UpdateDetector();