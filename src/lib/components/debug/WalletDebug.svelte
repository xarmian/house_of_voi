<script lang="ts">
  import { walletStore, isWalletConnected, walletAddress as gamingWalletAddress } from '$lib/stores/wallet';
  import { selectedWallet } from 'avm-wallet-svelte';
  import { walletAddress as thirdPartyWalletAddress } from '$lib/stores/walletAdapter';
  import { ybtStore } from '$lib/stores/ybt';
  import { ybtService } from '$lib/services/ybt';
  import { onMount } from 'svelte';
  
  let walletContext = null;
  
  async function getWalletContext() {
    walletContext = await ybtService.getWalletContext();
  }
  
  onMount(() => {
    getWalletContext();
  });
</script>

<div class="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
  <h3 class="text-red-300 font-semibold mb-3">🐛 Wallet Debug Info</h3>
  
  <div class="space-y-2 text-xs text-red-200 font-mono">
    <div><strong>Gaming Wallet Store:</strong></div>
    <div class="ml-4">
      - isConnected: {$walletStore.isConnected}<br>
      - isGuest: {$walletStore.isGuest}<br>
      - isLocked: {$walletStore.isLocked}<br>
      - hasAccount: {!!$walletStore.account}<br>
      - address: {$walletStore.account?.address || 'null'}
    </div>
    
    <div><strong>isWalletConnected derived:</strong> {$isWalletConnected}</div>
    <div><strong>gamingWalletAddress derived:</strong> {$gamingWalletAddress || 'null'}</div>
    
    <div><strong>Third-party Wallet:</strong></div>
    <div class="ml-4">
      - selectedWallet exists: {!!$selectedWallet}<br>
      - address: {$selectedWallet?.address || 'null'}<br>
      - app: {$selectedWallet?.app || 'null'}
    </div>
    
    <div><strong>thirdPartyWalletAddress derived:</strong> {$thirdPartyWalletAddress || 'null'}</div>
    
    <div><strong>YBT Store:</strong></div>
    <div class="ml-4">
      - userShares: {$ybtStore.userShares?.toString() || '0'}<br>
      - sharePercentage: {$ybtStore.sharePercentage}<br>
      - isLoading: {$ybtStore.isLoading}<br>
      - error: {$ybtStore.error || 'null'}
    </div>
    
    <div><strong>YBT Service Context:</strong></div>
    <div class="ml-4">
      {#if walletContext}
        - type: {walletContext.type}<br>
        - address: {walletContext.address}
      {:else}
        - No context available
      {/if}
    </div>
    
    <button 
      on:click={getWalletContext}
      class="mt-2 px-2 py-1 bg-red-600 text-white text-xs rounded"
    >
      Refresh Context
    </button>
  </div>
</div>