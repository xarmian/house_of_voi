<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Copy, ExternalLink, User } from 'lucide-svelte';
  import { nameResolutionService, type ResolvedAddress } from '$lib/services/nameResolution';
  import { toastStore } from '$lib/stores/toast';
  import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';

  // Props
  export let address: string;
  export let showCopyButton = false;
  export let showExplorerLink = false;
  export let showProfileLink = false;
  export let clickToToggle = true;
  export let maxLength: 'short' | 'medium' | 'long' = 'short';
  export let className = '';
  export let linkClassName = '';

  // State
  let resolved: ResolvedAddress | null = null;
  let loading = true;
  let showFullAddress = false;
  let mounted = false;

  // Computed
  $: displayString = getDisplayString(resolved, showFullAddress);
  $: isClickable = clickToToggle && resolved?.hasName;

  onMount(() => {
    mounted = true;
    resolveAddress();
  });

  onDestroy(() => {
    mounted = false;
  });

  async function resolveAddress() {
    if (!address) {
      loading = false;
      return;
    }

    try {
      loading = true;
      resolved = await nameResolutionService.resolveAddress(address);
    } catch (error) {
      console.warn('Address resolution failed:', error);
      // Create fallback resolved address
      resolved = {
        address,
        name: null,
        hasName: false
      };
    } finally {
      if (mounted) {
        loading = false;
      }
    }
  }

  function getDisplayString(resolved: ResolvedAddress | null, showFull: boolean): string {
    if (!resolved) {
      return nameResolutionService.formatAddress(address, maxLength);
    }

    if (showFull) {
      return resolved.address;
    }

    return nameResolutionService.getDisplayString(resolved, maxLength);
  }

  function toggleDisplay() {
    if (isClickable) {
      showFullAddress = !showFullAddress;
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      const displayName = resolved?.name || nameResolutionService.formatAddress(address);
      toastStore.success('Address copied', `Wallet address for ${displayName} copied to clipboard`);
    } catch (err) {
      console.error('Failed to copy address:', err);
      toastStore.error('Copy failed', 'Unable to copy address');
    }
  }

  function getExplorerUrl(): string {
    return `${BLOCKCHAIN_CONFIG.explorerUrl}/account/${address}`;
  }

  function getProfileUrl(): string {
    return `/profile/${address}`;
  }

  // Re-resolve when address changes
  $: if (address && mounted) {
    resolveAddress();
  }
</script>

<div class="address-display {className}">
  {#if loading}
    <!-- Loading skeleton -->
    <div class="loading-skeleton {linkClassName}">
      <div class="skeleton-text"></div>
    </div>
  {:else}
    <!-- Address display -->
    <span
      class="address-text {linkClassName} {isClickable ? 'clickable' : ''}"
      class:has-name={resolved?.hasName}
      class:showing-full={showFullAddress}
      on:click={toggleDisplay}
      on:keydown={(e) => e.key === 'Enter' && toggleDisplay()}
      role={isClickable ? 'button' : undefined}
      tabindex={isClickable ? 0 : undefined}
      title={resolved?.hasName
        ? showFullAddress
          ? `Click to show name: ${resolved.name}`
          : `Click to show address: ${address}`
        : address
      }
    >
      {displayString}
    </span>

    <!-- Action buttons -->
    {#if showCopyButton || showExplorerLink || showProfileLink}
      <div class="address-actions">
        {#if showCopyButton}
          <button
            on:click={copyAddress}
            class="action-btn"
            title="Copy address"
            aria-label="Copy wallet address"
          >
            <Copy class="w-3 h-3" />
          </button>
        {/if}

        {#if showExplorerLink}
          <a
            href={getExplorerUrl()}
            target="_blank"
            rel="noopener noreferrer"
            class="action-btn"
            title="View in explorer"
            aria-label="View address in blockchain explorer"
          >
            <ExternalLink class="w-3 h-3" />
          </a>
        {/if}

        {#if showProfileLink}
          <a
            href={getProfileUrl()}
            class="action-btn"
            title="View profile"
            aria-label="View player profile"
          >
            <User class="w-3 h-3" />
          </a>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style lang="postcss">
  .address-display {
    @apply inline-flex items-center gap-2;
  }

  .loading-skeleton {
    @apply inline-block;
  }

  .skeleton-text {
    @apply h-4 w-24 bg-slate-600 rounded animate-pulse;
  }

  .address-text {
    @apply font-mono text-sm break-all;
  }

  .address-text.clickable {
    @apply cursor-pointer hover:text-theme-primary transition-colors duration-200;
  }

  .address-text.clickable:hover {
    @apply underline;
  }

  .address-text.clickable:focus {
    @apply outline-none ring-2 ring-theme-primary ring-opacity-50 rounded;
  }

  .address-text.has-name {
    @apply text-theme-primary font-semibold;
  }

  .address-text.has-name.showing-full {
    @apply text-theme-text font-mono;
  }

  .address-actions {
    @apply flex items-center gap-1;
  }

  .action-btn {
    @apply inline-flex items-center justify-center w-6 h-6 p-1
           text-gray-400 hover:text-theme-primary
           rounded transition-colors duration-200
           focus:outline-none focus:ring-2 focus:ring-theme-primary focus:ring-opacity-50;
  }

  .action-btn:hover {
    @apply bg-surface-hover;
  }

  /* Compact variant */
  :global(.address-display-compact) .address-text {
    @apply text-xs;
  }

  :global(.address-display-compact) .action-btn {
    @apply w-5 h-5;
  }

  :global(.address-display-compact) .action-btn :global(svg) {
    @apply w-2.5 h-2.5;
  }

  /* Large variant */
  :global(.address-display-large) .address-text {
    @apply text-base;
  }

  :global(.address-display-large) .action-btn {
    @apply w-7 h-7;
  }

  :global(.address-display-large) .action-btn :global(svg) {
    @apply w-4 h-4;
  }
</style>