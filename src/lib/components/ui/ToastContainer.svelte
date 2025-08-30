<script lang="ts">
  import { toastStore } from '$lib/stores/toast';
  import Toast from './Toast.svelte';
</script>

<!-- Toast container - fixed position at top-right -->
<div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
  {#each $toastStore as toast (toast.id)}
    <div class="pointer-events-auto">
      <Toast {toast} />
    </div>
  {/each}
</div>