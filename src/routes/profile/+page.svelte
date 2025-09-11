<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { currentTheme } from '$lib/stores/theme';
    import AddressSearch from '$lib/components/ui/AddressSearch.svelte';

	let addressInput = '';
	let isLoading = false;

	function handleSubmit() {
		if (!addressInput.trim()) return;
		
		isLoading = true;
		const address = addressInput.trim();
		goto(`/profile/${address}`);
	}

	// Key handling moved to handleKeyDown for dropdown navigation

// Focus handled by AddressSearch via autofocus prop

	// Theme-aware background similar to app route
	$: backgroundStyle = $currentTheme?.background?.via 
		? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.via}, ${$currentTheme.background.to});`
		: $currentTheme?.background 
		? `background-image: linear-gradient(${$currentTheme.background.direction}, ${$currentTheme.background.from}, ${$currentTheme.background.to});`
		: 'background-image: linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a);';

  // Suggestions handled by AddressSearch component
</script>

<svelte:head>
	<title>Player Profiles - House of Voi</title>
	<meta name="description" content="Search and view player profiles, statistics, and history on House of Voi" />
</svelte:head>

<main class="min-h-screen px-4 py-10 sm:py-16" style={backgroundStyle}>
	<div class="max-w-xl mx-auto">
		<div class="card bg-surface-primary/70 backdrop-blur-md border border-surface-border rounded-2xl p-6 sm:p-8 text-center shadow-lg">
			<div class="mb-6">
				<h1 class="text-3xl sm:text-4xl font-bold text-theme mb-2">Player Profiles</h1>
				<p class="text-theme-text opacity-70 text-sm sm:text-base">Enter a player's address to view their stats and gaming history</p>
			</div>

			<div class="mb-2">
				<div class="flex flex-col sm:flex-row gap-3 items-stretch relative" bind:this={searchBoxEl}>
					<AddressSearch
						className="flex-1"
						bind:value={addressInput}
						autofocus={true}
						placeholder="Enter wallet address..."
						disabled={isLoading}
						on:select={(e) => goto(`/profile/${e.detail.address}`)}
						on:enter={(e) => { const v = e.detail.value.trim(); if (v) goto(`/profile/${v}`); }}
					/>
					<button
						on:click={handleSubmit}
						disabled={!addressInput.trim() || isLoading}
						class="btn-primary min-w-[140px] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
					>
						{#if isLoading}
							<span class="inline-block w-4 h-4 border-2 border-theme-primary border-t-transparent rounded-full animate-spin"></span>
							<span>Loading</span>
						{:else}
							<span>View Profile</span>
						{/if}
					</button>

					</div>

			<div class="mt-6 space-y-2 text-left hidden sm:block">
				<div class="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary/60 border border-surface-border">
					<span class="text-lg">🔍</span>
					<span class="text-theme-text opacity-80">Search by wallet address to view detailed player statistics</span>
				</div>
				<div class="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary/60 border border-surface-border">
					<span class="text-lg">📊</span>
					<span class="text-theme-text opacity-80">View spin history, wins, losses, and performance trends</span>
				</div>
				<div class="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary/60 border border-surface-border">
					<span class="text-lg">🏆</span>
					<span class="text-theme-text opacity-80">Compare rankings and achievements with other players</span>
				</div>
			</div>
		</div>
	</div>
</main>
