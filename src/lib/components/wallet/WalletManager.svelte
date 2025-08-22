<script lang="ts">
  import { onMount } from 'svelte';
  import { walletStore, isWalletConnected } from '$lib/stores/wallet';
  import { walletActions } from '$lib/stores/walletActions';
  import { walletService } from '$lib/services/wallet';
  import WalletDisplay from './WalletDisplay.svelte';
  import WalletSetupGateway from './WalletSetupGateway.svelte';

  export let compact = false;

  // Gateway modal state
  let showWalletGateway = false;
  let showAddFundsAfterUnlock = true;

  // Subscribe to wallet store
  $: wallet = $walletStore;
  $: connected = $isWalletConnected;

  onMount(async () => {
    // Initialize wallet store (starts in guest mode)
    await walletStore.initialize();
    
    // Note: We no longer auto-prompt existing users since they can see 
    // their wallet info and unlock button in the WalletDisplay component
  });

  // Listen for wallet setup triggers from other components
  $: if ($walletActions.triggerSetup) {
    handleStartWalletSetup();
  }

  // Handle wallet setup initiation from Add Funds button
  function handleStartWalletSetup() {
    showAddFundsAfterUnlock = true; // Show Add Funds after unlock when explicitly adding funds
    showWalletGateway = true;
  }

  // Handle unlock-only flow (no Add Funds after)
  function handleUnlockWallet() {
    showAddFundsAfterUnlock = false; // Don't show Add Funds after unlock
    showWalletGateway = true;
  }

  // Handle wallet lock/disconnect  
  function handleLock() {
    walletStore.lock();
    showWalletGateway = true;
  }

  function handleDisconnect() {
    if (confirm('Are you sure you want to disconnect your wallet? Make sure you have your recovery phrase saved!')) {
      walletStore.resetWallet();
    }
  }

  // Handle gateway close
  function handleGatewayClose() {
    showWalletGateway = false;
  }
</script>

<!-- Main wallet display when connected or in guest mode -->
{#if connected || wallet.isGuest}
  <WalletDisplay 
    {compact}
    on:lock={handleLock}
    on:disconnect={handleDisconnect}
    on:startSetup={handleStartWalletSetup}
    on:unlock={handleUnlockWallet}
  />
{/if}

<!-- Wallet setup gateway -->
<WalletSetupGateway
  bind:isOpen={showWalletGateway}
  {showAddFundsAfterUnlock}
  on:close={handleGatewayClose}
/>