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
  let gatewayMode: 'setup' | 'add' = 'setup';

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

  // Handle wallet setup initiation (for new users or adding wallets)
  function handleStartWalletSetup(event?: CustomEvent) {
    // Check if this is an "add wallet" request vs initial setup
    const detail = event?.detail;
    if (detail?.mode === 'add' || ($wallet.availableWallets && $wallet.availableWallets.length > 0)) {
      gatewayMode = 'add';
    } else {
      gatewayMode = 'setup';
    }
    showWalletGateway = true;
  }

  // Handle unlock flow
  function handleUnlockWallet() {
    gatewayMode = 'setup';
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

<!-- Main wallet display - always show if we have wallets or are connected -->
{#if connected || wallet.isGuest || wallet.availableWallets.length > 0}
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
  mode={gatewayMode}
  on:close={handleGatewayClose}
/>