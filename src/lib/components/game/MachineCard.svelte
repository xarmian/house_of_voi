<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { contractHealthStore } from '$lib/stores/multiContract';
  import { machineStatsService, MachineStatsService, type MachineStats } from '$lib/services/machineStatsService';
  import { playerMachineStatsService, PlayerMachineStatsService } from '$lib/services/playerMachineStats';
  import { walletService } from '$lib/services/wallet';
  import { algorandService } from '$lib/services/algorand';
  import algosdk from 'algosdk';
  import type { ContractPair } from '$lib/types/multiContract';
  import type { PlayerMachineStats } from '../types/hovStats';
  import { 
    Play, 
    Users, 
    TrendingUp, 
    Target,
    AlertTriangle,
    Clock,
    Crown,
    Zap,
    Coins,
    Loader2,
    User
  } from 'lucide-svelte';

  export let contract: ContractPair;
  export let showStats = true;
  export let showPlayButton = true;
  export let size: 'sm' | 'md' | 'lg' = 'md';

  let machineStats: MachineStats | null = null;
  let playerStats: PlayerMachineStats | null = null;
  let isLoadingPlayerStats = false;
  let hasInsufficientBalance = false;
  let isCheckingBalance = true;

  const dispatch = createEventDispatcher<{
    play: { contract: ContractPair };
    select: { contract: ContractPair };
  }>();

  // Get machine icon based on metadata, theme, or name
  function getMachineIcon() {
    // If custom icon is specified in metadata, try to match it
    if (contract.metadata.icon) {
      const icon = contract.metadata.icon.toLowerCase();
      if (icon === 'crown') return Crown;
      if (icon === 'zap' || icon === 'lightning') return Zap;
      if (icon === 'coins' || icon === 'treasure') return Coins;
      if (icon === 'clock' || icon === 'time') return Clock;
    }
    
    // Fall back to name-based icon selection
    const name = contract.name.toLowerCase();
    if (name.includes('crown') || name.includes('royal')) return Crown;
    if (name.includes('lightning') || name.includes('bolt') || name.includes('electric')) return Zap;
    if (name.includes('treasure') || name.includes('gold') || name.includes('coin')) return Coins;
    if (name.includes('time') || name.includes('clock')) return Clock;
    
    // Default icon
    return Play;
  }

  // Get contract health status
  function getHealthStatus() {
    return $contractHealthStore.healthStatuses[contract.id];
  }

  // Load machine statistics
  async function loadStats() {
    try {
      machineStats = await machineStatsService.getMachineStats(contract);
    } catch (error) {
      console.error(`Failed to load stats for ${contract.name}:`, error);
      machineStats = {
        contractId: contract.id,
        totalBets: BigInt(0),
        totalAmountBet: BigInt(0),
        totalAmountPaid: BigInt(0),
        totalWinningSpins: BigInt(0),
        averageBetSize: 0,
        averagePayout: 0,
        winPercentage: 0,
        houseEdge: contract.metadata.houseEdge || 5.0,
        rtp: 0,
        netPlatformResult: BigInt(0),
        uniquePlayers: BigInt(0),
        largestSingleWin: BigInt(0),
        largestSingleBet: BigInt(0),
        error: 'Failed to load stats',
        lastUpdated: Date.now()
      };
    }
  }

  // Load player statistics for this machine
  async function loadPlayerStats(address: string) {
    try {
      isLoadingPlayerStats = true;
      playerStats = await playerMachineStatsService.getPlayerStatsForMachine(
        address, 
        contract.slotMachineAppId
      );
    } catch (error) {
      console.error(`Failed to load player stats for ${contract.name}:`, error);
      playerStats = null;
    } finally {
      isLoadingPlayerStats = false;
    }
  }

  // Check machine balance
  async function checkBalance() {
    if (!algorandService) {
      hasInsufficientBalance = true;
      isCheckingBalance = false;
      return;
    }
    
    try {
      isCheckingBalance = true;
      const contractAddress = algosdk.getApplicationAddress(contract.slotMachineAppId);
      const balance = await algorandService.getBalance(contractAddress);
      
      // Check if balance is less than 100,000 VOI (100,000,000,000 atomic units)
      hasInsufficientBalance = balance < 100_000_000_000;
      
      console.log(`Balance check for ${contract.name}:`, {
        balance: balance / 1e6 + ' VOI',
        hasInsufficientBalance
      });
    } catch (error) {
      console.error(`Failed to check balance for ${contract.name}:`, error);
      // On error, assume balance is insufficient for safety
      hasInsufficientBalance = true;
    } finally {
      isCheckingBalance = false;
    }
  }

  // Get status styling
  function getStatusStyle(status: string): string {
    switch (status) {
      case 'active': return 'status-active';
      case 'maintenance': return 'status-maintenance';
      case 'inactive': return 'status-inactive';
      case 'testing': return 'status-testing';
      default: return 'status-unknown';
    }
  }

  // Get health indicator
  function getHealthIndicator() {
    const health = getHealthStatus();
    if (!health) return { color: 'text-gray-400', pulse: false };

    switch (health.status) {
      case 'healthy': return { color: 'text-green-400', pulse: false };
      case 'warning': return { color: 'text-yellow-400', pulse: true };
      case 'error': return { color: 'text-red-400', pulse: true };
      default: return { color: 'text-gray-400', pulse: false };
    }
  }

  // Add onMount to load stats and check balance
  onMount(() => {
    if (showStats) {
      loadStats();
    }
    checkBalance();
    
    // Load player stats if wallet address exists
    const walletData = walletService.getPublicWalletData();
    if (walletData?.address) {
      loadPlayerStats(walletData.address);
    }
  });

  // Reactive statement to load player stats when wallet changes
  $: {
    const walletData = walletService.getPublicWalletData();
    if (walletData?.address) {
      loadPlayerStats(walletData.address);
    } else {
      playerStats = null;
      isLoadingPlayerStats = false;
    }
  }

  // Check if machine is playable
  function isPlayable(): boolean {
    return contract.status === 'active' && 
           contract.features.gameplayEnabled &&
           !$contractHealthStore.healthStatuses[contract.id]?.status?.includes('error') &&
           !hasInsufficientBalance;
  }

  // Get size classes
  function getSizeClasses() {
    switch (size) {
      case 'sm':
        return {
          card: 'p-4',
          icon: 'w-8 h-8',
          title: 'text-lg',
          description: 'text-sm',
          button: 'px-3 py-2 text-sm'
        };
      case 'lg':
        return {
          card: 'p-8',
          icon: 'w-16 h-16',
          title: 'text-2xl',
          description: 'text-base',
          button: 'px-6 py-3 text-base'
        };
      case 'md':
      default:
        return {
          card: 'p-6',
          icon: 'w-12 h-12',
          title: 'text-xl',
          description: 'text-sm',
          button: 'px-4 py-2 text-sm'
        };
    }
  }

  $: MachineIcon = getMachineIcon();
  $: healthIndicator = getHealthIndicator();
  $: playable = isPlayable();
  $: sizeClasses = getSizeClasses();
