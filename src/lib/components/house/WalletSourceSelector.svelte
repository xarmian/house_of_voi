<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { walletStore, isWalletConnected } from '$lib/stores/wallet';
  import { walletStore as externalWalletStore } from '$lib/stores/walletAdapter';
  import { walletService } from '$lib/services/wallet';
  import { selectedWallet, Web3Wallet } from 'avm-wallet-svelte';
  import { Wallet, Gamepad2, ExternalLink, Unlock } from 'lucide-svelte';
  import { browser } from '$app/environment';
  import WalletSetupGateway from '../wallet/WalletSetupGateway.svelte';
  import { balanceManager } from '$lib/services/balanceManager';
  import type algosdk from 'algosdk';
  
  export let selectedSource: 'gaming' | 'external' = 'external';
  export let algodClient: algosdk.Algodv2;
  export let availableWallets: string[];
  export let wcProject: {
    projectId: string;
    projectName: string;
    projectDescription: string;
    projectUrl: string;
    projectIcons: string[];
  };
  
  const dispatch = createEventDispatcher();
  
  let showUnlockModal = false;
  let lockedWalletBalance = 0;
  let externalWalletBalance = 0;
  let userHasManuallySelected = false; // Track if user has made a manual selection
  
  // Check wallet states
  $: gamingWalletAvailable = $isWalletConnected && !$walletStore.isGuest && $walletStore.account;
  $: gamingWalletExists = browser && walletService.hasStoredWallet();
  $: gamingWalletLocked = gamingWalletExists && !gamingWalletAvailable;
  $: externalWalletAvailable = $selectedWallet !== null;
  
  async function unlockGamingWallet() {
    showUnlockModal = true;
  }
  
  function handleWalletUnlocked() {
    showUnlockModal = false;
    // Gaming wallet should now be available, auto-select it and mark as manually selected
    if ($isWalletConnected) {
      selectedSource = 'gaming';
      userHasManuallySelected = true; // Prevent auto-switching after unlock
      const isLocked = gamingWalletLocked;
      dispatch('change', { source: 'gaming', isLocked });
    }
  }
  
  function handleModalClose() {
    showUnlockModal = false;
  }
  
  
  // Auto-select available wallet only if user hasn't made a manual selection
  $: if (!userHasManuallySelected) {
    if (!externalWalletAvailable && gamingWalletExists && selectedSource === 'external') {
      selectedSource = 'gaming';
      const isLocked = gamingWalletLocked;
      dispatch('change', { source: 'gaming', isLocked });
    } else if (!gamingWalletExists && externalWalletAvailable && selectedSource === 'gaming') {
      selectedSource = 'external';
      dispatch('change', { source: 'external', isLocked: false });
    }
  }
  
  function handleSourceChange(source: 'gaming' | 'external') {
    selectedSource = source;
    userHasManuallySelected = true; // Mark as manually selected to prevent auto-switching
    const isLocked = source === 'gaming' && gamingWalletLocked;
    dispatch('change', { source, isLocked });
  }
  
  // Get stored wallet address for locked gaming wallet
  $: storedWalletAddress = browser ? walletService.getStoredWalletAddress() : null;
  
  // Fetch balance for locked wallet when address changes
  $: if (storedWalletAddress && gamingWalletLocked) {
    balanceManager.getBalance(storedWalletAddress).then(balance => {
      lockedWalletBalance = balance;
    }).catch(error => {
      console.error('Error fetching locked wallet balance:', error);
      lockedWalletBalance = 0;
    });
  }
  
  // Fetch balance for external wallet when address changes
  $: if ($selectedWallet?.address) {
    balanceManager.getBalance($selectedWallet.address).then(balance => {
      externalWalletBalance = balance;
    }).catch(error => {
      console.error('Error fetching external wallet balance:', error);
      externalWalletBalance = 0;
    });
  }
  
  $: activeWalletInfo = selectedSource === 'gaming' && gamingWalletAvailable ?
    { address: $walletStore.account.address, type: 'Gaming Wallet', isLocked: false } :
    selectedSource === 'gaming' && gamingWalletLocked && storedWalletAddress ?
    { address: storedWalletAddress, type: 'Gaming Wallet (Locked)', isLocked: true } :
    selectedSource === 'external' && externalWalletAvailable ?
    { address: $selectedWallet.address, type: $selectedWallet.app, isLocked: false } :
    null;
</script>

