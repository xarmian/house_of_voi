<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    selectMethod: { method: 'cdp' | 'create' | 'import' };
    cancel: void;
  }>();

  function selectMethod(method: 'cdp' | 'create' | 'import') {
    console.log('ChooseMethodStep: selectMethod called with', method);
    dispatch('selectMethod', { method });
  }
</script>

<div class="px-4 sm:px-6 py-4 sm:py-6">
  <p class="text-slate-300 text-sm mb-4 sm:mb-6">
    Choose how you'd like to get started
  </p>

  <div class="space-y-2.5 sm:space-y-3">
    <!-- Sign in with Email (CDP) - Primary Option -->
    <button
      type="button"
      on:click={() => selectMethod('cdp')}
      disabled={isLoading}
      class="w-full p-3 sm:p-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 active:from-purple-800 active:to-blue-800 border border-purple-500 rounded-lg text-left transition-all disabled:opacity-50 group shadow-lg hover:shadow-xl"
    >
      <div class="flex items-start space-x-2.5 sm:space-x-3">
        <div class="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <h3 class="text-white font-semibold text-sm sm:text-base">Sign in with Email</h3>
            <span class="px-1.5 py-0.5 sm:px-2 bg-white/20 rounded-full text-[10px] sm:text-xs text-white font-medium whitespace-nowrap">
              ⚡ Recommended
            </span>
          </div>
          <p class="text-white/90 text-xs sm:text-sm leading-snug">
            Sign in like Netflix or Spotify - no passwords to remember
          </p>
        </div>
        <svg class="w-4 h-4 sm:w-5 sm:h-5 text-white/60 group-hover:text-white transition-colors flex-shrink-0 mt-0.5 sm:mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>

    <!-- Create Secure Account -->
    <button
      type="button"
      on:click={() => selectMethod('create')}
      disabled={isLoading}
      class="w-full p-3 sm:p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 border border-slate-600 rounded-lg text-left transition-colors disabled:opacity-50 group"
    >
      <div class="flex items-start space-x-2.5 sm:space-x-3">
        <div class="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center flex-wrap gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <h3 class="text-theme font-medium text-sm sm:text-base">Create a Secure Account</h3>
            <span class="px-1.5 py-0.5 sm:px-2 bg-blue-600/20 rounded-full text-[10px] sm:text-xs text-blue-400 font-medium whitespace-nowrap">
              🔒 Most Secure
            </span>
          </div>
          <p class="text-slate-400 text-xs sm:text-sm leading-snug">
            Like a bank account with a backup code you control
          </p>
        </div>
        <svg class="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:text-theme transition-colors flex-shrink-0 mt-0.5 sm:mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>

    <!-- Restore Account -->
    <button
      type="button"
      on:click={() => selectMethod('import')}
      disabled={isLoading}
      class="w-full p-3 sm:p-4 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 border border-slate-600 rounded-lg text-left transition-colors disabled:opacity-50 group"
    >
      <div class="flex items-start space-x-2.5 sm:space-x-3">
        <div class="w-8 h-8 sm:w-10 sm:h-10 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-theme font-medium text-sm sm:text-base mb-0.5 sm:mb-1">Restore My Account</h3>
          <p class="text-slate-400 text-xs sm:text-sm leading-snug">
            I already have a backup code from before
          </p>
        </div>
        <svg class="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-hover:text-theme transition-colors flex-shrink-0 mt-0.5 sm:mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  </div>

  <!-- Help text -->
  <div class="mt-4 sm:mt-6 p-2.5 sm:p-3 bg-slate-700/30 rounded-lg border border-slate-600/30">
    <p class="text-slate-400 text-[11px] sm:text-xs leading-relaxed">
      <span class="font-medium text-slate-300">New here?</span> Choose "Sign in with Email" for the quickest setup.
      <br class="hidden sm:block" />
      <span class="sm:hidden"> </span>
      <span class="font-medium text-slate-300">Advanced user?</span> Create a secure account for maximum control.
    </p>
  </div>
</div>
