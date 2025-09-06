<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { 
		User,
		Trophy,
		Target,
		TrendingUp,
		Share,
		Copy,
		ExternalLink,
		ArrowLeft,
		Settings,
		Crown,
		Activity,
		Calendar,
		MapPin,
		Medal,
		Coins,
		Search,
		Award
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import PlayerStats from '$lib/components/game/PlayerStats.svelte';
	import PlayerHistory from '$lib/components/game/PlayerHistory.svelte';
	import PlayerAchievements from '$lib/components/game/PlayerAchievements.svelte';
	import { hovStatsStore, connectionStatus } from '$lib/stores/hovStats';
	import { hovStatsService } from '$lib/services/hovStats';
	import { MULTI_CONTRACT_CONFIG } from '$lib/constants/network';

	// Get the default slot machine app ID from multi-contract config
	function getDefaultSlotMachineAppId(): bigint {
		if (!MULTI_CONTRACT_CONFIG) {
			console.warn('No multi-contract configuration found for player profile');
			return BigInt(0);
		}
		
		const defaultContract = MULTI_CONTRACT_CONFIG.contracts.find(
			c => c.id === MULTI_CONTRACT_CONFIG.defaultContractId
		);
		
		if (!defaultContract) {
			console.warn('Default contract not found in multi-contract configuration');
			return BigInt(0);
		}
		
		return BigInt(defaultContract.slotMachineAppId);
	}

	import { walletStore } from '$lib/stores/wallet';
	import { walletService } from '$lib/services/wallet';
	import { formatVOI } from '$lib/constants/betting';
	import { BLOCKCHAIN_CONFIG } from '$lib/constants/network';
	import { ensureBase32TxId } from '$lib/utils/transactionUtils';
	import type { PlayerStats as PlayerStatsType, PlayerRank, BiggestWin } from '$lib/types/hovStats';

	export let address: string;

	// State
	let stats: PlayerStatsType | null = null;
	let rank: PlayerRank | null = null;
	let biggestWins: BiggestWin[] = [];
	let loading = false;
	let error: string | null = null;
	let isOwnProfile = false;
	let showFullAddress = false;
	let activeTab: 'stats' | 'history' | 'achievements' = 'stats';
	let searchAddress = '';
	let showSearch = false;

	// Computed values
	$: shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
	$: mediumAddress = `${address.slice(0, 12)}...${address.slice(-8)}`;
	$: mobileAddress = `${address.slice(0, 4)}...${address.slice(-3)}`;
	$: isOwnProfile = address === walletService.getPublicWalletData()?.address;

	// Player card data
	$: playerCardData = stats ? {
		totalSpins: Number(stats.total_spins),
		totalWagered: Number(stats.total_amount_bet),
		totalWon: Number(stats.total_amount_won),
		netResult: Number(stats.net_result),
		winRate: stats.win_rate,
		biggestWin: Number(stats.largest_single_win),
		avgBetSize: stats.average_bet_size,
		daysActive: stats.days_active,
		longestWinStreak: stats.longest_winning_streak,
		rank: rank ? Number(rank.player_rank) : null,
		percentile: rank?.percentile || null
	} : null;

	// Reload when address changes
	$: if (address) {
		loadPlayerProfile();
	}

	async function loadPlayerProfile() {
		loading = true;
		error = null;

		try {
			// Ensure hovStatsService is initialized (fallback in case store didn't initialize)
			await hovStatsService.initialize();
			
			// Ensure we have hovStats store initialized for this profile page
			if (!$connectionStatus || $connectionStatus === 'disconnected') {
				await hovStatsStore.initialize({ includePlatformStats: false });
			}
			// Load player stats, rank, and biggest wins in parallel
			const [statsResult, rankResult, biggestWinsResult] = await Promise.allSettled([
				hovStatsService.getPlayerStats({
					p_app_id: getDefaultSlotMachineAppId(),
					p_player_address: address
				}),
				hovStatsService.getPlayerRank({
					p_app_id: getDefaultSlotMachineAppId(),
					p_player_address: address
				}),
				hovStatsService.getPlayerBiggestWins(address, getDefaultSlotMachineAppId())
			]);

			if (statsResult.status === 'fulfilled') {
				stats = statsResult.value;
			} else {
				console.warn('Failed to load player stats:', statsResult.reason);
			}

			if (rankResult.status === 'fulfilled') {
				rank = rankResult.value;
			} else {
				console.warn('Failed to load player rank:', rankResult.reason);
			}

			if (biggestWinsResult.status === 'fulfilled') {
				biggestWins = biggestWinsResult.value;
			} else {
				console.warn('Failed to load biggest wins:', biggestWinsResult.reason);
			}

			// If all core data failed, show error
			if (statsResult.status === 'rejected' && rankResult.status === 'rejected') {
				throw new Error('Failed to load player profile data');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load player profile';
		} finally {
			loading = false;
		}
	}

	async function copyAddress() {
		try {
			await navigator.clipboard.writeText(address);
			// Could show toast notification here
		} catch (err) {
			console.error('Failed to copy address:', err);
		}
	}

	async function shareProfile() {
		const shareData = {
			title: `${shortAddress} - Player Profile`,
			text: `Check out ${shortAddress}'s gaming stats on House of Voi`,
			url: window.location.href
		};

		try {
			if (navigator.share && navigator.canShare(shareData)) {
				await navigator.share(shareData);
			} else {
				await navigator.clipboard.writeText(window.location.href);
			}
		} catch (err) {
			console.error('Failed to share profile:', err);
		}
	}

	function goBack() {
		goto('/app');
	}

	function handleSearch() {
		if (!searchAddress.trim()) return;
		const address = searchAddress.trim();
		
		// Clear and collapse search
		searchAddress = '';
		showSearch = false;
		
		goto(`/profile/${address}`);
	}

	function handleSearchKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSearch();
		}
		if (event.key === 'Escape') {
			showSearch = false;
			searchAddress = '';
		}
	}

	function formatAddress(addr: string, showFull: boolean = false): string {
		if (showFull) return addr;
		// Use shorter format on mobile screens
		if (typeof window !== 'undefined' && window.innerWidth <= 480) {
			return mobileAddress;
		}
		if (typeof window !== 'undefined' && window.innerWidth <= 768) {
			return shortAddress;
		}
		return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
	}

	function getRankDisplay(): string {
		if (!rank) return '';
		const rankNum = Number(rank.player_rank);
		const totalPlayers = Number(rank.total_players);
		
		if (rankNum === 1) return '🥇 #1 Player';
		if (rankNum === 2) return '🥈 #2 Player';
		if (rankNum === 3) return '🥉 #3 Player';
		if (rankNum <= 10) return `🏆 Top 10 (#${rankNum})`;
		if (rank.percentile >= 90) return `⭐ Top ${(100 - rank.percentile).toFixed(0)}%`;
		if (rank.percentile >= 75) return `📈 Top 25%`;
		return `#${rankNum} of ${totalPlayers}`;
	}

	function getStatusBadge(): { text: string; color: string } | null {
		if (!stats) return null;
		
		const netResult = Number(stats.net_result);
		const totalSpins = Number(stats.total_spins);
		
		if (totalSpins === 0) return { text: 'New Player', color: 'bg-blue-500' };
		if (netResult > 0) return { text: 'In Profit', color: 'bg-green-500' };
		if (stats.win_rate > 50) return { text: 'Hot Streak', color: 'bg-orange-500' };
		return { text: 'Active Player', color: 'bg-purple-500' };
	}

	function getWinRankIcon(index: number) {
		switch (index) {
			case 0: return Crown; // Gold crown for #1
			case 1: return Medal; // Silver medal for #2
			case 2: return Medal; // Bronze medal for #3
			default: return Trophy; // Regular trophy for 4th-5th
		}
	}

	function getWinRankColor(index: number): string {
		switch (index) {
			case 0: return 'text-yellow-400'; // Gold
			case 1: return 'text-gray-300'; // Silver
			case 2: return 'text-amber-600'; // Bronze
			default: return 'text-purple-400'; // Purple for others
		}
	}

	function formatWinDate(date: Date): string {
		return date.toLocaleDateString('en-US', { 
			month: 'short', 
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getExplorerUrl(txid: string): string {
		const base32TxId = ensureBase32TxId(txid);
		return `${BLOCKCHAIN_CONFIG.explorerUrl}/transaction/${base32TxId}`;
	}
</script>

<svelte:head>
	<title>{shortAddress} - Player Profile | House of Voi</title>
	<meta name="description" content="View {shortAddress}'s gaming statistics and history on House of Voi" />
	<meta property="og:title" content="{shortAddress} - Player Profile | House of Voi" />
	<meta property="og:description" content="Gaming stats and history for player {shortAddress}" />
	<meta property="og:type" content="profile" />
</svelte:head>

<div class="profile-page">
	{#if loading && !stats}
		<!-- Loading state -->
		<div class="loading-container" transition:fade={{ duration: 300 }}>
			<div class="loading-card">
				<div class="loading-spinner"></div>
				<h2 class="loading-title">Loading Player Profile</h2>
				<p class="loading-text">Fetching {shortAddress}'s gaming data...</p>
			</div>
		</div>
	{:else if error && !stats}
		<!-- Error state -->
		<div class="error-container" transition:fade={{ duration: 300 }}>
			<div class="error-card">
				<div class="error-icon">⚠️</div>
				<h2 class="error-title">Profile Not Found</h2>
				<p class="error-text">{error}</p>
				<button on:click={goBack} class="back-button">
					<ArrowLeft class="w-4 h-4" />
					Back to Search
				</button>
			</div>
		</div>
	{:else}
		<!-- Profile content -->
		<div class="profile-container" transition:fade={{ duration: 300 }}>
			<!-- Header -->
			<div class="profile-header" transition:fly={{ y: -20, duration: 400 }}>
				<div class="header-background">
					<div class="gradient-overlay"></div>
					<div class="pattern-overlay"></div>
				</div>
				
				<div class="header-content">
					<button on:click={goBack} class="back-btn">
						<ArrowLeft class="w-5 h-5" />
					</button>

					<div class="profile-info">
						<!-- Avatar placeholder -->
						<div class="avatar-container">
							<div class="avatar-placeholder">
								<User class="w-12 h-12" />
							</div>
							<div class="avatar-ring"></div>
							{#if getRankDisplay()}
								<div class="rank-badge" title="Player Rank">
									{#if rank && Number(rank.player_rank) <= 3}
										<Crown class="w-3 h-3" />
									{:else}
										<Trophy class="w-3 h-3" />
									{/if}
								</div>
							{/if}
						</div>

						<!-- Player details -->
						<div class="player-details">
							<div class="player-name-section">
								<h1 class="player-name">
									{isOwnProfile ? 'Your Profile' : 'Player Profile'}
								</h1>
								<div class="address-section">
									<button 
										on:click={() => showFullAddress = !showFullAddress}
										class="address-display"
										title={showFullAddress ? 'Click to shorten' : 'Click to expand'}
									>
										{formatAddress(address, showFullAddress)}
									</button>
									<button on:click={copyAddress} class="copy-btn" title="Copy address">
										<Copy class="w-4 h-4" />
									</button>
								</div>
							</div>

							<!-- Status badges -->
							<div class="badges-section">
								{#if getStatusBadge()}
									<span class="status-badge {getStatusBadge()?.color}">
										{getStatusBadge()?.text}
									</span>
								{/if}
								{#if getRankDisplay()}
									<span class="rank-badge-text" title="Global Ranking">
										{getRankDisplay()}
									</span>
								{/if}
							</div>

							<!-- Quick stats -->
							{#if playerCardData}
								<div class="quick-stats">
									<div class="quick-stat">
										<div class="stat-value text-blue-400">
											{playerCardData.totalSpins.toLocaleString()}
										</div>
										<div class="stat-label">Spins</div>
									</div>
									<div class="quick-stat">
										<div class="stat-value text-purple-400">
											{playerCardData.winRate.toFixed(1)}%
										</div>
										<div class="stat-label">Win Rate</div>
									</div>
									<div class="quick-stat">
										<div class="stat-value text-yellow-400">
											{playerCardData.daysActive}d
										</div>
										<div class="stat-label">Active</div>
									</div>
								</div>
							{/if}

						</div>
					</div>

					<!-- Header actions - positioned between profile and biggest wins -->
					<div class="header-actions">
						<button on:click={() => showSearch = true} class="action-btn" title="Go to profile">
							<Search class="w-5 h-5" />
						</button>
						<button on:click={shareProfile} class="action-btn" title="Share profile">
							<Share class="w-5 h-5" />
						</button>
					</div>

					<!-- Biggest Wins List - now on far right -->
					{#if biggestWins.length > 0}
						<div class="biggest-wins-sidebar">
							<h3 class="wins-title">Biggest Wins</h3>
							<div class="wins-list">
								{#each biggestWins as win, index}
									<div class="win-item">
										<div class="win-main">
											<span class="win-payout">{formatVOI(Number(win.payout))} VOI</span>
											<span class="win-date">{formatWinDate(win.created_at)}</span>
										</div>
										<div class="win-details">
											<span class="win-bet">Bet: {formatVOI(Number(win.total_bet_amount) / (Number(win.max_payline_index) + 1))} × {Number(win.max_payline_index) + 1} lines</span>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Search overlay -->
			{#if showSearch}
				<div class="search-overlay" transition:fade={{ duration: 200 }}>
					<div class="search-box">
						<input
							type="text"
							bind:value={searchAddress}
							on:keypress={handleSearchKeyPress}
							placeholder="Enter wallet address..."
							class="search-overlay-input"
							autofocus
						/>
						<div class="search-actions">
							<button on:click={handleSearch} class="search-go-btn">Go</button>
							<button on:click={() => { showSearch = false; searchAddress = ''; }} class="search-cancel-btn">Cancel</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Tab navigation -->
			<div class="tab-navigation" transition:fly={{ y: 20, duration: 400, delay: 200 }}>
				<button 
					class="tab-btn {activeTab === 'stats' ? 'active' : ''}"
					on:click={() => activeTab = 'stats'}
				>
					<Activity class="w-4 h-4" />
					<span class="tab-text">
						<span class="tab-full">Statistics</span>
						<span class="tab-short">Stats</span>
					</span>
				</button>
				<button 
					class="tab-btn {activeTab === 'history' ? 'active' : ''}"
					on:click={() => activeTab = 'history'}
				>
					<Calendar class="w-4 h-4" />
					<span class="tab-text">
						<span class="tab-full">History</span>
						<span class="tab-short">History</span>
					</span>
				</button>
				<button 
					class="tab-btn {activeTab === 'achievements' ? 'active' : ''}"
					on:click={() => activeTab = 'achievements'}
				>
					<Award class="w-4 h-4" />
					<span class="tab-text">
						<span class="tab-full">Achievements</span>
						<span class="tab-short">Awards</span>
					</span>
				</button>
			</div>

			<!-- Tab content -->
			<div class="tab-content" transition:fly={{ y: 20, duration: 400, delay: 300 }}>
				{#if activeTab === 'stats'}
					<div class="stats-tab" transition:fade={{ duration: 200 }}>
						<PlayerStats 
							playerAddress={address} 
							compact={false} 
							showComparison={false} 
							autoRefresh={true} 
						/>
					</div>
				{:else if activeTab === 'history'}
					<div class="history-tab" transition:fade={{ duration: 200 }}>
						<PlayerHistory playerAddress={address} compact={false} pageSize={50} hideHeader={false} />
					</div>
				{:else if activeTab === 'achievements'}
					<div class="achievements-tab" transition:fade={{ duration: 200 }}>
						<PlayerAchievements playerAddress={address} />
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.profile-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
	}

	.loading-container, .error-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
	}

	.loading-card, .error-card {
		background: rgba(15, 23, 42, 0.95);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 24px;
		padding: 3rem 2rem;
		text-align: center;
		max-width: 400px;
		width: 100%;
	}

	.loading-spinner {
		width: 48px;
		height: 48px;
		border: 3px solid rgba(168, 85, 247, 0.1);
		border-top: 3px solid #a855f7;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1.5rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.loading-title, .error-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: white;
		margin-bottom: 0.5rem;
	}

	.loading-text, .error-text {
		color: #94a3b8;
		margin-bottom: 1.5rem;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, #667eea, #764ba2);
		color: white;
		border: none;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.back-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
	}

	.profile-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	.profile-header {
		position: relative;
		background: rgba(15, 23, 42, 0.8);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 24px;
		overflow: hidden;
		margin-bottom: 2rem;
	}

	.header-background {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.gradient-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
	}

	.pattern-overlay {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(circle at 25% 25%, rgba(168, 85, 247, 0.1) 0%, transparent 50%),
		                  radial-gradient(circle at 75% 75%, rgba(59, 130, 246, 0.1) 0%, transparent 50%);
	}

	.header-content {
		position: relative;
		z-index: 1;
		padding: 2rem;
		display: flex;
		align-items: flex-start;
		gap: 2rem;
	}

	.back-btn {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		color: white;
		cursor: pointer;
		transition: all 0.3s ease;
		flex-shrink: 0;
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.profile-info {
		flex: 1;
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.avatar-container {
		position: relative;
		flex-shrink: 0;
	}

	.avatar-placeholder {
		width: 120px;
		height: 120px;
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2));
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		border: 4px solid rgba(255, 255, 255, 0.2);
	}

	.avatar-ring {
		position: absolute;
		inset: -8px;
		border: 2px solid transparent;
		border-radius: 50%;
		background: linear-gradient(45deg, #a855f7, #3b82f6, #a855f7) border-box;
		mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
		mask-composite: xor;
		animation: rotate 3s linear infinite;
	}

	@keyframes rotate {
		to { transform: rotate(360deg); }
	}

	.rank-badge {
		position: absolute;
		bottom: 0;
		right: 0;
		background: linear-gradient(135deg, #f59e0b, #f97316);
		border: 3px solid rgba(15, 23, 42, 0.9);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.player-details {
		flex: 1;
		min-width: 0;
	}

	.player-name {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.address-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.address-display {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.95rem;
		color: #94a3b8;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.5rem 1rem;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.address-display:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.copy-btn {
		padding: 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.badges-section {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
	}

	.status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.rank-badge-text {
		padding: 0.25rem 0.75rem;
		background: rgba(168, 85, 247, 0.2);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 20px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #c084fc;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.quick-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 1.5rem;
		max-width: 500px;
	}

	.quick-stat {
		text-align: left;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 0.25rem;
	}

	.stat-label {
		font-size: 0.75rem;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 500;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
		flex-shrink: 0;
		align-items: flex-start;
		align-self: flex-start;
	}

	.search-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.search-box {
		background: rgba(15, 23, 42, 0.95);
		border: 1px solid rgba(148, 163, 184, 0.2);
		border-radius: 16px;
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		backdrop-filter: blur(10px);
	}

	.search-overlay-input {
		width: 100%;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: white;
		padding: 1rem;
		font-size: 1rem;
		outline: none;
		margin-bottom: 1.5rem;
		font-family: 'JetBrains Mono', monospace;
	}

	.search-overlay-input::placeholder {
		color: rgba(255, 255, 255, 0.5);
	}

	.search-overlay-input:focus {
		border-color: rgba(168, 85, 247, 0.5);
		box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.1);
	}

	.search-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.search-go-btn {
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		color: white;
		border: none;
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.search-go-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
	}

	.search-cancel-btn {
		background: transparent;
		color: #94a3b8;
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 8px;
		padding: 0.75rem 1.5rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.search-cancel-btn:hover {
		color: white;
		border-color: rgba(148, 163, 184, 0.5);
	}

	.action-btn {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		color: white;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.action-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
		transform: translateY(-1px);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.tab-navigation {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 16px;
		padding: 0.5rem;
		backdrop-filter: blur(10px);
		flex-wrap: wrap;
	}

	.tab-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 12px;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.3s ease;
		font-weight: 500;
		flex: 1;
		justify-content: center;
	}

	.tab-btn:hover {
		color: white;
		background: rgba(255, 255, 255, 0.05);
	}

	.tab-btn.active {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2));
		color: white;
		border: 1px solid rgba(168, 85, 247, 0.3);
	}

	.tab-text {
		position: relative;
	}

	.tab-short {
		display: none;
	}

	.tab-content {
		background: rgba(15, 23, 42, 0.5);
		border: 1px solid rgba(148, 163, 184, 0.1);
		border-radius: 20px;
		overflow: hidden;
		backdrop-filter: blur(10px);
	}

	.stats-tab, .history-tab, .achievements-tab {
		min-height: 400px;
	}

	/* Biggest Wins Sidebar */
	.biggest-wins-sidebar {
		min-width: 200px;
		max-width: 250px;
		flex-shrink: 0;
	}

	.wins-title {
		font-size: 0.875rem;
		font-weight: 600;
		color: #94a3b8;
		margin-bottom: 1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.wins-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.win-item {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.75rem;
		transition: all 0.2s ease;
	}

	.win-item:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.win-main {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.win-payout {
		font-size: 0.875rem;
		font-weight: 600;
		color: #10b981;
	}

	.win-date {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.win-details {
		display: flex;
		justify-content: center;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.win-bet {
		text-align: center;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.profile-container {
			padding: 1rem;
		}

		.profile-header {
			margin-bottom: 1.5rem;
		}

		.header-content {
			flex-direction: column;
			gap: 1.5rem;
			padding: 1.5rem 1rem;
			align-items: center;
			text-align: center;
		}

		.profile-info {
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 1.5rem;
			width: 100%;
		}

		.avatar-container {
			align-self: center;
			margin-bottom: 0;
		}

		.player-details {
			text-align: center;
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
		}

		.player-name-section {
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
			margin-bottom: 1rem;
		}

		.player-name {
			font-size: 1.5rem;
		}

		.address-section {
			justify-content: center;
			flex-wrap: wrap;
		}

		.address-display {
			font-size: 0.85rem;
			padding: 0.5rem 1rem;
			min-height: 44px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.copy-btn {
			min-width: 44px;
			min-height: 44px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.avatar-placeholder {
			width: 80px;
			height: 80px;
		}

		.avatar-ring {
			inset: -6px;
		}

		.rank-badge {
			width: 28px;
			height: 28px;
		}

		.badges-section {
			justify-content: center;
		}

		.quick-stats {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
			max-width: 300px;
			margin: 0 auto;
		}

		.stat-value {
			font-size: 1rem;
		}

		.stat-label {
			font-size: 0.7rem;
		}

		.biggest-wins-sidebar {
			min-width: unset;
			max-width: unset;
			width: 100%;
			margin-top: 1rem;
		}

		.wins-list {
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			display: grid;
			gap: 0.5rem;
		}

		.win-item {
			padding: 0.5rem;
		}

		.win-payout {
			font-size: 0.8rem;
		}

		.header-actions {
			position: absolute;
			top: 1rem;
			right: 1rem;
		}


		.back-btn {
			position: absolute;
			top: 1rem;
			left: 1rem;
			z-index: 10;
			min-width: 44px;
			min-height: 44px;
			padding: 0.75rem;
		}

		.action-btn {
			min-width: 44px;
			min-height: 44px;
			padding: 0.75rem;
		}

		.tab-navigation {
			padding: 0.375rem;
			gap: 0.375rem;
		}

		.tab-btn {
			padding: 0.6rem 1rem;
			font-size: 0.9rem;
			gap: 0.4rem;
		}

		.tab-btn :global(svg) {
			width: 0.9rem;
			height: 0.9rem;
		}
	}

	@media (max-width: 480px) {
		.profile-container {
			padding: 0.5rem;
		}

		.header-content {
			padding: 3rem 1rem 1.5rem;
			gap: 1rem;
		}

		.profile-info {
			gap: 1rem;
		}

		.player-name {
			font-size: 1.25rem;
			margin: 0;
		}

		.player-name-section {
			margin-bottom: 0.75rem;
		}

		.quick-stats {
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
			max-width: 280px;
		}

		.stat-value {
			font-size: 0.9rem;
		}

		.badges-section {
			gap: 0.5rem;
			margin-bottom: 1rem;
		}

		.biggest-wins-sidebar {
			margin-top: 0.75rem;
			width: 100%;
		}

		.wins-list {
			grid-template-columns: 1fr;
		}

		.back-btn {
			min-width: 40px;
			min-height: 40px;
			padding: 0.5rem;
		}

		.action-btn {
			min-width: 40px;
			min-height: 40px;
			padding: 0.5rem;
		}

		.copy-btn {
			min-width: 40px;
			min-height: 40px;
		}

		.address-display {
			min-height: 40px;
			font-size: 0.8rem;
		}

		.header-actions {
			top: 0.75rem;
			right: 0.75rem;
		}

		.back-btn {
			top: 0.75rem;
			left: 0.75rem;
		}

		.tab-navigation {
			padding: 0.25rem;
			gap: 0.25rem;
		}

		.tab-btn {
			padding: 0.5rem 0.75rem;
			font-size: 0.85rem;
			flex: 1;
			min-width: 0;
		}

		.tab-btn :global(svg) {
			width: 0.875rem;
			height: 0.875rem;
		}

		.tab-full {
			display: none;
		}

		.tab-short {
			display: inline;
		}
	}

	/* Tablet specific styles */
	@media (max-width: 1024px) and (min-width: 769px) {
		.header-content {
			padding: 2rem 1.5rem;
		}

		.main-profile-section {
			gap: 1.5rem;
		}

		.biggest-wins-sidebar {
			min-width: 180px;
			max-width: 200px;
		}

		.quick-stats {
			grid-template-columns: repeat(3, 1fr);
			gap: 1rem;
		}
	}

	/* Global component style overrides */
	:global(.profile-page .player-stats-container) {
		background: transparent;
		border: none;
		border-radius: 0;
	}

	:global(.profile-page .stats-header) {
		display: none;
	}
</style>