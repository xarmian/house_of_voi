<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Copy, QrCode, CreditCard, X } from 'lucide-svelte';
  import QRCode from 'qrcode';
  import IBuyVoiWidget from '../widget/IBuyVoiWidget.svelte';
  import AlgorandTransferTab from './AlgorandTransferTab.svelte';
  import { deviceCapabilities } from '$lib/utils/device';

  console.log(deviceCapabilities.isMobile);
  
  export let address: string;
  
  const dispatch = createEventDispatcher();
  
  let qrCodeUrl = '';
  let copySuccess = false;
  let activeTab = 'buy'; // 'transfer' | 'buy'
  let transferSubTab = 'voi'; // 'voi' | 'algorand'
  let purchaseSuccess = false;
  let purchaseError: string | null = null;
  
  onMount(async () => {
    if (address) {
      try {
        qrCodeUrl = await QRCode.toDataURL(address, {
          width: 200,
          margin: 2,
          color: {
            dark: '#1f2937',
            light: '#ffffff'
          }
        });
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    }
  });
  
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      copySuccess = true;
      setTimeout(() => copySuccess = false, 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }
  
  function closeModal() {
    dispatch('close');
  }
  
  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      closeModal();
    }
  }

  function handlePurchaseComplete(event: CustomEvent) {
    const { voiTxId, amount } = event.detail;
    purchaseSuccess = true;
    purchaseError = null;
    console.log('Purchase completed:', { voiTxId, amount });
    
    // Optionally close modal after success
    setTimeout(() => {
      closeModal();
    }, 3000);
  }

  function handlePurchaseError(event: CustomEvent) {
    const { message } = event.detail;
    purchaseError = message;
    purchaseSuccess = false;
    console.error('Purchase error:', message);
  }

  function handleWidgetClose() {
    // Reset state when widget is closed
    purchaseSuccess = false;
    purchaseError = null;
  }
</script>

<!-- Modal Overlay -->
<div 
  class="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
  on:click={handleOverlayClick}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
