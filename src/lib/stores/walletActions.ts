import { writable } from 'svelte/store';

// Simple store for triggering wallet setup from anywhere in the app
function createWalletActionsStore() {
  const { subscribe, set } = writable<{
    triggerSetup: boolean;
  }>({
    triggerSetup: false
  });

  return {
    subscribe,
    
    // Trigger wallet setup flow
    triggerWalletSetup() {
      set({ triggerSetup: true });
      // Reset after a short delay
      setTimeout(() => {
        set({ triggerSetup: false });
      }, 100);
    }
  };
}

export const walletActions = createWalletActionsStore();