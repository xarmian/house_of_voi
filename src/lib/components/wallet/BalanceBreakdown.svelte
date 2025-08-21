<!-- Simple Available Credits Display -->

<script lang="ts">
  import { walletBalance } from '$lib/stores/wallet';
  import { reservedBalance } from '$lib/stores/queue';
  import { formatVOI } from '$lib/constants/betting';

  // Props
  export let compact = false;

  // Calculate how much they can actually bet
  $: walletBal = $walletBalance || 0;
  $: reserved = $reservedBalance || 0;
  
  // Subtract minimum transaction costs to show actual bettable amount
  const minTransactionCost = 50500 + 30000 + 28500 + 15000 + 1000000; // spin + 1 payline + box + network + buffer
  $: grossAvailable = Math.max(0, walletBal - reserved);
  $: availableForBetting = Math.max(0, grossAvailable - minTransactionCost);
</script>

<div class="flex items-center justify-between text-sm">
  <span class="text-theme-text opacity-70">Available Credits:</span>
  <span class="font-mono font-medium text-theme">
    {formatVOI(availableForBetting)} VOI
  </span>
</div>