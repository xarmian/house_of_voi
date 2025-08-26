<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import WarningModal from './WarningModal.svelte';

  let showWarningModal = false;
  
  const warningMessage = "This is an experimental prototype deployed on Voi Mainnet. It is provided as-is, with no guarantees of reliability, availability, or accuracy. Outcomes are random and for entertainment purposes only. Do not expect consistent performance, returns, or support. Play at your own risk.";
  
  // Define which pages should show modal
  const modalPages = ['/app', '/house'];
  
  // Reactive state based on current route
  $: currentPath = $page.url.pathname;
  $: shouldShowModal = modalPages.includes(currentPath);

  onMount(() => {
    // Only show modal for modal pages if not previously dismissed
    if (shouldShowModal) {
      const warningDismissed = localStorage.getItem('hov-warning-dismissed');
      if (!warningDismissed || warningDismissed !== 'true') {
        showWarningModal = true;
      }
    }
  });

  function handleWarningDismiss(event: CustomEvent<{ dontShowAgain: boolean }>) {
    const { dontShowAgain } = event.detail;
    showWarningModal = false;
    
    if (dontShowAgain) {
      localStorage.setItem('hov-warning-dismissed', 'true');
    }
  }
</script>

<!-- Show modal on app and house pages -->
{#if shouldShowModal}
  <WarningModal 
    isVisible={showWarningModal}
    message={warningMessage}
    showDontAskAgain={true}
    on:dismiss={handleWarningDismiss}
  />
{/if}