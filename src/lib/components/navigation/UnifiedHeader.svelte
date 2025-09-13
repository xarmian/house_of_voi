<script lang="ts">
  import { page } from '$app/stores';
  import { Home, Gamepad2, Building, User, Trophy } from 'lucide-svelte';
  import UserPreferencesButton from '$lib/components/ui/UserPreferencesButton.svelte';
  import { currentTheme } from '$lib/stores/theme';
  import { walletService } from '$lib/services/wallet';
  
  // Determine current route
  $: currentRoute = $page.route?.id || '/';
  
  const gamingWalletData = walletService.getPublicWalletData();

  const navItems = [
    { href: '/', label: 'Home', icon: Home, exact: true },
    { href: '/app', label: 'Play', icon: Gamepad2, exact: false },
    { href: '/house', label: 'House', icon: Building, exact: false },
    { href: '/tournament/weekend-2025-09-12', label: 'Tournament', icon: Trophy, exact: false },
    { href: '/profile/' + gamingWalletData?.address || '', label: 'Profiles', icon: User, exact: false }
  ];  
</script>

<header class="backdrop-blur-md border-b sticky top-0 z-40" 
        style="background: var(--theme-surface-primary, rgb(30 41 59 / 0.95)); border-color: var(--theme-surface-border, #475569);">
  <div class="max-w-7xl mx-auto px-4 py-3">
    <div class="flex items-center justify-between">
      <!-- Left side: Logo and Navigation -->
      <div class="flex items-center">
        <!-- Logo -->
        <a href="/" class="flex items-center space-x-2 mr-8">
          <div class="w-8 h-8 bg-gradient-to-br from-voi-500 to-voi-600 rounded-lg flex items-center justify-center">
            <span class="text-white font-bold text-sm">VOI</span>
          </div>
          <span class="text-theme font-bold text-lg hidden sm:block">House of Voi</span>
        </a>
        
        <!-- Navigation Links -->
        <nav class="flex items-center space-x-1">
          {#each navItems as item}
            {@const isActive = item.exact ? currentRoute === item.href : currentRoute.startsWith(item.href)}
            <a 
              href={item.href}
              class="flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 nav-link {isActive ? 'active' : ''}"
            >
              <svelte:component this={item.icon} class="w-4 h-4" />
              <span class="hidden sm:inline">{item.label}</span>
            </a>
          {/each}
        </nav>
      </div>
      
      <!-- Right side: Sound Controls with Settings -->
      <div class="flex items-center">
        <!-- Desktop: Full sound button with settings -->
        <div class="hidden lg:block">
          <UserPreferencesButton 
            showSettings={true}
            compact={false}
          />
        </div>
        
        <!-- Mobile: Compact sound button without settings -->
        <div class="lg:hidden">
          <UserPreferencesButton 
            showSettings={false}
            compact={true}
          />
        </div>
      </div>
    </div>
  </div>
</header>

<style>
  .nav-link {
    color: var(--theme-text, #94a3b8);
  }

  .nav-link:hover {
    color: var(--theme-primary);
    background: var(--theme-surface-hover);
  }

  .nav-link.active {
    background: var(--theme-primary);
    color: var(--theme-text, #ffffff);
  }

  .bg-voi-600 {
    background-color: #059669;
  }
  
  .bg-voi-600\/20 {
    background-color: rgba(5, 150, 105, 0.2);
  }
  
  .hover\:bg-voi-600\/30:hover {
    background-color: rgba(5, 150, 105, 0.3);
  }
  
  .from-voi-500 {
    --tw-gradient-from: #10b981;
  }
  
  .to-voi-600 {
    --tw-gradient-to: #059669;
  }
  
  .text-voi-400 {
    color: #10b981;
  }
  
  .text-voi-500 {
    color: #10b981;
  }
</style>