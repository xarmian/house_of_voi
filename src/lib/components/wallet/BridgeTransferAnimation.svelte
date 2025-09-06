<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { shouldReduceAnimations } from '$lib/stores/animations';
  import { detectDeviceCapabilities } from '$lib/utils/animations';

  export let isVisible = false;
  export let amount = 0; // Amount being transferred

  let containerElement: HTMLElement;
  let animationId: number;
  let bubbles: Array<{
    id: number;
    x: number;
    y: number;
    size: number;
    opacity: number;
    progress: number;
    speed: number;
  }> = [];

  $: reduceMotion = $shouldReduceAnimations;
  $: capabilities = detectDeviceCapabilities();

  onMount(() => {
    if (isVisible && !reduceMotion) {
      startAnimation();
    }
  });

  onDestroy(() => {
    stopAnimation();
  });

  $: if (isVisible && !reduceMotion) {
    startAnimation();
  } else {
    stopAnimation();
  }

  function startAnimation() {
    if (animationId) return;
    
    // Create initial bubbles
    createBubbles();
    
    // Start animation loop
    animate();
  }

  function stopAnimation() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = 0;
    }
    bubbles = [];
  }

  function createBubbles() {
    const bubbleCount = capabilities.isMobile ? 4 : 6;
    bubbles = [];
    
    for (let i = 0; i < bubbleCount; i++) {
      bubbles.push({
        id: i,
        x: Math.random() * 100, // Start at random position along the bridge
        y: 50, // Center vertically
        size: 4 + Math.random() * 3,
        opacity: 0.3 + Math.random() * 0.4,
        progress: Math.random() * 0.5, // Start at different points
        speed: 0.5 + Math.random() * 0.3 // Different speeds for variety
      });
    }
  }

  function animate() {
    if (!containerElement) return;
    
    // Update bubbles
    bubbles = bubbles.map(bubble => {
      let newProgress = bubble.progress + bubble.speed * 0.01; // Animation speed based on bubble speed
      
      // Reset bubble when it reaches the end
      if (newProgress > 1) {
        newProgress = 0;
        bubble.x = 0; // Start from left
        bubble.size = 4 + Math.random() * 3; // Randomize size on reset
        bubble.speed = 0.5 + Math.random() * 0.3; // Randomize speed on reset
      }
      
      // Calculate position based on progress (smooth movement from left to right)
      const x = newProgress * 100; // Move from 0% to 100% of container width
      const y = 50 + Math.sin(newProgress * Math.PI * 3) * 2; // Subtle vertical wave
      
      // Calculate opacity - fade in at start, fade out at end
      let opacity;
      if (newProgress < 0.1) {
        opacity = (newProgress / 0.1) * 0.7; // Fade in
      } else if (newProgress > 0.9) {
        opacity = ((1 - newProgress) / 0.1) * 0.7; // Fade out
      } else {
        opacity = 0.7; // Full opacity in middle
      }
      
      return {
        ...bubble,
        x,
        y,
        progress: newProgress,
        opacity
      };
    });
    
    animationId = requestAnimationFrame(animate);
  }

  // Easing function for smooth particle movement
  function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  function formatAmount(microAlgos: number): string {
    return (microAlgos / 1000000).toFixed(2);
  }
</script>

