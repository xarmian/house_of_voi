import { writable, derived } from 'svelte/store';
import { PUBLIC_MAINTENANCE_MODE } from '$env/static/public';

// Force maintenance mode from environment variable
const isForceMaintenanceEnabled = (PUBLIC_MAINTENANCE_MODE || 'false') === 'true';

// Core maintenance mode store - can be manually controlled
export const isManualMaintenanceMode = writable<boolean>(false);

// Combined maintenance mode store - checks both manual and environment variable
export const isMaintenanceMode = derived(
  isManualMaintenanceMode,
  ($isManualMaintenance) => isForceMaintenanceEnabled || $isManualMaintenance
);

// Maintenance mode message store
export const maintenanceModeMessage = derived(
  isMaintenanceMode,
  ($isMaintenanceMode) => {
    if (!$isMaintenanceMode) {
      return null;
    }
    
    if (isForceMaintenanceEnabled) {
      return 'The platform is temporarily under maintenance for system upgrades. All operations are disabled. Please try again later.';
    }
    
    return 'The platform is temporarily under maintenance. Please try again later.';
  }
);

// Export maintenance mode actions
export const maintenanceModeActions = {
  /**
   * Enable manual maintenance mode
   */
  enable: () => isManualMaintenanceMode.set(true),
  
  /**
   * Disable manual maintenance mode (environment variable override will still apply)
   */
  disable: () => isManualMaintenanceMode.set(false),
  
  /**
   * Check if maintenance mode is active
   */
  isActive: () => isForceMaintenanceEnabled || false, // This will be properly derived from the store
  
  /**
   * Check if maintenance mode is forced via environment variable
   */
  isForcedByEnvironment: () => isForceMaintenanceEnabled
};