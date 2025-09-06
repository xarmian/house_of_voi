<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ExternalLink, Copy, AlertCircle, CheckCircle, Clock, Eye, ArrowRight } from 'lucide-svelte';
  import QRCode from 'qrcode';
  import { generateBridgeQR, formatAmount, getSuggestedAmounts } from '$lib/utils/aramidNote';
  import { bridgeTransferStore, activeTransfer, isTransferring, transferError, getTransferStatusText, getTransferStatusIcon } from '$lib/stores/bridgeTransfer';
  import { ARAMID_CONFIG } from '$lib/constants/aramid';
  import BridgeTransferAnimation from './BridgeTransferAnimation.svelte';
  
  export let address: string; // User's Voi gaming wallet address
  
  let qrCodeUrl = '';
  let copySuccess = false;
  let amountInput = ''; // User input amount in aVOI
  let qrData: any = null;
  let showQRStep = false; // Controls whether we show QR step or amount input step
  
  // Reactive declarations
  $: selectedAmount = parseFloat(amountInput) * 1000000; // Convert to microAlgos
  $: isValidAmount = !isNaN(selectedAmount) && selectedAmount > 0;
  
  onMount(() => {
    // Component mounted - monitoring will start automatically when user enters valid amount
    console.log('Algorand transfer tab mounted');
  });
  
  onDestroy(() => {
    // Clean up any active transfers when component is destroyed
    if ($activeTransfer && ($activeTransfer.state === 'waiting' || $activeTransfer.state === 'detected')) {
      bridgeTransferStore.cancelActiveTransfer();
    }
    
    // Clear any active transfer from the store
    bridgeTransferStore.clearActiveTransfer();
    
    // Stop all monitoring services
    bridgeTransferStore.cleanup();
  });
  
  async function generateQRCode() {
    if (!address || !isValidAmount) {
      qrCodeUrl = '';
      qrData = null;
      return;
    }
    
    try {
      qrData = generateBridgeQR(address, selectedAmount);
      qrCodeUrl = await QRCode.toDataURL(qrData.uri, {
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
  
  async function continueToQR() {
    if (!isValidAmount) return;
    
    // Generate QR code first
    await generateQRCode();
    showQRStep = true;
    
    // Start monitoring after QR is generated
    if (qrData && !$activeTransfer) {
      startTransfer();
    }
  }
  
  function goBackToAmount() {
    showQRStep = false;
    
    // Cancel any active transfer
    if ($activeTransfer && ($activeTransfer.state === 'waiting' || $activeTransfer.state === 'detected')) {
      bridgeTransferStore.cancelActiveTransfer();
    }
  }
  
  function startNewTransfer() {
    // Reset everything to start a new transfer
    bridgeTransferStore.resetForNewTransfer();
    showQRStep = false;
    amountInput = '';
    qrData = null;
    qrCodeUrl = '';
  }
  
  async function copyUri() {
    if (!qrData?.uri) return;
    
    try {
      await navigator.clipboard.writeText(qrData.uri);
      copySuccess = true;
      setTimeout(() => copySuccess = false, 2000);
    } catch (error) {
      console.error('Failed to copy URI:', error);
    }
  }
  
  function openUri() {
    if (!qrData?.uri) return;
    
    try {
      window.open(qrData.uri, '_self');
    } catch (error) {
      console.error('Failed to open URI:', error);
    }
  }
  
  function startTransfer() {
    if (!qrData || !isValidAmount) return;
    
    const transferId = bridgeTransferStore.startTransfer(address, qrData.netAmount);
    console.log('Started bridge transfer:', transferId);
  }
  
  function cancelTransfer() {
    bridgeTransferStore.cancelActiveTransfer();
    bridgeTransferStore.clearError();
    goBackToAmount();
  }
  
  function clearError() {
    bridgeTransferStore.clearError();
  }
  
  function getAlgoExplorerUrl(txId: string): string {
    return `https://allo.info/tx/${txId}`;
  }
  
  function getAssetUrl(): string {
    return `https://allo.info/asset/${ARAMID_CONFIG.aVoiAssetId}`;
  }
</script>

<div class="space-y-6">
  {#if $transferError}
    <!-- Error State -->
    <div class="p-4 bg-red-900/20 border border-red-700/50 rounded-lg">
      <div class="flex items-center gap-2 mb-2">
        <AlertCircle class="w-5 h-5 text-red-400" />
        <h4 class="font-medium text-red-400">Transfer Error</h4>
      </div>
      <p class="text-red-300 text-sm mb-3">{$transferError}</p>
      <button on:click={clearError} class="btn-secondary text-sm">
        Try Again
      </button>
    </div>
  {:else if $activeTransfer}
    <!-- Active Transfer State -->
    <div class="space-y-4">
      <!-- Transfer Status -->
      <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg flex flex-col justify-center">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">{getTransferStatusIcon($activeTransfer.state)}</span>
          <h4 class="font-medium text-blue-400">{getTransferStatusText($activeTransfer.state)}</h4>
        </div>
        
        {#if $activeTransfer.state === 'waiting'}
          <div class="text-center">
            <p class="text-blue-300 text-sm mb-3">
              Please scan the QR code with your Algorand wallet to send {formatAmount($activeTransfer.expectedAmount + (qrData?.fee || 0))} aVOI.
            </p>
          </div>
        {:else if $activeTransfer.state === 'detected' && $activeTransfer.algorandTx}
          <div class="text-sm text-blue-300 space-y-2">
            <p><strong>Algorand Transaction Detected!</strong></p>
            <div class="bg-blue-900/30 p-3 rounded">
              <p>Amount: {formatAmount($activeTransfer.algorandTx.amount)} aVOI</p>
              <p>Transaction: <a href={getAlgoExplorerUrl($activeTransfer.algorandTx.txId)} 
                target="_blank" class="text-blue-400 hover:underline inline-flex items-center gap-1">
                {$activeTransfer.algorandTx.txId.slice(0, 16)}...
                <ExternalLink class="w-3 h-3" />
              </a></p>
              <p>Time: {new Date($activeTransfer.algorandTx.timestamp).toLocaleString()}</p>
            </div>
            <p class="text-yellow-300">Monitoring for bridge completion...</p>
          </div>
        {:else if $activeTransfer.state === 'bridging'}
          <div class="text-sm text-blue-300">
            <p class="text-yellow-300 mb-3">This typically takes 1-3 minutes.</p>
            <div class="bridge-animation-wrapper">
              <BridgeTransferAnimation 
                isVisible={true} 
                amount={$activeTransfer.expectedAmount || 0} 
              />
            </div>
          </div>
        {:else if $activeTransfer.state === 'completed'}
          <div class="text-sm text-green-300 space-y-3">
            <p><strong>Transfer completed successfully! ✅</strong></p>
            <div class="bg-green-900/30 p-3 rounded space-y-2">
              <p>Received: <span class="font-medium">{formatAmount($activeTransfer.voiAmount || 0)} VOI</span></p>
              {#if $activeTransfer.voiTxId && $activeTransfer.voiTxId !== 'pending-lookup' && $activeTransfer.voiTxId !== 'not-found' && $activeTransfer.voiTxId !== 'lookup-failed'}
                <p>Voi Transaction: <a href="https://block.voi.network/explorer/transaction/{$activeTransfer.voiTxId}" 
                  target="_blank" class="text-green-400 hover:underline inline-flex items-center gap-1">
                  {$activeTransfer.voiTxId.slice(0, 16)}...
                  <ExternalLink class="w-3 h-3" />
                </a></p>
              {:else if $activeTransfer.voiTxId === 'pending-lookup'}
                <p class="text-yellow-300">Looking up transaction details...</p>
              {:else if $activeTransfer.voiTxId === 'not-found'}
                <p class="text-gray-400">Transaction details not found</p>
              {:else if $activeTransfer.voiTxId === 'lookup-failed'}
                <p class="text-gray-400">Could not retrieve transaction details</p>
              {/if}
            </div>
            <button on:click={startNewTransfer} class="btn-primary w-full mt-4">
              Transfer Again
            </button>
          </div>
        {/if}
        
        {#if $activeTransfer.state === 'waiting'}
          <button on:click={cancelTransfer} class="btn-secondary text-sm mt-3">
            Cancel Transfer
          </button>
        {/if}
      </div>
      
      {#if $activeTransfer.state === 'waiting'}
        <!-- Show QR code while waiting -->
        <div class="text-center">
          <div class="inline-block p-4 bg-white rounded-lg mb-3">
            {#if qrCodeUrl}
              <img src={qrCodeUrl} alt="Algorand Bridge QR Code" class="mx-auto" />
            {/if}
          </div>
          
          <p class="text-sm text-gray-400 mb-3">Scan with Pera Wallet or Defly Wallet</p>
          
          <!-- URI Action Buttons -->
          <div class="flex gap-2 justify-center">
            <button
              on:click={copyUri}
              class="text-sm text-voi-400 hover:text-voi-300 inline-flex items-center gap-1"
              disabled={!qrData}
            >
              <Copy class="w-4 h-4" />
              {copySuccess ? 'Copied!' : 'Copy Transfer URI'}
            </button>
            <button
              on:click={openUri}
              class="text-sm text-voi-400 hover:text-voi-300 inline-flex items-center gap-1"
              disabled={!qrData}
            >
              <ExternalLink class="w-4 h-4" />
              Open URI
            </button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Setup Transfer State -->
    {#if !showQRStep}
      <!-- Step 1: Amount Input -->
      <div class="space-y-6">
        <!-- Amount Input -->
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">
            Amount to Transfer (aVOI)
          </label>
          <input
            bind:value={amountInput}
            type="number"
            placeholder="Enter amount (e.g. 1000)"
            class="w-full input-field"
            min="0.001"
            step="0.001"
            on:keydown={(e) => e.key === 'Enter' && isValidAmount && continueToQR()}
          />
          
          <!-- Amount Preview -->
          {#if isValidAmount}
            <div class="mt-3 p-3 bg-gray-800/50 rounded-lg text-sm">
              <div class="flex justify-between">
                <span class="text-gray-400">Send Amount:</span>
                <span class="text-white">{formatAmount(selectedAmount)} aVOI</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Bridge Fee (0.1%):</span>
                <span class="text-yellow-400">{formatAmount(Math.ceil(selectedAmount * 0.001))} aVOI</span>
              </div>
              <div class="flex justify-between border-t border-gray-700 pt-1 mt-1">
                <span class="text-gray-300 font-medium">You'll Receive:</span>
                <span class="text-green-400 font-medium">{formatAmount(selectedAmount - Math.ceil(selectedAmount * 0.001))} VOI</span>
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Continue Button -->
        <button 
          on:click={continueToQR}
          disabled={!isValidAmount}
          class="btn-primary w-full"
          class:opacity-50={!isValidAmount}
          class:cursor-not-allowed={!isValidAmount}
        >
          Continue to QR Code
        </button>
        
        <!-- Instructions -->
        <div class="space-y-4">
          <h4 class="font-medium text-theme">How to transfer from Algorand:</h4>
          <ol class="list-decimal list-inside space-y-2 text-sm text-gray-400">
            <li>Enter the amount you want to transfer</li>
            <li>Click "Continue" to generate QR code</li>
            <li>Scan with your Algorand wallet (Pera, Defly, etc.) to send aVOI tokens (Asset ID: <a href={getAssetUrl()} target="_blank" class="text-voi-400 hover:underline inline-flex items-center gap-1">
              {ARAMID_CONFIG.aVoiAssetId}
              <ExternalLink class="w-3 h-3" />
            </a>)</li>
            <li>Bridge transfer typically takes 1-3 minutes</li>
            <li>VOI will appear in your gaming wallet automatically</li>
          </ol>
        </div>
        
        <!-- Warning -->
        <div class="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
          <p class="text-yellow-400 text-sm">
            <strong>⚠️ Important:</strong> Only send aVOI (Asset ID: {ARAMID_CONFIG.aVoiAssetId}) to the bridge address.
            Sending other tokens or native ALGO may result in permanent loss.
          </p>
        </div>
      </div>
    {:else}
      <!-- Step 2: QR Code & Monitoring -->
      <div class="space-y-6">
        <!-- Back Button -->
        <button 
          on:click={goBackToAmount}
          class="text-sm text-gray-400 hover:text-gray-300 inline-flex items-center gap-1"
        >
          <ArrowRight class="w-4 h-4 rotate-180" />
          Change Amount
        </button>
        
        <!-- Amount Summary -->
        {#if qrData}
          <div class="p-3 bg-gray-800/50 rounded-lg text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">Send Amount:</span>
              <span class="text-white">{formatAmount(qrData.displayAmounts.sendAmount)} aVOI</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Bridge Fee (0.1%):</span>
              <span class="text-yellow-400">{formatAmount(qrData.displayAmounts.feeAmount)} aVOI</span>
            </div>
            <div class="flex justify-between border-t border-gray-700 pt-1 mt-1">
              <span class="text-gray-300 font-medium">You'll Receive:</span>
              <span class="text-green-400 font-medium">{formatAmount(qrData.displayAmounts.receiveAmount)} VOI</span>
            </div>
          </div>
        {/if}
        
        <!-- QR Code -->
        <div class="text-center">
          <div class="inline-block p-4 bg-white rounded-lg mb-3">
            {#if qrCodeUrl}
              <img src={qrCodeUrl} alt="Algorand Bridge QR Code" class="mx-auto" />
            {:else}
              <div class="w-[200px] h-[200px] flex items-center justify-center text-gray-400 text-sm">
                Generating QR code...
              </div>
            {/if}
          </div>
          
          <p class="text-sm text-gray-400 mb-3">Scan with Pera Wallet or Defly Wallet</p>
          
          <!-- URI Action Buttons -->
          <div class="flex gap-2 justify-center">
            <button
              on:click={copyUri}
              class="text-sm text-voi-400 hover:text-voi-300 inline-flex items-center gap-1"
              disabled={!qrData}
            >
              <Copy class="w-4 h-4" />
              {copySuccess ? 'Copied!' : 'Copy Transfer URI'}
            </button>
            <button
              on:click={openUri}
              class="text-sm text-voi-400 hover:text-voi-300 inline-flex items-center gap-1"
              disabled={!qrData}
            >
              <ExternalLink class="w-4 h-4" />
              Open URI
            </button>
          </div>
        </div>
        
        <!-- Next Steps -->
        <div class="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
          <p class="text-blue-400 text-sm">
            <strong>📱 Next Steps:</strong> Scan the QR code with your Algorand wallet and send the aVOI tokens. 
            We'll automatically detect the transaction and monitor the bridge transfer.
          </p>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .bridge-animation-wrapper {
    margin: 0 -8px; /* Extend beyond parent padding to give more space */
    overflow: visible;
  }
</style>