{#if isVisible}
  <div 
    bind:this={containerElement}
    class="bridge-animation-container"
    role="img"
    aria-label="Bridge transfer animation showing tokens moving from Algorand to Voi"
  >
    <!-- Chain indicators -->
    <div class="chain-indicators">
      <div class="chain-indicator algorand">
        <div class="chain-icon">🔷</div>
        <div class="chain-label">Algorand</div>
        <div class="chain-amount">{formatAmount(amount)} aVOI</div>
      </div>
      
      <div class="chain-indicator voi">
        <div class="chain-icon">🟣</div>
        <div class="chain-label">Voi</div>
        <div class="chain-amount">Expected</div>
      </div>
    </div>

    <!-- Bridge path -->
    <div class="bridge-path">
      <div class="bridge-line"></div>
      <div class="bridge-icon">🌉</div>
    </div>

    <!-- Animated bubbles -->
    {#if !reduceMotion}
      <div class="bubbles-container">
        {#each bubbles as bubble (bubble.id)}
          <div 
            class="bubble"
            style="
              left: {bubble.x}%;
              top: {bubble.y}%;
              width: {bubble.size}px;
              height: {bubble.size}px;
              opacity: {bubble.opacity};
            "
          ></div>
        {/each}
      </div>
    {/if}

    <!-- Progress indicator -->
    <div class="progress-indicator">
      <div class="progress-dots">
        <div class="dot" class:active={true}></div>
        <div class="dot" class:active={true}></div>
        <div class="dot" class:active={true}></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
      <div class="progress-text">Transferring tokens across bridge...</div>
    </div>
  </div>
{:else}
  <!-- Fallback for reduced motion or when not visible -->
  <div class="bridge-animation-fallback">
    <div class="static-indicator">
      <div class="bridge-icon-static">🌉</div>
      <div class="transfer-text">Bridge transfer in progress...</div>
    </div>
  </div>
{/if}

<style>
  .bridge-animation-container {
    position: relative;
    width: 100%;
    height: 140px;
    background: linear-gradient(135deg, rgba(30, 58, 138, 0.1) 0%, rgba(147, 51, 234, 0.1) 100%);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 20px;
    overflow: visible;
    margin: 8px 0;
  }

  .chain-indicators {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .chain-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .chain-icon {
    font-size: 24px;
    filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
  }

  .chain-label {
    font-size: 12px;
    font-weight: 600;
    color: rgb(156, 163, 175);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .chain-amount {
    font-size: 11px;
    color: rgb(59, 130, 246);
    font-weight: 500;
  }

  .bridge-path {
    position: relative;
    height: 2px;
    background: linear-gradient(90deg, 
      rgba(59, 130, 246, 0.3) 0%, 
      rgba(147, 51, 234, 0.6) 50%, 
      rgba(147, 51, 234, 0.3) 100%
    );
    border-radius: 1px;
    margin: 8px 0;
  }

  .bridge-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    background: linear-gradient(90deg, 
      transparent 0%, 
      rgba(59, 130, 246, 0.8) 20%, 
      rgba(147, 51, 234, 0.8) 80%, 
      transparent 100%
    );
    border-radius: 1px;
    animation: bridge-flow 3s ease-in-out infinite;
  }

  .bridge-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 16px;
    background: rgba(15, 23, 42, 0.9);
    padding: 4px;
    border-radius: 50%;
    animation: bridge-pulse 2s ease-in-out infinite;
  }

  .bubbles-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .bubble {
    position: absolute;
    background: radial-gradient(circle, rgba(59, 130, 246, 0.8) 0%, rgba(147, 51, 234, 0.6) 70%, transparent 100%);
    border-radius: 50%;
    transform: translate(-50%, -50%);
    will-change: transform, opacity;
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.4);
  }

  .progress-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .progress-dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(156, 163, 175, 0.3);
    transition: all 0.3s ease;
  }

  .dot.active {
    background: rgb(59, 130, 246);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.5);
    animation: dot-pulse 1.5s ease-in-out infinite;
  }

  .progress-text {
    font-size: 11px;
    color: rgb(156, 163, 175);
    text-align: center;
  }

  .bridge-animation-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 80px;
    background: rgba(30, 58, 138, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
  }

  .static-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .bridge-icon-static {
    font-size: 24px;
    animation: bridge-pulse 2s ease-in-out infinite;
  }

  .transfer-text {
    font-size: 12px;
    color: rgb(156, 163, 175);
    text-align: center;
  }

  /* Animations */
  @keyframes bridge-flow {
    0%, 100% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(100%);
    }
  }

  @keyframes bridge-pulse {
    0%, 100% {
      transform: translate(-50%, -50%) scale(1);
      filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5));
    }
    50% {
      transform: translate(-50%, -50%) scale(1.1);
      filter: drop-shadow(0 0 12px rgba(147, 51, 234, 0.7));
    }
  }

  @keyframes dot-pulse {
    0%, 100% {
      transform: scale(1);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.2);
      opacity: 1;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .bridge-line,
    .bridge-icon,
    .bridge-icon-static,
    .dot.active {
      animation: none;
    }
    
    .bubble {
      display: none;
    }
  }
</style>
