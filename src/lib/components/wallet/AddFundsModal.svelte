<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Copy, QrCode, CreditCard, X } from 'lucide-svelte';
  import QRCode from 'qrcode';
  
  export let address: string;
  
  const dispatch = createEventDispatcher();
  
  let qrCodeUrl = '';
  let copySuccess = false;
  let activeTab = 'transfer'; // 'transfer' | 'buy'
  
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
    <div class="flex items-center justify-between p-6 border-b border-slate-700">
      <h2 id="modal-title" class="text-xl font-semibold text-theme">Add Funds to Wallet</h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-theme transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Tab Navigation -->
    <div class="flex border-b border-slate-700">
      <button
        class="flex-1 py-3 px-6 text-center transition-colors"
        class:bg-slate-700={activeTab === 'transfer'}
        class:text-theme={activeTab === 'transfer'}
        class:text-gray-400={activeTab !== 'transfer'}
        on:click={() => activeTab = 'transfer'}
      >
        Transfer VOI
      </button>
      <button
        class="flex-1 py-3 px-6 text-center transition-colors"
        class:bg-slate-700={activeTab === 'buy'}
        class:text-theme={activeTab === 'buy'}
        class:text-gray-400={activeTab !== 'buy'}
        on:click={() => activeTab = 'buy'}
      >
        Buy VOI
      </button>
    </div>
    
    <!-- Tab Content -->
    <div class="p-6">
      {#if activeTab === 'transfer'}
        <!-- Transfer Tab -->
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
              <li>Funds will appear in your gaming wallet within minutes</li>
              <li>Start playing once the transaction confirms</li>
            </ol>
          </div>
          
          <!-- Warning -->
          <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <p class="text-blue-400 text-sm">
              <strong>ℹ️ Note:</strong> Only send VOI tokens to this address. 
              Sending other tokens may result in permanent loss.
            </p>
          </div>
        </div>
      {:else}
        <!-- Buy Tab -->
        <div class="space-y-6">
          <div class="text-center">
            <CreditCard class="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 class="text-lg font-semibold text-theme mb-2">Buy VOI with Card</h3>
            <p class="text-gray-400">Purchase VOI directly with your debit card or Apple Pay</p>
          </div>
          
          <!-- Coming Soon Notice -->
          <div class="p-6 bg-gradient-to-r from-voi-900/20 to-blue-900/20 border border-voi-700/30 rounded-lg text-center">
            <h4 class="text-lg font-semibold text-theme mb-2">Coming Soon</h4>
            <p class="text-gray-400 mb-4">
              Direct VOI purchases with debit card and Apple Pay will be available in the next update.
            </p>
            <button 
              disabled
              class="btn-primary opacity-50 cursor-not-allowed"
            >
              Buy VOI (Coming Soon)
            </button>
          </div>
          
          <!-- Alternative Options -->
          <div>
            <h4 class="font-medium text-theme mb-3">In the meantime:</h4>
            <ul class="space-y-2 text-sm text-gray-400">
              <li>• Purchase VOI on supported exchanges</li>
              <li>• Transfer from your main VOI wallet</li>
              <li>• Ask friends to send you VOI for testing</li>
            </ul>
          </div>
        </div>
      {/if}
    </div>
    
    <!-- Footer -->
    <div class="p-6 border-t border-slate-700 text-center">
      <button
        on:click={closeModal}
        class="btn-secondary"
      >
        Close
      </button>
    </div>
  </div>
</div>