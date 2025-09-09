import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { ybtTransfersService } from '$lib/services/ybtTransfers';
import { ybtService } from '$lib/services/ybt';
import type { 
  YBTTransfersState,
  YBTTransfersData,
  YBTProfitLoss
} from '$lib/types/ybtTransfers';

function createYBTTransfersStore() {
  const { subscribe, set, update } = writable<YBTTransfersState>({
    transfersData: null,
    profitLoss: null,
    isLoading: false,
    error: null,
    lastUpdated: null
  });

  let isRefreshing = false;

  const refreshTransfers = async (
    userAddress?: string,
    contractId?: string,
    currentPortfolioValue?: bigint
  ) => {
    if (!browser) return;
    
    if (isRefreshing) {
      console.log('YBT transfers refresh already in progress');
      return;
    }

    // Get wallet context if address not provided
    if (!userAddress) {
      try {
        const context = await ybtService.getWalletContext();
        if (!context) return;
        userAddress = context.address;
      } catch (error) {
        console.error('Failed to get wallet context for transfers:', error);
        return;
      }
    }

    if (!userAddress) return;

    // Get contract context if not provided
    if (!contractId) {
      try {
        const { selectedContract } = await import('$lib/stores/multiContract');
        const { get } = await import('svelte/store');
        const currentContract = get(selectedContract);
        if (!currentContract) return;
        contractId = currentContract.id;
      } catch (error) {
        console.error('Failed to get contract context for transfers:', error);
        return;
      }
    }

    isRefreshing = true;
    update(state => ({ ...state, isLoading: true, error: null }));

    try {
      // Import contract configuration to get app IDs
      const { selectedContract } = await import('$lib/stores/multiContract');
      const { get } = await import('svelte/store');
      const currentContract = get(selectedContract);
      
      if (!currentContract) {
        throw new Error('No contract selected');
      }

      // Fetch transfers data
      const transfersData = await ybtTransfersService.getUserYBTTransfers({
        userAddress,
        machineAppId: BigInt(currentContract.slotMachineAppId),
        ybtAppId: BigInt(currentContract.ybtAppId)
      });

      // Calculate current portfolio value if not provided
      let portfolioValue = currentPortfolioValue;
      if (portfolioValue === undefined) {
        // Get current user shares and calculate portfolio value
        const globalState = await ybtService.getGlobalState(contractId);
        const userShares = await ybtService.getUserShares(userAddress, contractId);
        const contractValue = await ybtService.getContractTotalValue(contractId);
        
        portfolioValue = ybtService.calculateUserPortfolioValue(
          userShares, 
          globalState.totalSupply, 
          contractValue
        );
      }

      // Calculate P/L
      const profitLoss = ybtTransfersService.calculateProfitLoss(
        transfersData, 
        portfolioValue
      );

      update(state => ({
        ...state,
        transfersData,
        profitLoss,
        isLoading: false,
        error: null,
        lastUpdated: Date.now()
      }));

    } catch (error) {
      console.error('Error refreshing YBT transfers:', error);
      update(state => ({
        ...state,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to refresh transfer data'
      }));
    } finally {
      isRefreshing = false;
    }
  };

  return {
    subscribe,

    async refresh(userAddress?: string, contractId?: string, currentPortfolioValue?: bigint) {
      return await refreshTransfers(userAddress, contractId, currentPortfolioValue);
    },

    clearError() {
      update(state => ({ ...state, error: null }));
    },

    reset() {
      isRefreshing = false;
      set({
        transfersData: null,
        profitLoss: null,
        isLoading: false,
        error: null,
        lastUpdated: null
      });
    }
  };
}

export const ybtTransfersStore = createYBTTransfersStore();

// Derived stores for convenience
export const ybtProfitLoss = derived(
  ybtTransfersStore,
  $transfers => $transfers.profitLoss
);

export const ybtTransfersLoading = derived(
  ybtTransfersStore,
  $transfers => $transfers.isLoading
);

export const ybtTransfersData = derived(
  ybtTransfersStore,
  $transfers => $transfers.transfersData
);