<div class="bg-surface-secondary rounded-lg p-4 border border-surface-border">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-sm font-medium text-theme">Wallet Source</h3>
    {#if activeWalletInfo}
      <div class="flex items-center gap-2 text-xs text-theme-text opacity-70">
        <div class="w-2 h-2 bg-green-400 rounded-full"></div>
        <div class="flex items-center gap-1">
          {#if activeWalletInfo.isLocked}
            <svg class="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-2 0h4m-2-2v-2a2 2 0 00-2-2h-4a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2v-6a2 2 0 00-2-2h-4v-2a3 3 0 00-6 0z"></path>
            </svg>
          {/if}
          <a 
            href="https://voirewards.com/wallet/{activeWalletInfo.address}" 
            target="_blank" 
            rel="noopener noreferrer"
            class="hover:text-voi-300 transition-colors duration-200 underline decoration-dotted underline-offset-2 {activeWalletInfo.isLocked ? 'text-amber-400' : ''}"
          >
            {activeWalletInfo.address.slice(0, 6)}...{activeWalletInfo.address.slice(-4)}
          </a>
        </div>
        <span class="text-voi-400">{activeWalletInfo.type}</span>
      </div>
    {/if}
  </div>
  
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <!-- External Wallet Option -->
    <div class="rounded-lg border p-4 transition-all {
      selectedSource === 'external' 
        ? 'bg-voi-600/20 border-voi-500' 
        : 'bg-surface-tertiary border-surface-border hover:bg-surface-hover'
    }">
      <button
        on:click={() => handleSourceChange('external')}
        disabled={!externalWalletAvailable}
        class="w-full text-left space-y-3 {!externalWalletAvailable ? 'opacity-50' : ''}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <ExternalLink class="w-4 h-4" />
            <span class="font-medium text-sm">External Wallet</span>
          </div>
          <div class="w-4 h-4 rounded-full border-2 {
            selectedSource === 'external' ? 'bg-voi-500 border-voi-500' : 'border-gray-400'
          }"></div>
        </div>
        
        {#if externalWalletAvailable}
          <div class="space-y-1">
            <div class="text-xs font-mono text-theme-text">
              {$selectedWallet.address.slice(0, 8)}...{$selectedWallet.address.slice(-8)}
            </div>
            <div class="text-xs text-theme-text opacity-70">
              {(externalWalletBalance / 1_000_000).toFixed(3)} VOI
            </div>
          </div>
        {/if}
      </button>
      
      <!-- Web3Wallet Component - Always show for external wallet -->
      {#if !externalWalletAvailable}
        <div class="px-3 pb-3 border-t border-surface-border">
          <div class="text-xs text-theme-text opacity-70 mb-2">
            Connect Kibisis, Lute, or WalletConnect
          </div>
          <div class="avm-wallet-container">
            <Web3Wallet 
              {algodClient} 
              {availableWallets}
              allowWatchAccounts={true}
              {wcProject}
            />
          </div>
        </div>
      {:else}
        <div class="px-3border-t border-surface-border">
          <div class="avm-wallet-container">
            <Web3Wallet 
              {algodClient} 
              {availableWallets}
              allowWatchAccounts={true}
              {wcProject}
            />
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Gaming Wallet Option -->
    <div class="rounded-lg border p-4 transition-all {
      selectedSource === 'gaming' 
        ? 'bg-voi-600/20 border-voi-500' 
        : 'bg-surface-tertiary border-surface-border hover:bg-surface-hover'
    }">
      <button
        on:click={() => handleSourceChange('gaming')}
        disabled={!gamingWalletExists}
        class="w-full text-left space-y-3 {!gamingWalletExists ? 'opacity-50' : ''}"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Gamepad2 class="w-4 h-4" />
            <span class="font-medium text-sm">Gaming Wallet</span>
          </div>
          <div class="w-4 h-4 rounded-full border-2 {
            selectedSource === 'gaming' ? 'bg-voi-500 border-voi-500' : 'border-gray-400'
          }"></div>
        </div>
        
        {#if gamingWalletAvailable}
          <div class="space-y-1">
            <div class="text-xs font-mono text-theme-text">
              {$walletStore.account.address.slice(0, 8)}...{$walletStore.account.address.slice(-8)}
            </div>
            <div class="text-xs text-theme-text opacity-70">
              {($walletStore.balance / 1_000_000).toFixed(3)} VOI
            </div>
          </div>
          <div class="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded-full inline-block">
            Unlocked
          </div>
        {:else if gamingWalletLocked && storedWalletAddress}
          <div class="space-y-1">
            <div class="text-xs font-mono text-amber-400">
              {storedWalletAddress.slice(0, 8)}...{storedWalletAddress.slice(-8)}
            </div>
            <div class="text-xs text-theme-text opacity-70">
              {(lockedWalletBalance / 1_000_000).toFixed(3)} VOI
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-xs bg-amber-900/30 text-amber-400 px-2 py-1 rounded-full inline-block">
              Locked
            </div>
            <button
              on:click|stopPropagation={unlockGamingWallet}
              class="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded flex items-center gap-1"
            >
              <Unlock class="w-3 h-3" />
              Unlock
            </button>
          </div>
        {:else}
          <div class="space-y-2">
            <div class="text-xs text-theme-text opacity-70">
              Built-in slot machine wallet
            </div>
            <div class="text-xs bg-gray-900/30 text-gray-400 px-2 py-1 rounded-full inline-block">
              Not Set Up
            </div>
          </div>
        {/if}
      </button>
    </div>
  </div>
  
  {#if !gamingWalletAvailable && !externalWalletAvailable}
    <div class="mt-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg">
      <div class="flex items-center gap-2">
        <Wallet class="w-4 h-4 text-amber-400" />
        <div class="text-xs text-amber-300">
          <p class="font-medium">No wallets available</p>
          <p class="text-amber-400 mt-1">
            Connect an external wallet above or visit the 
            <a href="/app" class="text-voi-400 hover:text-voi-300 underline">game page</a> 
            to set up a gaming wallet.
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Wallet Unlock Modal -->
{#if showUnlockModal}
  <WalletSetupGateway
    bind:isOpen={showUnlockModal}
    showAddFundsAfterUnlock={false}
    on:walletReady={handleWalletUnlocked}
    on:close={handleModalClose}
  />
{/if}

<style lang="postcss">
  .bg-voi-600\/20 {
    background-color: rgba(5, 150, 105, 0.2);
  }
  
  .border-voi-500 {
    border-color: #10b981;
  }
  
  .bg-voi-500 {
    background-color: #10b981;
  }
  
  .text-voi-400 {
    color: #10b981;
  }
  
  .hover\:text-voi-300:hover {
    color: #34d399;
  }

  /* avm-wallet-svelte styling for dark theme */
  .avm-wallet-container {
    color-scheme: dark;
  }
  
  /* Target the main wallet connect button */
  :global(.avm-wallet-container button),
  :global(.avm-wallet-container [role="button"]) {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    transition: all 0.2s ease-in-out !important;
    font-weight: 500 !important;
    padding: 0.5rem 1rem !important;
    border-radius: 0.5rem !important;
    border: 1px solid #334155 !important; /* slate-700 */
    font-size: 0.875rem !important;
    min-height: auto !important;
    @apply w-full;
  }
  :global(.avm-wallet-container button) {
    @apply m-1;
  }

  :global(.avm-wallet-container button:hover),
  :global(.avm-wallet-container [role="button"]:hover) {
    background-color: #334155 !important; /* slate-700 */
    transform: translateY(-1px) !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
  }
  
  /* Override any modal/dropdown backgrounds */
  :global(.avm-wallet-container div[class*="modal"]),
  :global(.avm-wallet-container div[class*="dropdown"]),
  :global(.avm-wallet-container div[class*="menu"]),
  :global(.avm-wallet-container div[style*="position: fixed"]),
  :global(.avm-wallet-container div[style*="position: absolute"]) {
    background-color: #0f172a !important; /* slate-900 */
    color: #f8fafc !important; /* slate-50 */
    border: 1px solid #334155 !important; /* slate-700 */
    border-radius: 0.5rem !important;
    z-index: 9999 !important;
  }
  
  /* Override wallet option items */
  :global(.avm-wallet-container div[class*="wallet"]),
  :global(.avm-wallet-container [role="menuitem"]),
  :global(.avm-wallet-container [role="option"]) {
    background-color: #1e293b !important; /* slate-800 */
    color: #f8fafc !important; /* slate-50 */
    margin: 0.25rem !important;
    border-radius: 0.375rem !important;
    @apply w-full;
  }
  
  /* Override any text elements */
  :global(.avm-wallet-container),
  :global(.avm-wallet-container *) {
    color: #f8fafc !important; /* slate-50 */
  }
  
  /* Override specific Tailwind classes that might be light-themed */
  :global(.avm-wallet-container .bg-white) { background-color: #1e293b !important; }
  :global(.avm-wallet-container .bg-gray-50) { background-color: #1e293b !important; }
  :global(.avm-wallet-container .bg-gray-100) { background-color: #334155 !important; }
  :global(.avm-wallet-container .text-gray-900) { color: #f8fafc !important; }
  :global(.avm-wallet-container .text-black) { color: #f8fafc !important; }
  :global(.avm-wallet-container .border-gray-300) { border-color: #334155 !important; }
</style>