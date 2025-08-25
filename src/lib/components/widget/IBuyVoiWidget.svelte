<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { shouldUseRedirect } from '$lib/utils/device';
  
  export let destination: string; // VOI wallet address
  export let theme: 'light' | 'dark' | 'auto' = 'auto';
  export let width: number = 480;
  export let height: number = 600;
  export let redirectUrl: string | null;
  export let allowedOrigin: string = 'https://www.ibuyvoi.com';

  onMount(() => {
    redirectUrl = window.location.href;
  });

  const dispatch = createEventDispatcher<{
    ready: void;
    resize: { height: number };
    purchaseComplete: { voiTxId: string; amount: number; timestamp: number };
    purchaseError: { message: string; code?: string };
    close: void;
  }>();

  let iframeElement: HTMLIFrameElement;
  let widgetHeight = height;
  let isLoading = true;
  let error: string | null = null;
  let useRedirect = shouldUseRedirect();

  // Validate VOI address format (58 characters, base32)
  $: isValidAddress = destination && /^[A-Z2-7]{58}$/.test(destination);

  // Build widget URL
  $: widgetUrl = (() => {
    if (!isValidAddress) return '';
    
    const params = new URLSearchParams({
      destination,
      theme,
      ...(useRedirect && { mode: 'redirect' }),
      ...(redirectUrl && { redirectUrl }),
      ...(allowedOrigin && { allowedOrigin })
    });
    
    return `${allowedOrigin}/widget?${params.toString()}`;
  })();

  function handleMessage(event: MessageEvent) {
    // Security: Only accept messages from allowed origin
    if (event.origin !== allowedOrigin) {
      console.warn('IBuyVoiWidget: Rejected message from unauthorized origin:', event.origin);
      return;
    }

    const { type, data } = event.data;

    switch (type) {
      case 'WIDGET_READY':
        isLoading = false;
        dispatch('ready');
        break;

      case 'WIDGET_RESIZE':
        if (data?.height && typeof data.height === 'number') {
          widgetHeight = data.height;
          dispatch('resize', { height: data.height });
        }
        break;

      case 'PURCHASE_COMPLETE':
        if (data?.voiTxId) {
          dispatch('purchaseComplete', {
            voiTxId: data.voiTxId,
            amount: data.amount || 0,
            timestamp: data.timestamp || Date.now()
          });
        }
        break;

      case 'PURCHASE_ERROR':
        const errorMessage = data?.message || 'Purchase failed';
        dispatch('purchaseError', {
          message: errorMessage,
          code: data?.code
        });
        break;

      case 'WIDGET_CLOSE':
        dispatch('close');
        break;

      default:
        console.log('IBuyVoiWidget: Unknown message type:', type);
    }
  }

  function handleRedirect() {
    if (useRedirect && widgetUrl) {
      window.location.href = widgetUrl;
    }
  }

  function handleIframeLoad() {
    // Handle iframe load errors
    if (iframeElement) {
      iframeElement.onerror = () => {
        error = 'Failed to load widget';
        isLoading = false;
      };
    }
  }

  onMount(() => {
    if (!isValidAddress) {
      error = 'Invalid VOI address format';
      return;
    }

    if (!useRedirect) {
      window.addEventListener('message', handleMessage);
    }
  });

  onDestroy(() => {
    if (!useRedirect) {
      window.removeEventListener('message', handleMessage);
    }
  });
</script>

{#if error}
  <div class="p-6 bg-red-50 border border-red-200 rounded-lg text-center">
    <p class="text-red-600 font-medium mb-2">Widget Error</p>
    <p class="text-red-500 text-sm">{error}</p>
  </div>
{:else if !isValidAddress}
  <div class="p-6 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
    <p class="text-yellow-600 font-medium mb-2">Invalid Address</p>
    <p class="text-yellow-500 text-sm">Please provide a valid VOI wallet address</p>
  </div>
{:else if useRedirect}
  <!-- Mobile: Redirect Mode -->
  <div class="p-6 bg-gradient-to-r from-voi-500/20 to-blue-500/20 border border-voi-300/30 rounded-lg text-center">
    <div class="mb-4">
      <div class="w-16 h-16 bg-voi-500 rounded-full flex items-center justify-center mx-auto mb-3">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      </div>
    </div>
    <h3 class="text-lg font-semibold text-theme mb-2">Buy VOI with Card</h3>
    <p class="text-gray-600 mb-6 text-sm">
      You'll be redirected to complete your purchase securely, then return here automatically.
    </p>
    <button 
      on:click={handleRedirect}
      class="btn-primary w-full"
    >
      Continue to Payment
    </button>
  </div>
{:else}
  <!-- Desktop: Iframe Mode -->
  <div class="relative">
    {#if isLoading}
      <div class="absolute inset-0 bg-surface-primary rounded-lg flex items-center justify-center z-10">
        <div class="text-center">
          <div class="w-8 h-8 border-2 border-theme border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p class="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    {/if}
    
    <iframe
      bind:this={iframeElement}
      src={widgetUrl}
      {width}
      height={widgetHeight}
      frameborder="0"
      title="VOI Purchase Widget"
      class="rounded-lg shadow-lg border-none"
      on:load={handleIframeLoad}
      style="min-height: {height}px;"
    />
  </div>
{/if}

<style>
  iframe {
    transition: height 0.3s ease-in-out;
  }
</style>