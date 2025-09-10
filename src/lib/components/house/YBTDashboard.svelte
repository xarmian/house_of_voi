<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { ybtStore, userShares, sharePercentage, totalSupply, isYBTLoading } from '$lib/stores/ybt';
  import { walletStore as gamingWalletStore } from '$lib/stores/wallet';
  import { selectedWallet } from 'avm-wallet-svelte';
  import { ybtService } from '$lib/services/ybt';
  import YBTStats from './YBTStats.svelte';
  import YBTDepositModal from './YBTDepositModal.svelte';
  import YBTWithdrawModal from './YBTWithdrawModal.svelte';
  import YBTTransactionHistoryModal from './YBTTransactionHistoryModal.svelte';
  import { ybtTransfersStore, ybtProfitLoss, ybtTransfersLoading } from '$lib/stores/ybtTransfers';
  import { ybtTransfersService } from '$lib/services/ybtTransfers';
  import type { HouseBalanceData } from '$lib/services/houseBalance';
  import type { ContractPair } from '$lib/types/multiContract';
  import { isMaintenanceMode } from '$lib/stores/maintenanceMode';
  import { selectedContract } from '$lib/stores/multiContract';
  import { themeStore } from '$lib/stores/theme';

  export let houseBalance: HouseBalanceData | null = null;
  export let balanceLoading = false;
  export let onRefreshBalance: (() => Promise<void>) | null = null;
  export let isGamingWalletLocked = false;
  export let showConnectedView = false;
  export let hasWalletConnected = false;
  export let contractContext: ContractPair | null = null; // New prop for contract context
  export let viewingAddress: string | null = null; // Explicit viewing wallet address

  const dispatch = createEventDispatcher();

  let showDepositModal = false;
  let showWithdrawModal = false;
  let showTransactionHistoryModal = false;
  let isRefreshing = false;
  let isManualRefreshing = false; // Track manual refresh to avoid reactive conflicts

  async function handleRefresh() {
    isRefreshing = true;
    isManualRefreshing = true;
    
    try {
      // Batch all refresh operations together for coordinated loading
      const refreshPromises: Promise<any>[] = [];
      
      // Always refresh YBT data
      refreshPromises.push(ybtStore.refresh());
      
      // Refresh house balance if handler provided
      if (onRefreshBalance) {
        refreshPromises.push(onRefreshBalance());
      }
      
      // Refresh P/L data if we have context (but let it fail gracefully)
      if (viewingAddress && currentContract?.id) {
        refreshPromises.push(
          ybtTransfersStore.refresh(viewingAddress, currentContract.id).catch(error => {
            console.error('Error refreshing P/L data:', error);
            // Don't throw - let other operations complete
          })
        );
      }
      
      // Execute all refreshes in parallel and wait for completion
      await Promise.all(refreshPromises);
      
    } catch (error) {
      console.error('Error during coordinated refresh:', error);
    } finally {
      isRefreshing = false;
      isManualRefreshing = false;
    }
  }

  async function handleYBTSuccess() {
    isManualRefreshing = true;
    
    try {
      // Batch refresh operations after successful YBT operation
      const refreshPromises: Promise<any>[] = [];
      
      // Always refresh YBT data after deposit/withdraw
      refreshPromises.push(ybtStore.refresh());
      
      // Refresh house balance if handler provided
      if (onRefreshBalance) {
        refreshPromises.push(onRefreshBalance());
      }
      
      // Refresh P/L data if we have context (but let it fail gracefully)
      if (viewingAddress && currentContract?.id) {
        refreshPromises.push(
          ybtTransfersStore.refresh(viewingAddress, currentContract.id).catch(error => {
            console.error('Error refreshing P/L data after YBT operation:', error);
            // Don't throw - let other operations complete
          })
        );
      }
      
      // Execute all refreshes in parallel
      await Promise.all(refreshPromises);
      
    } catch (error) {
      console.error('Error during post-YBT refresh:', error);
    } finally {
      isManualRefreshing = false;
    }
    
    // Notify parent component that balances have changed due to YBT operation
    dispatch('balanceChanged');
  }

  function formatShares(shares: bigint): string {
    // Use default decimals (9) since YBT contracts typically use 9 decimals
    return ybtService.formatShares(shares, 9);
  }

  // Format P/L amount for display
  function formatProfitLoss(amount: bigint, isProfit: boolean): string {
    const formatted = (Number(amount) / 1_000_000).toFixed(6);
    return isProfit ? `+${formatted}` : formatted;
  }

  // Format P/L percentage for display  
  function formatProfitLossPercentage(percentage: number, isProfit: boolean): string {
    const formatted = Math.abs(percentage).toFixed(2);
    return isProfit ? `+${formatted}%` : `-${formatted}%`;
  }

  // Get current user address for transaction history
  async function getCurrentUserAddress(): Promise<string | null> {
    try {
      const context = await ybtService.getWalletContext();
      return context?.address || null;
    } catch (error) {
      console.error('Error getting user address:', error);
      return null;
    }
  }
  
  
  
  function calculateUserPortfolioValue(): bigint {
    if (!houseBalance) return BigInt(0);
    // Convert to integer first to handle decimal values that can't be converted to BigInt
    const contractValue = BigInt(Math.floor(houseBalance.total));
    // Use latest store values, but allow zero shares case; P/L calc handles it
    return ybtService.calculateUserPortfolioValue($userShares, $totalSupply, contractValue);
  }
  
  // Global state is handled by YBT store - use derived values directly

  $: hasShares = $userShares > BigInt(0);
  
  // Use the prop instead of computing wallet availability internally
  $: hasAnyWallet = hasWalletConnected;
  
  // Check if wallet operations are blocked due to locked gaming wallet
  $: isWalletOperationBlocked = isGamingWalletLocked;

  // Get current contract for display purposes
  $: currentContract = contractContext || $selectedContract;
  
  // Track last contract and wallet to prevent duplicate refreshes
  let lastContractId: string | null = null;
  let lastWalletAddress: string | null = null;
  
  // Initialize/refresh P/L data (initial load, contract change, wallet change)
  // Skip during manual refresh to avoid conflicts
  $: if (currentContract && viewingAddress && !isManualRefreshing) {
    const contractId = currentContract.id;
    const contractChanged = contractId !== lastContractId;
    const walletChanged = viewingAddress !== lastWalletAddress;

    if (contractChanged || walletChanged) {
      lastContractId = contractId;
      lastWalletAddress = viewingAddress;
      ybtTransfersStore.reset();
      ybtTransfersStore.refresh(viewingAddress, contractId).catch(error => {
        console.error('Error initializing/refreshing P/L data:', error);
      });
    }
  }

  // Reset P/L data when wallet disconnects or contract becomes unavailable
  $: if ((!viewingAddress || !currentContract) && (lastContractId || lastWalletAddress)) {
    ybtTransfersStore.reset();
    lastContractId = null;
    lastWalletAddress = null;
  }
