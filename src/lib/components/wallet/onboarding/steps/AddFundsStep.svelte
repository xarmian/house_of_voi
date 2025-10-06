<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import AddFundsModal from '$lib/components/wallet/AddFundsModal.svelte';

  export let address: string;

  const dispatch = createEventDispatcher<{
    continue: void;
    skip: void;
  }>();

  function handleClose() {
    dispatch('continue');
  }
</script>

<!-- Render AddFundsModal directly -->
<AddFundsModal {address} on:close={handleClose} />
