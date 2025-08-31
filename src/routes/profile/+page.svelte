<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { walletService } from '$lib/services/wallet';

	let addressInput = '';
	let isLoading = false;

	function handleSubmit() {
		if (!addressInput.trim()) return;
		
		isLoading = true;
		const address = addressInput.trim();
		goto(`/profile/${address}`);
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSubmit();
		}
	}

	onMount(() => {
		// Check if gaming wallet exists and redirect to user's profile
		const gamingWalletData = walletService.getPublicWalletData();
		if (gamingWalletData?.address) {
			goto(`/profile/${gamingWalletData.address}`);
			return;
		}

		// If no gaming wallet exists, focus the search input
		const input = document.getElementById('address-input');
		if (input) input.focus();
	});
</script>

<svelte:head>
	<title>Player Profiles - House of Voi</title>
	<meta name="description" content="Search and view player profiles, statistics, and history on House of Voi" />
</svelte:head>

<div class="profile-search-page">
	<div class="search-container">
		<div class="search-header">
			<h1>Player Profiles</h1>
			<p>Enter a player's address to view their stats and gaming history</p>
		</div>

		<div class="search-form">
			<div class="input-group">
				<input
					id="address-input"
					type="text"
					bind:value={addressInput}
					on:keypress={handleKeyPress}
					placeholder="Enter wallet address..."
					class="address-input"
					disabled={isLoading}
				/>
				<button
					on:click={handleSubmit}
					disabled={!addressInput.trim() || isLoading}
					class="search-button"
				>
					{#if isLoading}
						<span class="loading-spinner"></span>
					{:else}
						View Profile
					{/if}
				</button>
			</div>
		</div>

		<div class="search-tips">
			<div class="tip-item">
				<span class="tip-icon">🔍</span>
				<span>Search by wallet address to view detailed player statistics</span>
			</div>
			<div class="tip-item">
				<span class="tip-icon">📊</span>
				<span>View spin history, wins, losses, and performance trends</span>
			</div>
			<div class="tip-item">
				<span class="tip-icon">🏆</span>
				<span>Compare rankings and achievements with other players</span>
			</div>
		</div>
	</div>
</div>

<style>
	.profile-search-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 2rem;
	}

	.search-container {
		max-width: 500px;
		width: 100%;
		background: rgba(255, 255, 255, 0.95);
		border-radius: 20px;
		padding: 3rem 2rem;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
		backdrop-filter: blur(10px);
		text-align: center;
	}

	.search-header {
		margin-bottom: 2.5rem;
	}

	.search-header h1 {
		color: #2d3748;
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #667eea, #764ba2);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.search-header p {
		color: #718096;
		font-size: 1.1rem;
		margin: 0;
		line-height: 1.5;
	}

	.input-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.address-input {
		flex: 1;
		padding: 1rem 1.25rem;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		font-size: 1rem;
		transition: all 0.3s ease;
		background: white;
		color: #2d3748;
	}

	.address-input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.address-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.search-button {
		padding: 1rem 2rem;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		border: none;
		border-radius: 12px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
		min-width: 140px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.search-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
	}

	.search-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.loading-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top: 2px solid white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.search-tips {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		text-align: left;
	}

	.tip-item {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: rgba(102, 126, 234, 0.05);
		border-radius: 12px;
		border-left: 4px solid #667eea;
	}

	.tip-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.tip-item span:last-child {
		color: #4a5568;
		font-size: 0.95rem;
		line-height: 1.4;
	}

	@media (max-width: 640px) {
		.profile-search-page {
			padding: 1rem;
		}

		.search-container {
			padding: 2rem 1.5rem;
		}

		.input-group {
			flex-direction: column;
		}

		.search-header h1 {
			font-size: 2rem;
		}

		.search-tips {
			gap: 0.75rem;
		}

		.tip-item {
			padding: 0.75rem;
		}
	}
</style>