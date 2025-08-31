<script lang="ts">
  import { onMount } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { ybtService } from '$lib/services/ybt';
  import { BETTING_CONSTANTS } from '$lib/constants/betting';
  import { TrendingUp, Minus, RefreshCw } from 'lucide-svelte';
  
  export let compact = false;
  
  let isLoading = false;
  let error: string | null = null;
  let isRefreshing = false;
  
  // Staking data
  let userShares = BigInt(0);
  let totalSupply = BigInt(0);
  let sharePercentage = 0;
  let contractValue = BigInt(0);
  let portfolioValue = BigInt(0);
  
  // Form data
  let quickStakeAmount = '';
  let customAmount = '';
  let quickUnstakePercent = '';
  let showCustomStake = false;
  let showUnstakeForm = false;
  
  // Quick stake options (percentages of available balance)
  const quickStakeOptions = [10, 25, 50, 100];
  
  // Quick unstake options (percentages)
  const quickUnstakeOptions = [25, 50, 75, 100];
  
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
  
  async function handleQuickStake(percent: number) {
    const stakeAmount = (availableBalance * percent) / 100;
    await handleStake(stakeAmount.toString());
  }
  
  async function handleCustomStake() {
    await handleStake(customAmount);
  }
  
  async function handleStake(amountStr: string) {
    if (!amountStr || parseFloat(amountStr) <= 0) {
      error = 'Please enter a valid amount to stake';
      return;
    }
    
    // Validate staking amount with 1 VOI reserve requirement
    const amountInMicroVOI = Math.floor(parseFloat(amountStr) * 1_000_000);
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
        customAmount = '';
        quickStakeAmount = '';
        showCustomStake = false;
        await loadStakingData();
        // Refresh wallet balance
        walletStore.refreshBalance();
      } else {
        error = result.error || 'Staking failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Staking failed';
    } finally {
      isLoading = false;
    }
  }
  
  async function handleQuickUnstake(percent: number) {
    const sharesToWithdraw = (userShares * BigInt(percent)) / BigInt(100);
    await handleUnstake(sharesToWithdraw);
  }
  
  async function handleUnstake(sharesToWithdraw: bigint) {
    if (sharesToWithdraw <= BigInt(0)) {
      error = 'Invalid unstake amount';
      return;
    }
    
    isLoading = true;
    error = null;
    
    try {
      const result = await ybtService.withdraw({ shares: sharesToWithdraw });
      
      if (result.success) {
        showUnstakeForm = false;
        await loadStakingData();
        // Refresh wallet balance
        walletStore.refreshBalance();
      } else {
        error = result.error || 'Unstaking failed';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unstaking failed';
    } finally {
      isLoading = false;
    }
  }
  
  async function refresh() {
    isRefreshing = true;
    await loadStakingData();
    setTimeout(() => isRefreshing = false, 1000);
  }
  
  onMount(() => {
    loadStakingData();
  });
  
  $: hasShares = userShares > BigInt(0);
  $: reserveAmount = BETTING_CONSTANTS.STAKING_RESERVE_AMOUNT;
  $: maxStakeableBalance = Math.max(0, $walletStore.balance - reserveAmount);
  $: maxStakeAmount = (maxStakeableBalance / 1_000_000).toFixed(6);
  $: availableBalance = maxStakeableBalance / 1_000_000;
</script>

<div class="space-y-4 p-4">
  <!-- Header with refresh -->
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-theme flex items-center gap-2">
      <TrendingUp class="w-5 h-5 text-voi-400" />
      Staking
    </h3>
    <button
      on:click={refresh}
      disabled={isRefreshing || isLoading}
      class="p-2 text-theme-text opacity-70 hover:opacity-100 transition-colors disabled:opacity-50"
      title="Refresh staking data"
    >
      <RefreshCw class="w-4 h-4 {isRefreshing ? 'animate-spin' : ''}" />
    </button>
  </div>

  <!-- Description -->
  <div class="text-sm text-theme-text opacity-80 leading-relaxed">
    Stake with the house and share in house profits and losses. 
    <a 
      href="https://docs.houseofvoi.com" 
      target="_blank" 
      rel="noopener noreferrer"
      class="text-voi-400 hover:text-voi-300 underline transition-colors"
    >
      Learn more
    </a>
  </div>

  {#if isLoading && !isRefreshing}
    <div class="text-center py-6">
      <div class="w-6 h-6 border-2 border-voi-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
      <p class="text-theme-text opacity-70 text-sm">Loading staking data...</p>
    </div>
  {:else if error}
    <div class="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
      <p class="text-red-300 text-sm">{error}</p>
      <button 
        on:click={() => error = null}
        class="text-red-400 text-xs underline mt-1"
      >
        Dismiss
      </button>
    </div>
  {/if}

  <!-- Portfolio Summary -->
  {#if !isLoading || isRefreshing}
    <div class="bg-gradient-to-r from-voi-600/20 to-voi-500/20 rounded-lg p-4 border border-voi-500/30">
      <div class="text-voi-400 text-xs font-medium mb-1">Portfolio Value</div>
      <div class="text-xl font-bold text-theme">
        {(Number(portfolioValue) / 1_000_000).toFixed(6)} VOI
      </div>
      <div class="text-xs text-theme-text opacity-70">
        {sharePercentage.toFixed(4)}% of total pool
      </div>
    </div>
  {/if}

  {#if hasShares}
    <!-- Quick Unstake Options -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-theme-text">Quick Unstake</span>
        <button
          on:click={() => showUnstakeForm = !showUnstakeForm}
          class="text-xs text-voi-400 hover:text-voi-300"
        >
          {showUnstakeForm ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {#if showUnstakeForm}
        <div class="grid grid-cols-4 gap-2">
          {#each quickUnstakeOptions as percent}
            <button
              on:click={() => handleQuickUnstake(percent)}
              disabled={isLoading}
              class="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-theme text-xs font-medium rounded transition-colors"
            >
              {percent}%
            </button>
          {/each}
        </div>
        <div class="text-xs text-theme-text opacity-70">
          Your shares: {ybtService.formatShares(userShares, 9)}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Quick Stake Options -->
  <div class="space-y-3">
    <span class="text-sm font-medium text-theme-text">Quick Stake</span>
    <div class="grid grid-cols-4 gap-2">
      {#each quickStakeOptions as percent}
        <button
          on:click={() => handleQuickStake(percent)}
          disabled={isLoading || availableBalance < 0.001}
          class="px-3 py-2 bg-voi-600 hover:bg-voi-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
          title={`Stake ${((availableBalance * percent) / 100).toFixed(6)} VOI`}
        >
          {percent}%
        </button>
      {/each}
    </div>
  </div>

  <!-- Custom Amount -->
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-theme-text">Custom Amount</span>
      <button
        on:click={() => showCustomStake = !showCustomStake}
        class="text-xs text-voi-400 hover:text-voi-300"
      >
        {showCustomStake ? 'Hide' : 'Show'}
      </button>
    </div>
    
    {#if showCustomStake}
      <div class="flex gap-2">
        <input
          type="number"
          bind:value={customAmount}
          step="0.000001"
          min="0"
          max={maxStakeAmount}
          placeholder="Amount..."
          class="flex-1 px-3 py-2 bg-surface-secondary border border-surface-border rounded text-theme text-sm focus:outline-none focus:ring-2 focus:ring-voi-500 focus:border-transparent"
        />
        <button
          on:click={handleCustomStake}
          disabled={isLoading || !customAmount || parseFloat(customAmount) <= 0}
          class="px-3 py-2 bg-voi-600 hover:bg-voi-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
        >
          Stake
        </button>
      </div>
      <div class="text-xs text-theme-text opacity-70">
        Available: {maxStakeAmount} VOI
      </div>
    {/if}
  </div>

  {#if !hasShares}
    <div class="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
      <p class="text-blue-300 text-sm">
        Start earning by staking your VOI! Your staked funds earn a share of house profits.
      </p>
    </div>
  {:else}
    <!-- Stats -->
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-surface-secondary rounded-lg p-3 text-center">
        <div class="text-theme-text opacity-70 text-xs mb-1">Your Shares</div>
        <div class="text-theme font-semibold text-sm">
          {ybtService.formatShares(userShares, 9)}
        </div>
      </div>
      <div class="bg-surface-secondary rounded-lg p-3 text-center">
        <div class="text-theme-text opacity-70 text-xs mb-1">Ownership</div>
        <div class="text-theme font-semibold text-sm">
          {sharePercentage.toFixed(4)}%
        </div>
      </div>
    </div>
  {/if}

  <!-- Risk Disclaimer -->
  <div class="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
    <div class="text-xs">
      <p class="text-amber-400 font-semibold mb-1">⚠️ House Staking Risk:</p>
      <p class="text-amber-300">
        As a house contributor, you share in both profits and losses. 
        You earn when the house wins, but can lose tokens when players win. 
        Your deposit is at risk. Only stake what you can afford to lose.
      </p>
    </div>
  </div>
</div>

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
  
  .hover\:text-voi-300:hover {
    color: #34d399;
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
  
  .focus\:ring-voi-500:focus {
    --tw-ring-color: #10b981;
  }
</style>