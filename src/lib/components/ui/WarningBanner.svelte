<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';

  export let message = "This is an experimental prototype deployed on Voi Mainnet. It is provided as-is, with no guarantees of reliability, availability, or accuracy. Outcomes are random and for entertainment purposes only. Do not expect consistent performance, returns, or support. Play at your own risk.";
</script>

<div class="warning-banner">
  <div class="banner-content">
    <div class="icon-container">
      <AlertTriangle class="w-5 h-5 text-amber-600" />
    </div>
    <div class="message-container">
      <p class="banner-message">
        {message}
      </p>
    </div>
  </div>
</div>

<style lang="postcss">
  .warning-banner {
    @apply w-full py-4 px-4 mb-6;
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.15) 100%);
    border: 1px solid rgba(217, 119, 6, 0.3);
    border-radius: 12px;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .banner-content {
    @apply flex items-start gap-3 max-w-6xl mx-auto;
  }

  .icon-container {
    @apply flex-shrink-0 mt-1;
  }

  .message-container {
    @apply flex-1 min-w-0;
  }

  .banner-message {
    @apply text-amber-100 text-sm md:text-base leading-relaxed;
    line-height: 1.5;
  }

  /* Mobile optimizations */
  @media (max-width: 640px) {
    .warning-banner {
      @apply py-3 px-3 mb-4;
    }
    
    .banner-content {
      @apply gap-2;
    }
    
    .banner-message {
      @apply text-sm;
    }
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .warning-banner {
      @apply border-2 border-amber-400;
      background: rgba(245, 158, 11, 0.3);
    }
    
    .banner-message {
      @apply text-amber-50;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .warning-banner {
      backdrop-filter: none;
    }
  }
</style>