</script>

<div 
  class="machine-card {sizeClasses.card}"
  class:playable
  class:maintenance={contract.status === 'maintenance'}
  class:inactive={!playable}
  class:insufficient-balance={hasInsufficientBalance}
  on:click={() => !hasInsufficientBalance && dispatch('select', { contract })}
  on:keydown={(e) => e.key === 'Enter' && !hasInsufficientBalance && dispatch('select', { contract })}
  role="button"
  tabindex="0"
>
  <!-- Machine Icon and Status -->
  <div class="machine-header">
    <div class="machine-icon-container">
      {#if contract.metadata.thumbnail}
        <div class="machine-thumbnail">
          <img src={contract.metadata.thumbnail} alt={contract.name} class="thumbnail-image" />
          <div class="health-indicator {healthIndicator.color}" class:pulse={healthIndicator.pulse}>
            ●
          </div>
        </div>
      {:else}
        <div class="machine-icon">
          <svelte:component this={MachineIcon} class={sizeClasses.icon} />
        </div>
        <div class="health-indicator {healthIndicator.color}" class:pulse={healthIndicator.pulse}>
          ●
        </div>
      {/if}
    </div>
    
    <div class="status-badges">
      <span class="status-badge {getStatusStyle(contract.status)}">
        {contract.status}
      </span>
      {#if contract.features.betaMode}
        <span class="beta-badge">Beta</span>
      {/if}
    </div>
  </div>

  <!-- Machine Info -->
  <div class="machine-info">
    <h3 class="machine-title {sizeClasses.title}">{contract.name}</h3>
    <p class="machine-description {sizeClasses.description}">{contract.description}</p>
    
    {#if showStats}
      <!-- Statistics -->
      <div class="machine-stats">
        {#if machineStats?.isLoading}
          <div class="stat-item loading">
            <Loader2 class="w-4 h-4 text-slate-400 animate-spin" />
            <span class="stat-label">Loading statistics...</span>
          </div>
        {:else if machineStats?.error}
          <div class="stat-item error">
            <AlertTriangle class="w-4 h-4 text-red-400" />
            <span class="stat-label text-red-400">Failed to load stats</span>
          </div>
        {:else if machineStats}
          <div class="stat-item">
            <div class="stat-icon">
              <TrendingUp class="w-4 h-4 text-green-400" />
            </div>
            <div class="stat-content">
              <span class="stat-label">Total Bet</span>
              <span class="stat-value">
                {MachineStatsService.formatVOI(machineStats.totalAmountBet)} VOI
              </span>
            </div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <Users class="w-4 h-4 text-blue-400" />
            </div>
            <div class="stat-content">
              <span class="stat-label">Players</span>
              <span class="stat-value">
                {MachineStatsService.formatNumber(machineStats.uniquePlayers)}
              </span>
            </div>
          </div>

          <div class="stat-item">
            <div class="stat-icon">
              <Target class="w-4 h-4 text-purple-400" />
            </div>
            <div class="stat-content">
              <span class="stat-label">Win Rate</span>
              <span class="stat-value">{machineStats.winPercentage.toFixed(1)}%</span>
            </div>
          </div>
        {:else}
          <div class="stat-item">
            <div class="stat-icon">
              <Target class="w-4 h-4 text-purple-400" />
            </div>
            <div class="stat-content">
              <span class="stat-label">Win Rate</span>
              <span class="stat-value">--</span>
            </div>
          </div>
        {/if}
      </div>
      
      <!-- Player Statistics -->
      {#if walletService.getPublicWalletData()?.address}
        <div class="player-stats-section">
          <div class="player-stats-header">
            <User class="w-3 h-3 text-slate-400" />
            <span class="player-stats-title">Your Stats</span>
          </div>
          
          <div class="player-stats">
            {#if isLoadingPlayerStats}
              <div class="stat-item loading">
                <Loader2 class="w-4 h-4 text-slate-400 animate-spin" />
                <span class="stat-label">Loading your stats...</span>
              </div>
            {:else if playerStats}
              <div class="stat-item">
                <div class="stat-content">
                  <span class="stat-label">Spins</span>
                  <span class="stat-value">{PlayerMachineStatsService.formatNumber(playerStats.total_spins)}</span>
                </div>
              </div>

              <div class="stat-item">
                <div class="stat-content">
                  <span class="stat-label">Win Rate</span>
                  <span class="stat-value">{playerStats.win_rate.toFixed(1)}%</span>
                </div>
              </div>

              {#if playerStats.highest_multiple >= 10}
                <div class="stat-item">
                  <div class="stat-content">
                    <span class="stat-label">Best</span>
                    <span class="stat-value">{playerStats.highest_multiple.toFixed(1)}x</span>
                  </div>
                </div>
              {/if}
            {:else if playerStats === null}
              <div class="stat-item">
                <span class="stat-label no-stats">No plays yet</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- Action Button -->
  {#if showPlayButton}
    <div class="machine-actions">
      {#if playable && !hasInsufficientBalance}
        <button
          on:click|stopPropagation={() => dispatch('play', { contract })}
          class="play-button {sizeClasses.button}"
        >
          <Play class="w-4 h-4" />
          <span>Play Now</span>
        </button>
      {:else if hasInsufficientBalance}
        <div class="unavailable-notice">
          <AlertTriangle class="w-4 h-4 text-red-400" />
          <span class="text-red-400">Insufficient Funds</span>
        </div>
      {:else if contract.status === 'maintenance'}
        <div class="maintenance-notice">
          <AlertTriangle class="w-4 h-4 text-yellow-400" />
          <span class="text-yellow-400">Under Maintenance</span>
        </div>
      {:else}
        <div class="unavailable-notice">
          <AlertTriangle class="w-4 h-4 text-red-400" />
          <span class="text-red-400">Unavailable</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Insufficient Balance Overlay -->
  {#if hasInsufficientBalance}
    <div class="insufficient-balance-overlay">
      <div class="banner-text">
        This machine is currently unavailable
      </div>
    </div>
  {/if}
</div>

<style>
  .machine-card {
    background-color: var(--theme-surface-primary, #1e293b);
    border: 1px solid var(--theme-surface-border, #64748b);
    border-radius: 0.75rem;
    transition: all 0.3s ease;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    outline: none;
  }

  .machine-card:focus {
    box-shadow: 0 0 0 2px var(--theme-primary, #10b981);
  }

  .machine-card.playable:hover {
    background-color: var(--theme-surface-hover, #475569);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    border-color: var(--theme-primary, #10b981);
  }

  .machine-card.maintenance {
    border-color: rgba(251, 191, 36, 0.3);
    background-color: rgba(var(--theme-surface-primary-rgb, 30, 41, 59), 0.6);
  }

  .machine-card.inactive {
    border-color: var(--theme-surface-tertiary, #475569);
    background-color: rgba(var(--theme-surface-primary-rgb, 30, 41, 59), 0.4);
    cursor: not-allowed;
  }

  .machine-card.inactive:hover {
    border-color: var(--theme-surface-tertiary, #475569);
    background-color: rgba(var(--theme-surface-primary-rgb, 30, 41, 59), 0.4);
  }

  .machine-card.insufficient-balance {
    border-color: var(--theme-surface-tertiary, #475569);
    background-color: rgba(var(--theme-surface-primary-rgb, 30, 41, 59), 0.3);
    cursor: not-allowed;
    opacity: 0.6;
    filter: grayscale(0.3);
  }

  .machine-card.insufficient-balance:hover {
    border-color: var(--theme-surface-tertiary, #475569);
    background-color: rgba(var(--theme-surface-primary-rgb, 30, 41, 59), 0.3);
  }

  .machine-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .machine-icon-container {
    position: relative;
  }

  .machine-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem;
    background-color: rgba(var(--theme-surface-secondary-rgb, 51, 65, 85), 0.5);
    border-radius: 0.5rem;
    border: 1px solid rgba(var(--theme-surface-border-rgb, 100, 116, 139), 0.5);
  }

  .machine-card.playable .machine-icon {
    background-color: rgba(var(--theme-primary-rgb, 16, 185, 129), 0.2);
    border-color: rgba(var(--theme-primary-rgb, 16, 185, 129), 0.3);
  }

  .machine-thumbnail {
    position: relative;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid rgba(var(--theme-surface-border-rgb, 100, 116, 139), 0.5);
  }

  .machine-card.playable .machine-thumbnail {
    border-color: rgba(var(--theme-primary-rgb, 16, 185, 129), 0.3);
  }

  .thumbnail-image {
    width: 4rem;
    height: 4rem;
    object-fit: cover;
  }

  .health-indicator {
    position: absolute;
    top: -0.25rem;
    right: -0.25rem;
    font-size: 0.875rem;
  }

  .health-indicator.pulse {
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: .5;
    }
  }

  .status-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 9999px;
    border: 1px solid;
  }

  .status-active {
    background-color: rgba(34, 197, 94, 0.3);
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.3);
  }

  .status-maintenance {
    background-color: rgba(234, 179, 8, 0.3);
    color: #fbbf24;
    border-color: rgba(234, 179, 8, 0.3);
  }

  .status-inactive {
    background-color: rgba(239, 68, 68, 0.3);
    color: #f87171;
    border-color: rgba(239, 68, 68, 0.3);
  }

  .status-testing {
    background-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.3);
  }

  .status-unknown {
    background-color: rgba(107, 114, 128, 0.3);
    color: #9ca3af;
    border-color: rgba(107, 114, 128, 0.3);
  }

  .beta-badge {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 9999px;
    background-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .machine-info {
    margin-bottom: 1.5rem;
  }

  .machine-title {
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    margin-bottom: 0.5rem;
  }

  .machine-description {
    color: var(--theme-text, #ffffff);
    opacity: 0.7;
    margin-bottom: 1rem;
  }

  .machine-stats {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--theme-text, #ffffff);
    opacity: 0.6;
    font-weight: 500;
  }

  .stat-value {
    font-size: 0.875rem;
    color: var(--theme-text, #ffffff);
    font-weight: 600;
  }

  .stat-item.loading {
    justify-content: center;
    grid-column: 1 / -1;
  }

  .stat-item.error {
    justify-content: center;
    grid-column: 1 / -1;
  }

  .machine-actions {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .play-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--theme-primary, #10b981);
    color: white;
    border-radius: 0.5rem;
    font-weight: 500;
    transition: all 0.2s ease;
    width: 100%;
    justify-content: center;
    outline: none;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .play-button:hover {
    background-color: var(--theme-secondary, #4ade80);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  }

  .play-button:focus {
    box-shadow: 0 0 0 2px var(--theme-primary, #10b981);
  }

  .maintenance-notice,
  .unavailable-notice {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 0.5rem;
    width: 100%;
    background-color: rgba(var(--theme-surface-secondary-rgb, 51, 65, 85), 0.5);
    border: 1px solid var(--theme-surface-border, #64748b);
  }


  /* Insufficient Balance Overlay */
  .insufficient-balance-overlay {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    background: linear-gradient(45deg, 
      transparent 40%, 
      rgba(220, 38, 38, 0.9) 42%, 
      rgba(220, 38, 38, 0.9) 58%, 
      transparent 60%
    );
  }

  .banner-text {
    color: white;
    font-weight: 700;
    font-size: 0.875rem;
    text-align: center;
    padding: 0.5rem 1rem;
    line-height: 1.25;
    transform: rotate(45deg);
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    white-space: nowrap;
  }

  /* Player Stats Styling */
  .player-stats-section {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(var(--theme-surface-border-rgb, 100, 116, 139), 0.3);
  }

  .player-stats-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .player-stats-title {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--theme-text, #ffffff);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .player-stats {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .player-stats .stat-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .player-stats .stat-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .player-stats .stat-label {
    font-size: 0.75rem;
    color: var(--theme-text, #ffffff);
    opacity: 0.5;
  }

  .player-stats .stat-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    opacity: 0.8;
  }

  .player-stats .stat-value.profit {
    color: #10b981;
  }

  .player-stats .stat-value.loss {
    color: #ef4444;
  }

  .player-stats .stat-label.no-stats {
    font-size: 0.75rem;
    color: var(--theme-text, #ffffff);
    opacity: 0.5;
    text-align: center;
    width: 100%;
  }

  .player-stats .stat-item.loading {
    justify-content: center;
  }
</style>