</script>

<div class="space-y-4 sm:space-y-6">
  <!-- Unified Portfolio Overview -->
  <div class="card p-4 sm:p-6">
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-3">
      <div class="flex-1">
        <h2 class="text-xl sm:text-2xl font-bold text-theme">
          House Portfolio
          {#if currentContract}
            <span class="text-base font-normal text-slate-400">• {currentContract.name}</span>
          {/if}
        </h2>
        <p class="text-xs sm:text-sm text-slate-400 mt-1">
          {#if currentContract}
            {currentContract.description} • Your investment position and contract status
          {:else}
            Your investment position and contract status
          {/if}
        </p>
      </div>
      <button
        on:click={handleRefresh}
        disabled={isRefreshing || $isYBTLoading || balanceLoading}
        class="btn-secondary text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto min-h-[44px]"
      >
        {#if isRefreshing || balanceLoading}
          <svg class="animate-spin -ml-1 mr-1 h-3 w-3 text-theme" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Refreshing...
        {:else}
          Refresh
        {/if}
      </button>
    </div>

    <!-- Show different content based on wallet connection and loading state -->
    {#if !hasWalletConnected}
      <!-- No wallet connected - show message -->
      <div class="text-center py-8">
        <div class="text-slate-400 mb-4">
          <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
          </svg>
          <p class="text-lg font-medium mb-2">Connect Wallet to View Portfolio</p>
          <p class="text-sm">Connect your wallet using the selector above to see your YBT holdings and manage your investments.</p>
        </div>
      </div>
    {:else}
      <!-- Main content - wallet connected and loaded -->
      <!-- Portfolio Value Highlight -->
      <div class="bg-gradient-to-r from-slate-700 to-slate-600 rounded-lg p-4 sm:p-6 border border-yellow-400/20 mb-4 sm:mb-6">
        <div class="text-slate-400 text-xs sm:text-sm font-medium mb-2">Portfolio Value</div>
        <div class="text-2xl sm:text-3xl md:text-4xl font-bold text-yellow-400 mb-2 min-h-[3rem] flex items-center">
          {#if balanceLoading || !houseBalance || $isYBTLoading}
            <div class="flex items-center opacity-60">
              <svg class="animate-spin h-6 w-6 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="text-slate-300">Updating...</span>
            </div>
          {:else}
            {(Number(calculateUserPortfolioValue()) / 1_000_000).toFixed(6)} VOI
          {/if}
        </div>
        <div class="text-xs sm:text-sm text-slate-400 min-h-[1.25rem] flex items-center">
          {#if balanceLoading || !houseBalance || $isYBTLoading}
            <span class="text-slate-500">Loading ownership details...</span>
          {:else}
            {$sharePercentage.toFixed(4)}% ownership of {(houseBalance.total / 1e6).toFixed(2)} VOI total pool
          {/if}
        </div>
        
        <!-- P/L Display - Always show to maintain layout -->
        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-slate-500/30 min-h-[4rem]">
          {#if $ybtProfitLoss && !balanceLoading && houseBalance && !$ybtTransfersLoading}
            <div class="flex-1">
              <div class="text-xs text-slate-400 font-medium mb-1">Profit/Loss</div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold {$ybtProfitLoss.isProfit ? 'text-green-400' : 'text-red-400'}">
                  {formatProfitLoss($ybtProfitLoss.profitLoss, $ybtProfitLoss.isProfit)} VOI
                </span>
                <span class="text-sm font-medium {$ybtProfitLoss.isProfit ? 'text-green-400' : 'text-red-400'}">
                  ({formatProfitLossPercentage($ybtProfitLoss.profitLossPercentage, $ybtProfitLoss.isProfit)})
                </span>
              </div>
            </div>
            <button
              on:click={async () => {
                const address = await getCurrentUserAddress();
                if (address) {
                  showTransactionHistoryModal = true;
                }
              }}
              class="btn-tertiary text-xs"
              disabled={!hasAnyWallet}
            >
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              History
            </button>
          {:else}
            <div class="flex-1 flex items-center">
              <div>
                <div class="text-xs text-slate-400 font-medium mb-1">Profit/Loss</div>
                <div class="flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span class="text-sm text-slate-500">Loading P/L data...</span>
                </div>
              </div>
            </div>
            <button
              class="btn-tertiary text-xs opacity-50"
              disabled
            >
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              History
            </button>
          {/if}
        </div>
      </div>

      <!-- Key Metrics Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <!-- Your Shares / Total Supply -->
        <div class="bg-slate-700 rounded-lg p-3 sm:p-4 sm:col-span-2 lg:col-span-1 min-h-[5.5rem]">
          <div class="text-slate-400 text-xs font-medium mb-2">Your Shares</div>
          <div class="text-lg sm:text-xl font-bold text-theme mb-1 min-h-[1.5rem] flex items-center">
            {#if $isYBTLoading}
              <span class="text-slate-400">Loading...</span>
            {:else}
              {formatShares($userShares)}
            {/if}
          </div>
          <div class="text-xs text-slate-500 min-h-[1rem] flex items-center">
            {#if $isYBTLoading}
              <span>Loading total shares...</span>
            {:else}
              of {formatShares($totalSupply)} total
            {/if}
          </div>
          <div class="w-full bg-slate-600 rounded-full h-1.5 mt-2">
            <div 
              class="bg-gradient-to-r from-voi-500 to-voi-400 h-1.5 rounded-full transition-all duration-300"
              style="width: {$isYBTLoading ? 0 : Math.min($sharePercentage, 100)}%"
            ></div>
          </div>
        </div>

        <!-- Contract Balance -->
        <div class="bg-slate-700 rounded-lg p-3 sm:p-4 min-h-[5.5rem]">
          <div class="text-slate-400 text-xs font-medium mb-2 flex items-center gap-1 sm:gap-2">
            Contract Balance
            {#if houseBalance && !balanceLoading}
              <span class="text-xs px-1.5 py-0.5 sm:px-2 rounded-full {houseBalance.isOperational ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}">
                {houseBalance.isOperational ? '●' : '⚠'}
              </span>
            {:else}
              <span class="text-xs px-1.5 py-0.5 sm:px-2 rounded-full bg-slate-600/30 text-slate-400">
                ⋯
              </span>
            {/if}
          </div>
          <div class="text-lg sm:text-xl font-bold text-theme mb-1 min-h-[1.5rem] flex items-center">
            {#if balanceLoading || !houseBalance}
              <span class="text-slate-400">Loading...</span>
            {:else}
              {(houseBalance.total / 1e6).toFixed(2)} VOI
            {/if}
          </div>
          <div class="text-xs text-slate-500 min-h-[2rem] flex items-start">
            {#if balanceLoading || !houseBalance}
              <span>Loading balance details...</span>
            {:else}
              <div>
                <span class="block sm:inline">{(houseBalance.available / 1e6).toFixed(1)} available</span>
                <span class="hidden sm:inline"> • </span>
                <span class="block sm:inline">{(houseBalance.locked / 1e6).toFixed(1)} locked</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Documentation -->
        <div class="bg-slate-700 rounded-lg p-3 sm:p-4 min-h-[5.5rem]">
          <div class="text-slate-400 text-xs font-medium mb-2">Learn More</div>
          <div class="text-xs sm:text-sm text-slate-300 mb-2">Yield-bearing token earning from house profits</div>
          <a 
            href="https://docs.houseofvoi.com" 
            target="_blank" 
            rel="noopener noreferrer"
            class="text-voi-400 hover:text-voi-300 text-xs sm:text-sm font-medium transition-colors duration-200 flex items-center gap-1 min-h-[44px] items-center"
          >
            Documentation
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
            </svg>
          </a>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="space-y-3 mt-4 sm:mt-6">
        <button
          on:click={() => showDepositModal = true}
          class="btn-primary-large w-full"
          disabled={!hasAnyWallet || $isMaintenanceMode || isWalletOperationBlocked}
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
          <span class="text-sm sm:text-base">
            {#if $isMaintenanceMode}
              Deposit Disabled (Maintenance)
            {:else if isWalletOperationBlocked}
              Unlock Wallet to Deposit
            {:else}
              Deposit VOI
            {/if}
          </span>
          {#if !$isMaintenanceMode && !isWalletOperationBlocked}
            <span class="text-xs opacity-75 ml-1 sm:ml-2 hidden sm:inline">→ Earn yield</span>
          {/if}
        </button>

        <button
          on:click={() => showWithdrawModal = true}
          class="btn-secondary-large w-full"
          disabled={!hasShares || !hasAnyWallet || $isMaintenanceMode || isWalletOperationBlocked}
        >
          <svg class="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 12H6"></path>
          </svg>
          <span class="text-sm sm:text-base">
            {#if $isMaintenanceMode}
              Withdraw Disabled (Maintenance)
            {:else if isWalletOperationBlocked}
              Unlock Wallet to Withdraw
            {:else}
              Withdraw VOI
            {/if}
          </span>
          {#if hasShares && !$isMaintenanceMode && !isWalletOperationBlocked}
            <span class="text-xs opacity-75 ml-1 sm:ml-2 hidden sm:inline">Available</span>
          {/if}
        </button>
      </div>

      <!-- Gaming Wallet Locked Notice -->
      {#if isWalletOperationBlocked}
        <div class="mt-4 p-3 sm:p-4 bg-amber-900/20 border border-amber-500/30 rounded-lg">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-8V7a4 4 0 10-8 0v2m0 0v2m0-2h2m-2 0H10"></path>
            </svg>
            <div class="text-xs sm:text-sm">
              <p class="font-medium text-amber-300">Gaming Wallet is Locked</p>
              <p class="text-amber-400 mt-1">
                Use the unlock button above to access your gaming wallet and enable deposits/withdrawals.
              </p>
            </div>
          </div>
        </div>
      {/if}

      {#if !hasShares}
        <div class="mt-4 p-3 sm:p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
          <div class="flex">
            <svg class="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 mt-0.5 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
            </svg>
            <div class="text-xs sm:text-sm">
              <p class="text-blue-300 font-medium">Start earning with YBT</p>
              <p class="text-blue-400 mt-1">
                Make your first deposit to start earning your share of the house profits.
              </p>
            </div>
          </div>
        </div>
      {/if}
    {/if}

    <!-- Error state - always rendered, shown based on error -->
    <div class:hidden={!$ybtStore.error} class="mt-4 p-3 sm:p-4 bg-red-900/20 border border-red-500/30 rounded-lg">
      <div class="flex">
        <svg class="w-4 h-4 sm:w-5 sm:h-5 text-red-400 mt-0.5 mr-2 sm:mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
        </svg>
        <div class="text-xs sm:text-sm">
          <p class="text-red-300 font-medium">Error loading YBT data</p>
          <p class="text-red-400 mt-1">{$ybtStore.error || ''}</p>
        </div>
      </div>
      <button
        on:click={() => ybtStore.clearError()}
        class="text-red-400 text-xs sm:text-sm underline mt-2 min-h-[44px] flex items-center"
      >
        Dismiss
      </button>
    </div>
  </div>
</div>

<!-- Modals -->
{#if showDepositModal}
  <YBTDepositModal 
    bind:open={showDepositModal}
    {contractContext}
    on:success={handleYBTSuccess}
  />
{/if}

{#if showWithdrawModal}
  <YBTWithdrawModal 
    bind:open={showWithdrawModal}
    userShares={$userShares}
    {contractContext}
    on:success={handleYBTSuccess}
  />
{/if}

{#if showTransactionHistoryModal}
  {#await getCurrentUserAddress() then userAddress}
    <YBTTransactionHistoryModal
      bind:open={showTransactionHistoryModal}
      {contractContext}
      {userAddress}
      on:close={() => showTransactionHistoryModal = false}
    />
  {/await}
{/if}

<style>
  .text-voi-400 {
    color: #10b981;
  }
  
  .btn-primary {
    @apply bg-voi-600 hover:bg-voi-700 text-theme font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center;
  }
  
  .btn-secondary {
    @apply bg-slate-700 hover:bg-slate-600 text-theme font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center;
    min-height: 40px;
  }
  
  @media (min-width: 640px) {
    .btn-secondary {
      @apply px-4;
    }
  }
  
  .btn-primary-large {
    @apply bg-voi-600 hover:bg-voi-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-sm;
    box-shadow: 0 4px 6px -1px rgba(5, 150, 105, 0.2), 0 2px 4px -1px rgba(5, 150, 105, 0.1);
    min-height: 48px;
  }
  
  @media (min-width: 640px) {
    .btn-primary-large {
      @apply py-4 px-6 text-base;
    }
  }
  
  .btn-primary-large:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 8px -1px rgba(5, 150, 105, 0.3), 0 4px 6px -1px rgba(5, 150, 105, 0.15);
  }
  
  .btn-secondary-large {
    @apply bg-slate-700 hover:bg-slate-600 border border-slate-600 hover:border-slate-500 text-theme font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center text-sm;
    min-height: 48px;
  }
  
  @media (min-width: 640px) {
    .btn-secondary-large {
      @apply px-6 text-base;
    }
  }
  
  .btn-secondary-large:hover {
    transform: translateY(-1px);
  }
  
  .btn-tertiary {
    @apply bg-slate-600 hover:bg-slate-500 text-slate-300 hover:text-white font-medium py-1.5 px-3 rounded-md transition-all duration-200 flex items-center justify-center text-xs;
    min-height: 32px;
  }
  
  .btn-tertiary:disabled {
    @apply opacity-50 cursor-not-allowed;
  }
  
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
  
  .bg-voi-500 {
    background-color: #10b981;
  }
  
  .from-voi-500 {
    --tw-gradient-from: #10b981;
  }
  
  .to-voi-400 {
    --tw-gradient-to: #10b981;
  }
  
</style>