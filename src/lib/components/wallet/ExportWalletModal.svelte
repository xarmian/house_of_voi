<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { walletStore } from '$lib/stores/wallet';
  import { Download, Eye, EyeOff, X, AlertTriangle } from 'lucide-svelte';
  
  const dispatch = createEventDispatcher();
  
  let showPrivateKey = false;
  let showMnemonic = false;
  let exportedPrivateKey = '';
  let exportedMnemonic = '';
  let acknowledged = false;
  
  async function exportPrivateKey() {
    const privateKey = await walletStore.exportPrivateKey();
    if (privateKey) {
      exportedPrivateKey = privateKey;
      showPrivateKey = true;
    }
  }
  
  async function exportMnemonic() {
    const mnemonic = await walletStore.exportMnemonic();
    if (mnemonic) {
      exportedMnemonic = mnemonic;
      showMnemonic = true;
    }
  }
  
  async function copyToClipboard(text: string, type: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${type} copied to clipboard!`);
    } catch (error) {
      console.error('Failed to copy:', error);
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
  aria-labelledby="export-modal-title"
>
  <div class="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-slate-700">
      <h2 id="export-modal-title" class="text-xl font-semibold text-white">Export Wallet</h2>
      <button
        on:click={closeModal}
        class="p-1 text-gray-400 hover:text-white transition-colors"
      >
        <X class="w-5 h-5" />
      </button>
    </div>
    
    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Security Warning -->
      <div class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
        <div class="flex items-start gap-3">
          <AlertTriangle class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
          <div>
            <h3 class="font-semibold text-red-400 mb-2">Security Warning</h3>
            <ul class="text-red-300 text-sm space-y-1">
              <li>• Never share your private key or recovery phrase with anyone</li>
              <li>• Store this information securely offline</li>
              <li>• Anyone with access to this data can control your wallet</li>
              <li>• House of Voi will never ask for your private key</li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- Acknowledgment -->
      <label class="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={acknowledged}
          class="mt-1 w-4 h-4 text-voi-600 bg-slate-700 border-slate-600 rounded focus:ring-voi-500"
        />
        <span class="text-gray-300 text-sm">
          I understand the security risks and will keep this information secure
        </span>
      </label>
      
      {#if acknowledged}
        <!-- Export Options -->
        <div class="space-y-4">
          <!-- Private Key Export -->
          <div class="card p-4 bg-slate-800/50">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-medium text-white">Private Key</h4>
              {#if !showPrivateKey}
                <button
                  on:click={exportPrivateKey}
                  class="btn-secondary text-sm"
                >
                  <Eye class="w-4 h-4 mr-2" />
                  Show
                </button>
              {:else}
                <button
                  on:click={() => showPrivateKey = false}
                  class="btn-secondary text-sm"
                >
                  <EyeOff class="w-4 h-4 mr-2" />
                  Hide
                </button>
              {/if}
            </div>
            
            {#if showPrivateKey && exportedPrivateKey}
              <div class="space-y-3">
                <textarea
                  value={exportedPrivateKey}
                  readonly
                  class="w-full h-20 input-field font-mono text-xs resize-none"
                  placeholder="Private key will appear here..."
                ></textarea>
                <button
                  on:click={() => copyToClipboard(exportedPrivateKey, 'Private key')}
                  class="btn-primary text-sm w-full"
                >
                  <Download class="w-4 h-4 mr-2" />
                  Copy Private Key
                </button>
              </div>
            {:else if showPrivateKey}
              <p class="text-gray-400 text-sm">Failed to export private key</p>
            {:else}
              <p class="text-gray-400 text-sm">
                Your private key is the raw cryptographic key for your wallet
              </p>
            {/if}
          </div>
          
          <!-- Mnemonic Export -->
          <div class="card p-4 bg-slate-800/50">
            <div class="flex items-center justify-between mb-3">
              <h4 class="font-medium text-white">Recovery Phrase</h4>
              {#if !showMnemonic}
                <button
                  on:click={exportMnemonic}
                  class="btn-secondary text-sm"
                >
                  <Eye class="w-4 h-4 mr-2" />
                  Show
                </button>
              {:else}
                <button
                  on:click={() => showMnemonic = false}
                  class="btn-secondary text-sm"
                >
                  <EyeOff class="w-4 h-4 mr-2" />
                  Hide
                </button>
              {/if}
            </div>
            
            {#if showMnemonic && exportedMnemonic}
              <div class="space-y-3">
                <textarea
                  value={exportedMnemonic}
                  readonly
                  class="w-full h-20 input-field font-mono text-sm resize-none"
                  placeholder="Recovery phrase will appear here..."
                ></textarea>
                <button
                  on:click={() => copyToClipboard(exportedMnemonic, 'Recovery phrase')}
                  class="btn-primary text-sm w-full"
                >
                  <Download class="w-4 h-4 mr-2" />
                  Copy Recovery Phrase
                </button>
              </div>
            {:else if showMnemonic}
              <p class="text-gray-400 text-sm">Failed to export recovery phrase</p>
            {:else}
              <p class="text-gray-400 text-sm">
                Your recovery phrase is a human-readable backup of your wallet
              </p>
            {/if}
          </div>
        </div>
        
        <!-- Backup Instructions -->
        <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
          <h4 class="font-semibold text-blue-400 mb-2">Backup Instructions</h4>
          <ol class="list-decimal list-inside space-y-1 text-blue-300 text-sm">
            <li>Write down your recovery phrase on paper</li>
            <li>Store it in a secure location offline</li>
            <li>Consider making multiple copies</li>
            <li>Never store it digitally or share it online</li>
          </ol>
        </div>
      {/if}
    </div>
    
    <!-- Footer -->
    <div class="p-6 border-t border-slate-700 flex justify-end">
      <button
        on:click={closeModal}
        class="btn-secondary"
      >
        Done
      </button>
    </div>
  </div>
</div>