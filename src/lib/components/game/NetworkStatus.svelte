<!-- Phase 7: Network Status Component -->
<!-- Monitors blockchain connection and network health -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-svelte';
  import { queueProcessor } from '$lib/services/queueProcessor';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
  
  let networkStatus: 'connected' | 'disconnected' | 'checking' = 'checking';
  let currentRound = 0;
  let blockTime = 0;
  let lastUpdate = 0;
  let lastRound = 0;
  let statusInterval: NodeJS.Timeout;
  
  onMount(() => {
    checkNetworkStatus();
    
    // Check every configured interval
    statusInterval = setInterval(checkNetworkStatus, BLOCKCHAIN_CONFIG.statusCheckInterval);
  });
  
  onDestroy(() => {
    if (statusInterval) {
      clearInterval(statusInterval);
    }
  });
  
  async function checkNetworkStatus() {
    try {
      const status = await queueProcessor.getNetworkStatus();
      
      if (status.connected) {
        const now = Date.now();
        
        // Calculate block time if we have previous data
        if (lastRound > 0 && lastUpdate > 0 && status.currentRound > lastRound) {
          const timeDiff = now - lastUpdate;
          const roundDiff = status.currentRound - lastRound;
          blockTime = timeDiff / roundDiff / 1000; // Convert to seconds
        }
        
        currentRound = status.currentRound;
        lastRound = currentRound;
        lastUpdate = now;
        networkStatus = 'connected';
      } else {
        networkStatus = 'disconnected';
      }
      
    } catch (error) {
      console.error('Network status check failed:', error);
      networkStatus = 'disconnected';
    }
  }
  
  $: statusColor = {
    connected: 'text-green-400',
    disconnected: 'text-red-400',
    checking: 'text-yellow-400'
  }[networkStatus];
  
  $: statusIcon = {
    connected: CheckCircle,
    disconnected: WifiOff,
    checking: AlertCircle
  }[networkStatus];
  
  $: statusText = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    checking: 'Checking...'
  }[networkStatus];
</script>

<div class="network-status">
  <div class="flex items-center gap-2">
    <svelte:component 
      this={statusIcon} 
      class="w-4 h-4 {statusColor}"
      class:animate-pulse={networkStatus === 'checking'}
    />
    <span class="text-sm font-medium {statusColor}">{statusText}</span>
  </div>
  
  {#if networkStatus === 'connected'}
    <div class="network-details">
      <div class="detail">
        <span class="label">Round:</span>
        <span class="value">{currentRound.toLocaleString()}</span>
      </div>
      {#if blockTime > 0}
        <div class="detail">
          <span class="label">Block Time:</span>
          <span class="value">{blockTime.toFixed(1)}s</span>
        </div>
      {/if}
      <div class="detail">
        <span class="label">Network:</span>
        <span class="value">Voi</span>
      </div>
    </div>
  {:else if networkStatus === 'disconnected'}
    <div class="network-details">
      <span class="text-xs text-red-300">
        Check your internet connection and try again
      </span>
    </div>
  {/if}
</div>

<style>
  .network-status {
    @apply bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 backdrop-blur-sm;
  }
  
  .network-details {
    @apply flex items-center gap-4 mt-2 text-xs text-gray-400;
  }
  
  .detail {
    @apply flex items-center gap-1;
  }
  
  .label {
    @apply text-gray-500;
  }
  
  .value {
    @apply text-white font-medium;
  }
  
  /* Mobile optimization */
  @media (max-width: 640px) {
    .network-details {
      @apply flex-col items-start gap-1;
    }
    
    .detail {
      @apply text-xs;
    }
  }
</style>