>
  <div class="card max-w-lg w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-surface-border">
      <h2 id="modal-title" class="text-xl font-semibold text-theme">Add Credits to Account</h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Tab Navigation -->
    <div class="flex border-b border-surface-border">
      <button
        class="flex-1 py-4 px-6 text-center transition-colors"
        class:bg-surface-secondary={activeTab === 'buy'}
        class:text-theme={activeTab === 'buy'}
        class:text-gray-400={activeTab !== 'buy'}
        on:click={() => activeTab = 'buy'}
      >
        <div class="font-medium">Buy VOI</div>
        <div class="text-xs mt-1 opacity-75">With USD using Debit or Apple Pay</div>
      </button>
      <button
        class="flex-1 py-4 px-6 text-center transition-colors"
        class:bg-surface-secondary={activeTab === 'transfer'}
        class:text-theme={activeTab === 'transfer'}
        class:text-gray-400={activeTab !== 'transfer'}
        on:click={() => activeTab = 'transfer'}
      >
        <div class="font-medium">Transfer VOI</div>
        <div class="text-xs mt-1 opacity-75">From a Voi or Algorand Wallet</div>
      </button>
    </div>
    
    <!-- Tab Content -->
    <div class="p-6">
      {#if activeTab === 'transfer'}
        <!-- Transfer Tab -->
        <div class="space-y-6">
          <!-- Transfer Sub-navigation -->
          <div class="flex border-b border-surface-border">
            <button
              class="flex-1 py-2 px-4 text-center text-sm transition-colors"
              class:bg-surface-secondary={transferSubTab === 'voi'}
              class:text-theme={transferSubTab === 'voi'}
              class:text-gray-400={transferSubTab !== 'voi'}
              on:click={() => transferSubTab = 'voi'}
            >
              From Voi Network
            </button>
            <button
              class="flex-1 py-2 px-4 text-center text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              class:bg-surface-secondary={transferSubTab === 'algorand'}
              class:text-theme={transferSubTab === 'algorand'}
              class:text-gray-400={transferSubTab !== 'algorand'}
              on:click={() => transferSubTab = 'algorand'}
              disabled={true}
            >
              From Algorand Network
              <span class="text-xs text-gray-400">Temporarily Disabled</span>
            </button>
          </div>
          
          {#if transferSubTab === 'voi'}
            <!-- Voi Transfer (Original Content) -->
            <div class="space-y-6">
              <!-- QR Code -->
              {#if qrCodeUrl}
                <div class="text-center">
                  <div class="inline-block p-4 bg-white rounded-lg">
                    <img src={qrCodeUrl} alt="Wallet QR Code" class="mx-auto" />
                  </div>
                  <p class="text-sm text-gray-400 mt-2">Scan with your VOI wallet</p>
                </div>
              {/if}
              
              <!-- Address -->
              <div>
                <label class="block text-sm font-medium text-gray-300 mb-2">
                  Wallet Address
                </label>
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    value={address}
                    readonly
                    class="flex-1 input-field font-mono text-sm"
                  />
                  <button
                    on:click={copyAddress}
                    class="btn-secondary p-2"
                    title="Copy address"
                  >
                    <Copy class="w-4 h-4" />
                  </button>
                </div>
                {#if copySuccess}
                  <p class="text-voi-400 text-xs mt-1">Address copied!</p>
                {/if}
              </div>
              
              <!-- Instructions -->
              <div class="space-y-3">
                <h4 class="font-medium text-theme">How to add funds:</h4>
                <ol class="list-decimal list-inside space-y-2 text-sm text-gray-400">
                  <li>Copy the wallet address above or scan the QR code</li>
                  <li>Send VOI tokens from your main wallet or exchange</li>
                  <li>Funds will appear in your gaming wallet within seconds</li>
                  <li>Start playing once the transaction confirms</li>
                </ol>
              </div>
              
              <!-- Warning -->
              <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
                <p class="text-blue-400 text-sm">
                  <strong>ℹ️ Note:</strong> Only send VOI tokens to this address using Voi Network. 
                  Sending other tokens, or using another networks, may result in permanent loss.
                </p>
              </div>
            </div>
          {:else}
            <!-- Algorand Transfer (New Content) -->
            <AlgorandTransferTab {address} />
          {/if}
        </div>
      {:else}
        <!-- Buy Tab -->
        <div class="space-y-6">
          {#if purchaseSuccess}
            <!-- Success State -->
            <div class="text-center p-6 bg-green-50 border border-green-200 rounded-lg">
              <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-green-800 mb-2">Purchase Successful!</h3>
              <p class="text-green-600 text-sm mb-4">
                Your VOI tokens will appear in your wallet shortly.
              </p>
              <p class="text-xs text-green-500">This modal will close automatically...</p>
            </div>
          {:else if purchaseError}
            <!-- Error State -->
            <div class="text-center p-6 bg-red-50 border border-red-200 rounded-lg">
              <div class="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 class="text-lg font-semibold text-red-800 mb-2">Purchase Failed</h3>
              <p class="text-red-600 text-sm mb-4">{purchaseError}</p>
              <button 
                on:click={() => { purchaseError = null; }}
                class="btn-secondary text-sm"
              >
                Try Again
              </button>
            </div>
          {:else}
            <!-- Widget State -->
            <IBuyVoiWidget 
              destination={address}
              theme="dark"
              width={deviceCapabilities.isMobile ? 320 : 440}
              height={500}
              on:purchaseComplete={handlePurchaseComplete}
              on:purchaseError={handlePurchaseError}
              on:close={handleWidgetClose}
            />
          {/if}
        </div>
      {/if}
    </div>
    
    <!-- Footer -->
    <div class="p-6 border-t border-surface-border text-center">
      <button
        on:click={closeModal}
        class="btn-secondary"
      >
        Close
      </button>
    </div>
  </div>
</div>