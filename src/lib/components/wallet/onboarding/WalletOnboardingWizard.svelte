<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, slide } from 'svelte/transition';

  // Step components
  import ChooseMethodStep from './steps/ChooseMethodStep.svelte';
  import CDPEmailStep from './steps/CDPEmailStep.svelte';
  import CDPOTPStep from './steps/CDPOTPStep.svelte';
  import CDPPasswordStep from './steps/CDPPasswordStep.svelte';
  import CreatePasswordStep from './steps/CreatePasswordStep.svelte';
  import MnemonicBackupStep from './steps/MnemonicBackupStep.svelte';
  import ImportMnemonicStep from './steps/ImportMnemonicStep.svelte';
  import AddFundsStep from './steps/AddFundsStep.svelte';
  import UnlockWalletStep from './steps/UnlockWalletStep.svelte';

  export let isOpen = false;
  export let initialFlow: 'choose' | 'unlock' = 'choose';

  const dispatch = createEventDispatcher<{
    close: void;
    walletReady: void;
  }>();

  // Wizard steps definition
  type WizardStep =
    // Common
    | 'choose'
    | 'unlock'
    | 'add-funds'
    // CDP Flow
    | 'cdp-email'
    | 'cdp-otp'
    | 'cdp-password'
    // Create Flow
    | 'create-password'
    | 'mnemonic-backup'
    // Import Flow
    | 'import-mnemonic';

  type WizardFlow = 'cdp' | 'create' | 'import' | 'unlock';

  // State machine
  let currentStep: WizardStep = initialFlow;
  let currentFlow: WizardFlow | null = null;
  let isLoading = false;
  let error = '';

  // Flow-specific state
  let wizardData: {
    // CDP
    cdpEmail?: string;
    cdpOtpCode?: string;
    // Create
    createPassword?: string;
    generatedMnemonic?: string;
    // Import
    importMnemonic?: string;
    importPassword?: string;
    // Unlock
    unlockPassword?: string;
    // Common
    walletAddress?: string;
  } = {};

  // Progress tracking for each flow (removed 'add-funds' from flows)
  const flowSteps: Record<WizardFlow, WizardStep[]> = {
    cdp: ['choose', 'cdp-email', 'cdp-otp', 'cdp-password'],
    create: ['choose', 'create-password', 'mnemonic-backup'],
    import: ['choose', 'import-mnemonic'],
    unlock: ['unlock']
  };

  // Calculate progress
  $: progress = calculateProgress(currentStep, currentFlow);
  $: canGoBack = currentStep !== 'choose' && currentStep !== 'unlock' && currentStep !== 'add-funds';
  $: stepTitle = getStepTitle(currentStep);

  function calculateProgress(step: WizardStep, flow: WizardFlow | null): number {
    if (!flow || step === 'add-funds') return 100;
    const steps = flowSteps[flow];
    const currentIndex = steps.indexOf(step);
    return ((currentIndex + 1) / steps.length) * 100;
  }

  function getStepTitle(step: WizardStep): string {
    const titles: Record<WizardStep, string> = {
      choose: 'Get Started',
      unlock: 'Unlock Account',
      'cdp-email': 'Sign in with Email',
      'cdp-otp': 'Verify Code',
      'cdp-password': 'Secure Your Account',
      'create-password': 'Create Account',
      'mnemonic-backup': 'Save Backup Code',
      'import-mnemonic': 'Restore Account',
      'add-funds': 'Add Funds'
    };
    return titles[step];
  }

  // Navigation
  function goToStep(step: WizardStep) {
    console.log('goToStep called:', step, 'current:', currentStep);
    currentStep = step;
    error = '';
    console.log('currentStep after update:', currentStep);
  }

  function goBack() {
    if (!currentFlow) return;

    const steps = flowSteps[currentFlow];
    const currentIndex = steps.indexOf(currentStep);

    if (currentIndex > 0) {
      currentStep = steps[currentIndex - 1];
      error = '';
    }
  }

  function handleClose() {
    resetWizard();
    dispatch('close');
  }

  function resetWizard() {
    currentStep = initialFlow;
    currentFlow = null;
    isLoading = false;
    error = '';
    wizardData = {};
  }

  // Step handlers
  function handleChooseMethod(event: CustomEvent<{ method: 'cdp' | 'create' | 'import' }>) {
    console.log('WalletOnboardingWizard: handleChooseMethod called', event.detail);
    const { method } = event.detail;
    currentFlow = method;

    switch (method) {
      case 'cdp':
        goToStep('cdp-email');
        break;
      case 'create':
        goToStep('create-password');
        break;
      case 'import':
        goToStep('import-mnemonic');
        break;
    }
  }

  function handleCDPEmailSubmit(event: CustomEvent<{ email: string }>) {
    wizardData.cdpEmail = event.detail.email;
    goToStep('cdp-otp');
  }

  function handleCDPOTPSubmit(event: CustomEvent<{ otpCode: string }>) {
    wizardData.cdpOtpCode = event.detail.otpCode;
    // Dispatch CDP login to parent
    dispatch('cdpLogin', {
      email: wizardData.cdpEmail!,
      otpCode: event.detail.otpCode
    });
    goToStep('cdp-password');
  }

  function handleCDPPasswordSubmit(event: CustomEvent<{ password: string | null }>) {
    const { password } = event.detail;

    if (password) {
      // Dispatch password change to parent
      dispatch('cdpPasswordSet', { password });
    }

    // Complete the flow
    handleWalletReady();
  }

  function handleCreatePasswordSubmit(event: CustomEvent<{ password: string }>) {
    wizardData.createPassword = event.detail.password;
    // Dispatch wallet creation to parent
    dispatch('createWallet', { password: event.detail.password });
  }

  function handleMnemonicGenerated(event: CustomEvent<{ mnemonic: string }>) {
    wizardData.generatedMnemonic = event.detail.mnemonic;
    goToStep('mnemonic-backup');
  }

  function handleMnemonicConfirmed() {
    // Dispatch confirmation to parent
    dispatch('confirmMnemonicBackup');

    // Complete the flow
    handleWalletReady();
  }

  function handleImportSubmit(event: CustomEvent<{ mnemonic: string; password: string }>) {
    const { mnemonic, password } = event.detail;
    wizardData.importMnemonic = mnemonic;
    wizardData.importPassword = password;

    // Dispatch import to parent
    dispatch('importWallet', { mnemonic, password });
  }

  function handleUnlockSubmit(event: CustomEvent<{ password: string }>) {
    wizardData.unlockPassword = event.detail.password;
    // Dispatch unlock to parent
    dispatch('unlock', { password: event.detail.password });
  }

  function handleAddFundsContinue() {
    handleWalletReady();
  }

  function handleWalletReady() {
    dispatch('walletReady');
    handleClose();
  }

  // Listen for parent to trigger next step (e.g., after async operations)
  export function setMnemonic(mnemonic: string) {
    wizardData.generatedMnemonic = mnemonic;
    goToStep('mnemonic-backup');
  }

  export function setWalletAddress(address: string) {
    wizardData.walletAddress = address;
  }

  export function setError(errorMessage: string) {
    error = errorMessage;
    isLoading = false;
  }

  export function setLoading(loading: boolean) {
    isLoading = loading;
  }

  export function proceedToAddFunds() {
    goToStep('add-funds');
  }

  export function completeFlow() {
    handleWalletReady();
  }

  // Reset wizard when modal closes
  $: if (!isOpen) {
    resetWizard();
  }

  // Set initial step based on initialFlow prop (only when first opening)
  let hasInitialized = false;
  $: if (isOpen && !hasInitialized) {
    currentStep = initialFlow;
    currentFlow = initialFlow === 'unlock' ? 'unlock' : null;
    hasInitialized = true;
  }

  // Reset initialization flag when modal closes
  $: if (!isOpen) {
    hasInitialized = false;
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    transition:fade={{ duration: 200 }}
  >
    <div
      class="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      transition:slide={{ duration: 300 }}
    >
      <!-- Header with Progress -->
      <div class="px-6 py-4 border-b border-slate-700">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-bold text-theme">{stepTitle}</h2>

          <div class="flex items-center gap-3">
            {#if canGoBack}
              <button
                type="button"
                on:click={goBack}
                disabled={isLoading}
                class="text-slate-400 hover:text-theme transition-colors disabled:opacity-50"
                title="Go back"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            {/if}

            <button
              type="button"
              on:click={handleClose}
              disabled={isLoading}
              class="text-slate-400 hover:text-theme transition-colors disabled:opacity-50"
              title="Close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Breadcrumbs -->
        {#if currentFlow && currentStep !== 'add-funds'}
          <div class="flex items-center gap-2 text-sm">
            {#each flowSteps[currentFlow] as step, index}
              {@const isCurrent = step === currentStep}
              {@const isPast = flowSteps[currentFlow].indexOf(currentStep) > index}
              {@const stepName = getStepTitle(step)}

              {#if index > 0}
                <svg class="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              {/if}

              <div
                class="flex items-center gap-1.5 transition-colors"
                class:text-blue-400={isCurrent}
                class:font-medium={isCurrent}
                class:text-slate-400={!isCurrent && !isPast}
                class:text-slate-500={isPast}
              >
                <div
                  class="w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors"
                  class:bg-blue-600={isCurrent}
                  class:bg-green-600={isPast}
                  class:bg-slate-700={!isCurrent && !isPast}
                  class:text-white={isCurrent || isPast}
                  class:text-slate-400={!isCurrent && !isPast}
                >
                  {#if isPast}
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  {:else}
                    {index + 1}
                  {/if}
                </div>
                <span class="hidden sm:inline">{stepName}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Global Error Banner -->
      {#if error}
        <div class="mx-6 mt-4 p-3 bg-red-900/20 border border-red-500/30 rounded-lg" transition:slide>
          <p class="text-red-400 text-sm">{error}</p>
        </div>
      {/if}

      <!-- Step Content -->
      <div class="flex-1 overflow-y-auto">
        {#if currentStep === 'choose'}
          <ChooseMethodStep
            {isLoading}
            on:selectMethod={handleChooseMethod}
            on:cancel={handleClose}
          />
        {:else if currentStep === 'unlock'}
          <UnlockWalletStep
            {isLoading}
            on:submit={handleUnlockSubmit}
            on:cancel={handleClose}
            on:abandon={() => {
              currentFlow = null;
              goToStep('choose');
            }}
          />
        {:else if currentStep === 'cdp-email'}
          <CDPEmailStep
            {isLoading}
            on:submit={handleCDPEmailSubmit}
          />
        {:else if currentStep === 'cdp-otp'}
          <CDPOTPStep
            {isLoading}
            email={wizardData.cdpEmail || ''}
            on:submit={handleCDPOTPSubmit}
            on:resend={handleCDPEmailSubmit}
          />
        {:else if currentStep === 'cdp-password'}
          <CDPPasswordStep
            {isLoading}
            on:submit={handleCDPPasswordSubmit}
          />
        {:else if currentStep === 'create-password'}
          <CreatePasswordStep
            {isLoading}
            on:submit={handleCreatePasswordSubmit}
          />
        {:else if currentStep === 'mnemonic-backup'}
          <MnemonicBackupStep
            {isLoading}
            mnemonic={wizardData.generatedMnemonic || ''}
            on:confirm={handleMnemonicConfirmed}
          />
        {:else if currentStep === 'import-mnemonic'}
          <ImportMnemonicStep
            {isLoading}
            on:submit={handleImportSubmit}
          />
        {:else if currentStep === 'add-funds'}
          <AddFundsStep
            address={wizardData.walletAddress || ''}
            on:continue={handleAddFundsContinue}
            on:skip={handleWalletReady}
          />
        {/if}
      </div>

      <!-- Loading Overlay -->
      {#if isLoading}
        <div
          class="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center"
          transition:fade={{ duration: 150 }}
        >
          <div class="bg-slate-800 rounded-lg p-6 shadow-xl border border-slate-700">
            <div class="flex items-center space-x-3">
              <svg class="animate-spin h-6 w-6 text-theme" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span class="text-theme font-medium">Processing...</span>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
