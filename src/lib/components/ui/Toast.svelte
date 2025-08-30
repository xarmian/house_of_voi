<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { toastStore, type Toast } from '$lib/stores/toast';
  
  export let toast: Toast;
  
  const dismiss = () => {
    toastStore.dismiss(toast.id);
  };
  
  const handleAction = () => {
    if (toast.action) {
      toast.action.handler();
    }
  };
  
  // Icon components for different toast types
  const getIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return { icon: 'M5 13l4 4L19 7', class: 'text-green-400' };
      case 'error':
        return { icon: 'M6 18L18 6M6 6l12 12', class: 'text-red-400' };
      case 'warning':
        return { icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z', class: 'text-yellow-400' };
      case 'update':
        return { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', class: 'text-blue-400' };
      default:
        return { icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', class: 'text-blue-400' };
    }
  };
  
  const getBackgroundClass = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800';
      case 'update':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
      default:
        return 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700';
    }
  };
  
  const iconData = getIcon(toast.type);
</script>

<div
  class="flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm max-w-sm {getBackgroundClass(toast.type)}"
  in:fly={{ x: 300, duration: 300 }}
  out:fade={{ duration: 200 }}
>
  <!-- Icon -->
  <div class="flex-shrink-0 {iconData.class}">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconData.icon} />
    </svg>
  </div>
  
  <!-- Content -->
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
      {toast.title}
    </p>
    {#if toast.message}
      <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">
        {toast.message}
      </p>
    {/if}
    
    <!-- Action button -->
    {#if toast.action}
      <button
        on:click={handleAction}
        class="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
      >
        {toast.action.label}
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    {/if}
  </div>
  
  <!-- Dismiss button -->
  {#if toast.dismissible}
    <button
      on:click={dismiss}
      class="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
      aria-label="Dismiss"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  {/if}
</div>