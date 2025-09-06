<script lang="ts">
  let isVisible = true;
  
  function toggleVisibility() {
    isVisible = !isVisible;
  }
</script>

<div class="voi-radio-container" class:hidden={!isVisible}>
  {#if isVisible}
    <iframe
      src="https://return4.github.io/VOI-Radio-Mini-Player/"
      width="180"
      height="60"
      title="VOI Radio Player"
      style="border:0; overflow:hidden; background:transparent;"
      allow="autoplay"
      scrolling="no">
    </iframe>
  {/if}
  
  <button
    class="toggle-button"
    on:click={toggleVisibility}
    aria-label={isVisible ? 'Hide radio player' : 'Show radio player'}
  >
    {isVisible ? '✕' : '🎵'}
  </button>
</div>

<style>
  .voi-radio-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    transition: all 0.3s ease;
  }
  
  .voi-radio-container.hidden {
    bottom: 20px;
    right: 20px;
  }
  
  .toggle-button {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.2s ease;
  }
  
  .toggle-button:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: scale(1.1);
  }
  
  iframe {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
  }
  
  @media (max-width: 768px) {
    .voi-radio-container {
      bottom: 10px;
      right: 10px;
    }
    
    iframe {
      width: 240px;
      height: 70px;
    }
  }
</style>