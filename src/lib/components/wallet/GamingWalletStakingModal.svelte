<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { ybtService } from '$lib/services/ybt';
  import { walletStore } from '$lib/stores/wallet';
  import { formatVOI, BETTING_CONSTANTS } from '$lib/constants/betting';
  import { X, TrendingUp, Minus } from 'lucide-svelte';
  
  export let isVisible = false;
  
  const dispatch = createEventDispatcher();
  
  let isLoading = false;
  let error: string | null = null;
  let activeTab: 'stake' | 'unstake' | 'view' = 'view';
  
  // Staking data
  let userShares = BigInt(0);
  let totalSupply = BigInt(0);
  let sharePercentage = 0;
  let contractValue = BigInt(0);
  let portfolioValue = BigInt(0);
  
  // Form data
  let stakeAmount = '';
  let unstakeShares = '';
  
  async function loadStakingData() {
    if (!$walletStore.account?.address) return;
    
    isLoading = true;
    error = null;
    
    try {
      const [globalState, shares, contractVal] = await Promise.all([
        ybtService.getGlobalState(),
        ybtService.getUserShares($walletStore.account.address),
        ybtService.getContractTotalValue()
      ]);
      
      userShares = shares;
      totalSupply = globalState.totalSupply;
      sharePercentage = ybtService.calculateSharePercentage(shares, globalState.totalSupply);
      contractValue = contractVal;
      portfolioValue = ybtService.calculateUserPortfolioValue(shares, globalState.totalSupply, contractVal);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load staking data';
    } finally {
      isLoading = false;
    }
  }
  
  async function handleStake() {
    if (!stakeAmount || parseFloat(stakeAmount) <= 0) {
      error = 'Please enter a valid amount to stake';
      return;
    }
    
    // Validate staking amount with 1 VOI reserve requirement
    const amountInMicroVOI = Math.floor(parseFloat(stakeAmount) * 1_000_000);
    const validation = ybtService.validateStakingAmount(BigInt(amountInMicroVOI), BigInt($walletStore.balance));
    
    if (!validation.valid) {
      error = validation.error || 'Invalid staking amount';
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      const result = await ybtService.deposit({ amount: BigInt(amountInMicroVOI) });
      
      if (result.success) {
        stakeAmount = '';
        await loadStakingData();
        dispatch('success', { type: 'stake', txId: result.txId });
      } else {
        error = result.error || 'Staking failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Staking failed';
    } finally {
      isLoading = false;
    }
  }
  
  async function handleUnstake() {
    if (!unstakeShares || parseFloat(unstakeShares) <= 0) {
      error = 'Please enter a valid amount of shares to unstake';
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      const sharesToWithdraw = Math.floor(parseFloat(unstakeShares) * Math.pow(10, 9)); // 9 decimals
      const result = await ybtService.withdraw({ shares: BigInt(sharesToWithdraw) });
      
      if (result.success) {
        unstakeShares = '';
        await loadStakingData();
        dispatch('success', { type: 'unstake', txId: result.txId });
      } else {
        error = result.error || 'Unstaking failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unstaking failed';
    } finally {
      isLoading = false;
    }
  }
  
  function close() {
    dispatch('close');
    isVisible = false;
  }
  
  onMount(() => {
    if (isVisible) {
      loadStakingData();
    }
  });
  
  $: if (isVisible) {
    loadStakingData();
  }
  
  $: hasShares = userShares > BigInt(0);
  $: reserveAmount = BETTING_CONSTANTS.STAKING_RESERVE_AMOUNT;
  $: maxStakeableBalance = Math.max(0, $walletStore.balance - reserveAmount);
  $: maxStakeAmount = (maxStakeableBalance / 1_000_000).toFixed(6);
  $: maxUnstakeShares = ybtService.formatShares(userShares, 9);
</script>

{#if isVisible}
  <!-- Modal Backdrop -->
  <div 
    class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    on:click={close}
  >
    <!-- Modal Content -->
    <div 
      class="bg-surface-primary rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden"
      on:click|stopPropagation
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-surface-border">
        <h2 class="text-xl font-bold text-theme flex items-center gap-2">
          <TrendingUp class="w-5 h-5 text-voi-400" />
          Gaming Wallet Staking
        </h2>
        <button 
          on:click={close}
          class="p-2 text-theme-text opacity-70 hover:opacity-100 transition-colors rounded-lg hover:bg-surface-secondary"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
        <!-- Tab Navigation -->
        <div class="flex bg-surface-secondary rounded-lg p-1 mb-6">
          <button
            on:click={() => activeTab = 'view'}
            class="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors {activeTab === 'view' ? 'bg-voi-600 text-white' : 'text-theme-text hover:bg-surface-hover'}"
          >
            Portfolio
          </button>
          <button
            on:click={() => activeTab = 'stake'}
            class="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors {activeTab === 'stake' ? 'bg-voi-600 text-white' : 'text-theme-text hover:bg-surface-hover'}"
          >
            Stake
          </button>
          <button
            on:click={() => activeTab = 'unstake'}
            class="flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors {activeTab === 'unstake' ? 'bg-voi-600 text-white' : 'text-theme-text hover:bg-surface-hover'}"
            disabled={!hasShares}
          >
            Unstake
          </button>
        </div>

        {#if isLoading}
          <div class="text-center py-8">
            <div class="w-8 h-8 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p class="text-theme-text opacity-70">Loading staking data...</p>
          </div>
        {:else if error}
          <div class="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
            <p class="text-red-300 text-sm">{error}</p>
            <button 
              on:click={() => error = null}
              class="text-red-400 text-xs underline mt-2"
            >
              Dismiss
            </button>
          </div>
        {/if}

        {#if activeTab === 'view'}
          <!-- Portfolio View -->
          <div class="space-y-4">
            <!-- Portfolio Value -->
            <div class="bg-gradient-to-r from-voi-600/20 to-voi-500/20 rounded-lg p-4 border border-voi-500/30">
              <div class="text-voi-400 text-sm font-medium mb-1">Portfolio Value</div>
              <div class="text-2xl font-bold text-theme">
                {(Number(portfolioValue) / 1_000_000).toFixed(6)} VOI
              </div>
              <div class="text-xs text-theme-text opacity-70 mt-1">
                {sharePercentage.toFixed(4)}% of total pool
              </div>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 gap-3">
              <div class="bg-surface-secondary rounded-lg p-3">
                <div class="text-theme-text opacity-70 text-xs mb-1">Your Shares</div>
                <div class="text-theme font-semibold">
                  {ybtService.formatShares(userShares, 9)}
                </div>
              </div>
              <div class="bg-surface-secondary rounded-lg p-3">
                <div class="text-theme-text opacity-70 text-xs mb-1">Total Supply</div>
                <div class="text-theme font-semibold">
                  {ybtService.formatShares(totalSupply, 9)}
                </div>
              </div>
            </div>

            {#if !hasShares}
              <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 text-center">
                <p class="text-blue-300 text-sm">
                  You don't have any staked VOI yet. Start earning by staking some of your gaming wallet balance!
                </p>
              </div>
            {/if}
          </div>
        {:else if activeTab === 'stake'}
          <!-- Stake Form -->
          <div class="space-y-4">
            <div>
              <label class="block text-theme-text text-sm font-medium mb-2">
                Amount to Stake (VOI)
              </label>
              <input
                type="number"
                bind:value={stakeAmount}
                step="0.000001"
                min="0"
                max={maxStakeAmount}
                placeholder="Enter amount..."
                class="w-full px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent"
              />
              <div class="flex justify-between text-xs text-theme-text opacity-70 mt-1">
                <span>Min: 0.000001 VOI</span>
                <span>Max: {maxStakeAmount} VOI</span>
              </div>
            </div>

            <div class="space-y-3">
              <div class="bg-surface-secondary rounded-lg p-3">
                <div class="text-theme-text opacity-70 text-xs mb-2">About Staking</div>
                <p class="text-theme text-sm">
                  Stake your VOI to earn a share of house profits. Your staked VOI is converted to YBT shares that represent your ownership percentage.
                </p>
              </div>
              
              <div class="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
                <div class="text-amber-400 text-xs font-semibold mb-2">⚠️ House Staking Risk</div>
                <p class="text-amber-300 text-sm">
                  As a house contributor, you share in both profits and losses. You earn when the house wins, but can lose tokens when players win. Your staked amount is at risk. Only stake what you can afford to lose.
                </p>
              </div>
            </div>

            <button
              on:click={handleStake}
              disabled={isLoading || !stakeAmount || parseFloat(stakeAmount) <= 0}
              class="w-full bg-voi-600 hover:bg-voi-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {#if isLoading}
                <div class="flex items-center justify-center">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Staking...
                </div>
              {:else}
                Stake VOI
              {/if}
            </button>
          </div>
        {:else if activeTab === 'unstake'}
          <!-- Unstake Form -->
          <div class="space-y-4">
            <div>
              <label class="block text-theme-text text-sm font-medium mb-2">
                Shares to Unstake
              </label>
              <input
                type="number"
                bind:value={unstakeShares}
                step="0.000000001"
                min="0"
                max={maxUnstakeShares}
                placeholder="Enter shares..."
                class="w-full px-3 py-2 bg-surface-secondary border border-surface-border rounded-lg text-theme focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent"
              />
              <div class="flex justify-between text-xs text-theme-text opacity-70 mt-1">
                <span>Min: 0.000000001</span>
                <span>Max: {maxUnstakeShares}</span>
              </div>
            </div>

            <div class="bg-surface-secondary rounded-lg p-3">
              <div class="text-theme-text opacity-70 text-xs mb-2">Current Value</div>
              <p class="text-theme text-sm">
                Your {ybtService.formatShares(userShares, 9)} shares are worth approximately {(Number(portfolioValue) / 1_000_000).toFixed(6)} VOI
              </p>
            </div>

            <button
              on:click={handleUnstake}
              disabled={isLoading || !hasShares || !unstakeShares || parseFloat(unstakeShares) <= 0}
              class="w-full bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              {#if isLoading}
                <div class="flex items-center justify-center">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Unstaking...
                </div>
              {:else}
                Unstake Shares
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bg-voi-600 {
    background-color: #059669;
  }
  
  .hover\:bg-voi-700:hover {
    background-color: #047857;
  }
  
  .text-voi-400 {
    color: #10b981;
  }
  
  .border-voi-500\/30 {
    border-color: rgba(16, 185, 129, 0.3);
  }
  
  .from-voi-600\/20 {
    --tw-gradient-from: rgba(5, 150, 105, 0.2);
  }
  
  .to-voi-500\/20 {
    --tw-gradient-to: rgba(16, 185, 129, 0.2);
  }
</style>