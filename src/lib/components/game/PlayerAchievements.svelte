<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Award, Star, Lock, Trophy, Target, Crown, Zap, Medal, Gift, Check, AlertCircle, Loader2 } from 'lucide-svelte';
	import { achievementsStore, claimingInProgress, achievementsLoading, achievementsError, nextAchievementProgress } from '$lib/stores/achievements';
	import { formatProgress, isNearCompletion, getProgressColor, getSeriesCompletionWithProgress } from '$lib/utils/achievementProgress';
	import type { Achievement, AchievementFilter } from '$lib/types/achievements';

	export let playerAddress: string;

	let selectedCategory: string = 'all';
	let selectedSeries: string = 'all';
	let searchTerm: string = '';
	let showOnlyOwned: boolean = false;
	let viewMode: 'series' | 'grid' = 'grid';
	let isClaimingAll = false;
	let claimSuccessMessage: string = '';
	let claimErrorMessage: string = '';
	let selectedAchievement: Achievement | null = null;

	const fallbackAchievementImage: string = '/symbols/star.svg';

	function handleAchievementImageError(event: Event) {
		const img = event.currentTarget as HTMLImageElement | null;
		if (!img) return;
		// Prevent potential error loops if the fallback also fails
		img.onerror = null;
		img.src = fallbackAchievementImage;
	}

	$: groupedAchievements = groupAchievementsBySeries(
		$achievementsStore.allAchievements,
		$achievementsStore.playerAchievements,
		selectedCategory,
		selectedSeries,
		searchTerm,
		showOnlyOwned
	);

	$: availableToClaimCount = $achievementsStore.allAchievements.filter(a => !a.owned && a.eligible).length;

	$: categories = getCategories($achievementsStore.allAchievements);
	$: seriesList = getSeriesList($achievementsStore.allAchievements);

	$: if (playerAddress) {
		achievementsStore.setPlayerAddress(playerAddress);
	}

	onDestroy(() => {
		achievementsStore.stopAutoRefresh();
	});

	function groupAchievementsBySeries(
		allAchievements: Achievement[],
		playerAchievements: Achievement[],
		category: string,
		series: string,
		search: string,
		ownedOnly: boolean
	) {
		let filtered = [...allAchievements];
		const ownedIds = new Set(playerAchievements.map(a => a.id));

		// Apply filters
		if (category !== 'all') {
			filtered = filtered.filter(a => (a.display?.category || a.category) === category);
		}

		if (series !== 'all') {
			filtered = filtered.filter(a => a.display?.seriesKey === series);
		}

		if (ownedOnly) {
			filtered = filtered.filter(a => ownedIds.has(a.id));
		}

		if (search) {
			const searchLower = search.toLowerCase();
			filtered = filtered.filter(a => 
				a.name.toLowerCase().includes(searchLower) ||
				a.description.toLowerCase().includes(searchLower) ||
				(a.display?.series && a.display.series.toLowerCase().includes(searchLower))
			);
		}

		// Add ownership status
		filtered = filtered.map(achievement => ({
			...achievement,
			owned: ownedIds.has(achievement.id)
		}));

		// Group by series
		const grouped: Record<string, Achievement[]> = {};
		
		filtered.forEach(achievement => {
			const seriesKey = achievement.display?.seriesKey || 'standalone';
			if (!grouped[seriesKey]) {
				grouped[seriesKey] = [];
			}
			grouped[seriesKey].push(achievement);
		});

		// Sort achievements within each series by order/tier
		Object.keys(grouped).forEach(seriesKey => {
			grouped[seriesKey].sort((a, b) => {
				// Primary sort: tier (ascending)
				const tierA = a.display?.tier || 999;
				const tierB = b.display?.tier || 999;
				if (tierA !== tierB) return tierA - tierB;
				
				// Secondary sort: order (ascending)
				const orderA = a.display?.order || 999;
				const orderB = b.display?.order || 999;
				return orderA - orderB;
			});
		});

		return grouped;
	}

	function getCategories(achievements: Achievement[]): string[] {
		const categorySet = new Set<string>();
		achievements.forEach(a => {
			const category = a.display?.category || a.category;
			if (category) categorySet.add(category);
		});
		return Array.from(categorySet).sort();
	}

	function getSeriesList(achievements: Achievement[]): Array<{key: string, name: string}> {
		const seriesMap = new Map<string, string>();
		achievements.forEach(a => {
			if (a.display?.seriesKey && a.display?.series) {
				seriesMap.set(a.display.seriesKey, a.display.series);
			}
		});
		return Array.from(seriesMap.entries()).map(([key, name]) => ({key, name})).sort((a, b) => a.name.localeCompare(b.name));
	}

	function getTierProgress(achievements: Achievement[]): {current: number, total: number} {
		if (achievements.length === 0) return {current: 0, total: 0};
		
		const ownedCount = achievements.filter(a => a.eligible).length;
		const totalTiers = achievements[0]?.display?.tiersTotal || achievements.length;
		
		return {current: ownedCount, total: totalTiers};
	}

	function getSeriesCompletionRate(achievements: Achievement[]): number {
		if (achievements.length === 0) return 0;
		const completionRate = getSeriesCompletionWithProgress(achievements);
		return Math.round(completionRate * 100);
	}

	function getAchievementIcon(achievement: Achievement) {
		if (achievement.display?.icon) {
			// Map common icon names to components
			switch (achievement.display.icon.toLowerCase()) {
				case 'trophy': return Trophy;
				case 'award': return Award;
				case 'star': return Star;
				case 'target': return Target;
				case 'crown': return Crown;
				case 'zap': return Zap;
				case 'medal': return Medal;
				case 'gift': return Gift;
				default: return Trophy;
			}
		}

		// Default icons by category
		switch (achievement.category) {
			case 'wagering': return Target;
			case 'wins': return Trophy;
			case 'streaks': return Zap;
			case 'milestones': return Crown;
			default: return Award;
		}
	}

	function getRarityColor(rarity?: string): string {
		switch (rarity?.toLowerCase()) {
			case 'legendary': return '#f59e0b'; // gold
			case 'epic': return '#a855f7'; // purple
			case 'rare': return '#3b82f6'; // blue
			case 'common': return '#10b981'; // green
			default: return '#6b7280'; // gray
		}
	}

	async function claimSingleAchievement(achievementId: string) {
		try {
			claimErrorMessage = '';
			claimSuccessMessage = '';
			
			const result = await achievementsStore.claimAchievements(achievementId);
			
			if (result) {
				if (result.minted.length > 0) {
					claimSuccessMessage = `Successfully claimed: ${result.minted.map(a => a.name).join(', ')}`;
					setTimeout(() => claimSuccessMessage = '', 5000);
					
					// Close modal if achievement was claimed from modal
					if (selectedAchievement && selectedAchievement.id === achievementId) {
						setTimeout(() => closeAchievementModal(), 1000);
					}
				}
				
				if (result.errors.length > 0) {
					claimErrorMessage = result.errors.map(e => e.reason).join(', ');
					setTimeout(() => claimErrorMessage = '', 8000);
				}
			}
		} catch (error) {
			console.error('Failed to claim achievement:', error);
			claimErrorMessage = 'Failed to claim achievement';
			setTimeout(() => claimErrorMessage = '', 8000);
		}
	}

	async function claimAllAchievements() {
		try {
			isClaimingAll = true;
			claimErrorMessage = '';
			claimSuccessMessage = '';
			
			const result = await achievementsStore.claimAchievements();
			
			if (result) {
				if (result.minted.length > 0) {
					claimSuccessMessage = `Successfully claimed ${result.minted.length} achievement(s)!`;
					setTimeout(() => claimSuccessMessage = '', 5000);
				}
				
				if (result.errors.length > 0) {
					claimErrorMessage = `Some achievements could not be claimed: ${result.errors.length} error(s)`;
					setTimeout(() => claimErrorMessage = '', 8000);
				}

				if (result.minted.length === 0 && result.errors.length === 0) {
					claimErrorMessage = 'No achievements available to claim';
					setTimeout(() => claimErrorMessage = '', 5000);
				}
			}
		} catch (error) {
			console.error('Failed to claim achievements:', error);
			claimErrorMessage = 'Failed to claim achievements';
			setTimeout(() => claimErrorMessage = '', 8000);
		} finally {
			isClaimingAll = false;
		}
	}

	async function refreshAchievements() {
		if (playerAddress) {
			await achievementsStore.refreshData(playerAddress);
		}
	}

	function showAchievementModal(achievement: Achievement) {
		selectedAchievement = achievement;
	}

	function closeAchievementModal() {
		selectedAchievement = null;
	}
</script>

<div class="achievements-container">
	{#if $achievementsLoading && !$achievementsStore.isInitialized}
		<div class="loading-section">
			<Loader2 class="w-12 h-12 animate-spin text-purple-400" />
			<p class="loading-text">Loading achievements...</p>
		</div>
	{:else if $achievementsError}
		<div class="error-section">
			<AlertCircle class="w-12 h-12 text-red-400" />
			<p class="error-text">{$achievementsError}</p>
			<button class="retry-button" on:click={refreshAchievements}>
				Try Again
			</button>
		</div>
	{:else if !playerAddress}
		<div class="no-address-section">
			<Lock class="w-12 h-12 text-gray-400" />
			<p class="no-address-text">Connect wallet to view achievements</p>
		</div>
	{:else}
		<!-- Achievement Controls -->
		<div class="achievement-controls">
			<div class="search-and-filters">
				<input 
					bind:value={searchTerm}
					placeholder="Search achievements..."
					class="search-input"
				/>
				
				<select bind:value={selectedCategory} class="category-select">
					<option value="all">All Categories</option>
					{#each categories as category}
						<option value={category}>{category}</option>
					{/each}
				</select>
				
				<select bind:value={selectedSeries} class="series-select">
					<option value="all">All Series</option>
					{#each seriesList as series}
						<option value={series.key}>{series.name}</option>
					{/each}
				</select>
				
				<label class="owned-toggle">
					<input type="checkbox" bind:checked={showOnlyOwned} />
					Owned only
				</label>
			</div>
			
			<div class="action-buttons">
				{#if availableToClaimCount > 0}
					<button 
						class="claim-all-button"
						on:click={claimAllAchievements}
						disabled={isClaimingAll || $claimingInProgress}
					>
						{#if isClaimingAll}
							<Loader2 class="w-4 h-4 animate-spin" />
						{:else}
							<Gift class="w-4 h-4" />
						{/if}
						Claim All ({availableToClaimCount})
					</button>
				{/if}
				
				<button class="refresh-button" on:click={refreshAchievements} disabled={$achievementsLoading}>
					{#if $achievementsLoading}
						<Loader2 class="w-4 h-4 animate-spin" />
					{:else}
						↻
					{/if}
				</button>
			</div>
		</div>

		<!-- Status Messages -->
		{#if claimSuccessMessage}
			<div class="success-message">
				<Check class="w-4 h-4" />
				{claimSuccessMessage}
			</div>
		{/if}
		
		{#if claimErrorMessage}
			<div class="error-message">
				<AlertCircle class="w-4 h-4" />
				{claimErrorMessage}
			</div>
		{/if}

		<!-- Achievement Stats -->
		<div class="achievement-stats">
			<div class="stat">
				<span class="stat-value">{$achievementsStore.playerAchievements.length}</span>
				<span class="stat-label">Owned</span>
			</div>
			<div class="stat">
				<span class="stat-value">{$achievementsStore.allAchievements.length}</span>
				<span class="stat-label">Total</span>
			</div>
			<div class="stat">
				<span class="stat-value">{availableToClaimCount}</span>
				<span class="stat-label">Claimable</span>
			</div>
		</div>

		<!-- Achievements Display -->
		{#if Object.keys(groupedAchievements).length > 0}
			<!-- Series Progression View -->
			<div class="series-progression">
				{#each Object.entries(groupedAchievements) as [seriesKey, achievements] (seriesKey)}
					{@const seriesName = achievements[0]?.display?.series || 'Standalone Achievements'}
					{@const progress = getTierProgress(achievements)}
					{@const completionRate = getSeriesCompletionRate(achievements)}
					{@const nextProgressInfo = $nextAchievementProgress.get(seriesKey)}
					
					<div class="series-track">
						<div class="series-header">
							<div class="series-info">
								<h2 class="series-title">{seriesName}</h2>
								<p class="series-description">Complete achievements in order to progress through tiers</p>
							</div>
							<div class="series-progress">
								<div class="progress-stats">
									<span class="progress-count">{progress.current} of {progress.total}</span>
									<span class="progress-percentage">{completionRate}% Complete</span>
								</div>
								<div class="progress-bar">
									<div class="progress-fill" style="width: {completionRate}%"></div>
								</div>
							</div>
						</div>

						<!-- Next Achievement Highlight -->
						{#if nextProgressInfo}
							<div class="next-achievement-highlight">
								<div class="next-achievement-label">
									<Target class="w-4 h-4" />
									Next Achievement: {nextProgressInfo.achievement.name}
								</div>
								<div class="next-achievement-progress">
									<span class="next-progress-text">{formatProgress(nextProgressInfo.progress)} complete</span>
									<div class="next-progress-bar">
										<div 
											class="next-progress-fill" 
											style="width: {nextProgressInfo.progress * 100}%; background-color: {getProgressColor(nextProgressInfo.progress)}"
										></div>
									</div>
								</div>
							</div>
						{/if}
						
						<div class="achievement-path">
							<div class="progression-line"></div>
							{#each achievements as achievement, index (achievement.id)}
								{@const IconComponent = getAchievementIcon(achievement)}
								{@const rarityColor = getRarityColor(achievement.display?.rarity)}
								{@const isNextToEarn = !achievement.eligible && (index === 0 || achievements[index - 1]?.eligible)}
								{@const isEligible = achievement.eligible && !achievement.owned}
								{@const isNextEligible = nextProgressInfo?.achievement.id === achievement.id}
								{@const hasProgress = isNextEligible && typeof achievement.progress === 'number' && achievement.progress > 0}
								{@const progressPercentage = hasProgress ? achievement.progress * 100 : 0}
								{@const progressColor = hasProgress ? getProgressColor(achievement.progress) : '#6b7280'}
								
								<div class="achievement-milestone" class:owned={achievement.owned} class:next-to-earn={isNextToEarn} class:eligible={isEligible}>
									<div class="milestone-connector" class:completed={achievement.owned}></div>
									
									<div class="milestone-achievement">
										<div class="achievement-badge" role="button" tabindex="0" on:click={() => showAchievementModal(achievement)} on:keydown={(e) => e.key === 'Enter' && showAchievementModal(achievement)}>
											<!-- Progress Ring for achievements with progress -->
											{#if hasProgress && !achievement.owned}
												<svg class="progress-ring" viewBox="0 0 100 100">
													<circle
														cx="50"
														cy="50"
														r="40"
														stroke="rgba(255, 255, 255, 0.2)"
														stroke-width="6"
														fill="none"
													/>
													<circle
														cx="50"
														cy="50"
														r="40"
														stroke={progressColor}
														stroke-width="6"
														fill="none"
														stroke-dasharray="251.33"
														stroke-dashoffset={251.33 - (progressPercentage / 100) * 251.33}
														transform="rotate(-90 50 50)"
														class="progress-circle"
														class:near-complete={isNearCompletion(achievement.progress)}
													/>
												</svg>
											{/if}
											
											{#if achievement.imageUrl}
												<img 
													src={achievement.imageUrl} 
													alt={achievement.name}
													on:error={handleAchievementImageError}
													class="badge-image"
													class:locked={!achievement.owned}
												/>
											{:else}
												<div class="badge-icon" style="border-color: {rarityColor}" class:locked={!achievement.owned}>
													<svelte:component this={IconComponent} class="w-6 h-6" style="color: {rarityColor}" />
												</div>
											{/if}
											
											{#if achievement.owned}
												<div class="completion-indicator">
													<Check class="w-3 h-3" />
												</div>
											{/if}
											
											{#if achievement.display?.tier}
												<div class="tier-label">{achievement.display.tier}</div>
											{/if}
											
											{#if isEligible}
												<div class="eligible-indicator">
													<Gift class="w-3 h-3" />
												</div>
											{/if}
										</div>
										
										<div class="achievement-details">
											<h3 class="milestone-name">{achievement.name}</h3>
											
											{#if hasProgress && !achievement.eligible}
												<div class="progress-text" style="color: {progressColor}">
													{formatProgress(achievement.progress)} complete
												</div>
											{/if}

											<p class="milestone-description">{achievement.description}</p>

											{#if achievement.display?.tags && achievement.display.tags.length > 0}
												<div class="milestone-tags">
													{#each achievement.display.tags.slice(0, 2) as tag}
														<span class="milestone-tag">{tag}</span>
													{/each}
												</div>
											{/if}
											
											{#if isEligible}
												<button 
													class="claim-achievement-button"
													on:click|stopPropagation={() => claimSingleAchievement(achievement.id)}
													disabled={$claimingInProgress}
												>
													{#if $claimingInProgress}
														<Loader2 class="w-3 h-3 animate-spin" />
													{:else}
														<Gift class="w-3 h-3" />
													{/if}
													Claim
												</button>
											{/if}
										</div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<div class="no-achievements">
				<Trophy class="w-12 h-12 text-gray-400" />
				<p class="no-achievements-text">
					{#if searchTerm || selectedCategory !== 'all' || selectedSeries !== 'all' || showOnlyOwned}
						No achievements match your filters
					{:else}
						No achievements found
					{/if}
				</p>
			</div>
		{/if}
	{/if}
</div>

<!-- Achievement Modal -->
{#if selectedAchievement}
	<div class="modal-overlay" on:click={closeAchievementModal}>
		<div class="modal-content" on:click|stopPropagation>
			<button class="modal-close" on:click={closeAchievementModal}>
				<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
				</svg>
			</button>
			
			<div class="modal-achievement">
				{#if selectedAchievement}
					{@const IconComponent = getAchievementIcon(selectedAchievement)}
					{@const rarityColor = getRarityColor(selectedAchievement.display?.rarity)}
					
					<div class="modal-badge" class:owned={selectedAchievement.owned}>
					{#if selectedAchievement.imageUrl}
						<img 
							src={selectedAchievement.imageUrl} 
							alt={selectedAchievement.name}
							on:error={handleAchievementImageError}
							class="modal-image"
							class:locked={!selectedAchievement.owned}
						/>
					{:else}
						<div class="modal-icon" style="border-color: {rarityColor}" class:locked={!selectedAchievement.owned}>
							<svelte:component this={IconComponent} class="w-16 h-16" style="color: {rarityColor}" />
						</div>
					{/if}
					
					{#if selectedAchievement.owned}
						<div class="modal-completion-indicator">
							<Check class="w-8 h-8" />
						</div>
					{/if}
					
					{#if selectedAchievement.display?.tier}
						<div class="modal-tier-label">{selectedAchievement.display.tier}</div>
					{/if}
				</div>
				
				<div class="modal-details">
					<h2 class="modal-title">{selectedAchievement.name}</h2>
					<p class="modal-description">{selectedAchievement.description}</p>
					
					{#if selectedAchievement.display?.series}
						<div class="modal-series">Series: {selectedAchievement.display.series}</div>
					{/if}
					
					{#if selectedAchievement.display?.tags && selectedAchievement.display.tags.length > 0}
						<div class="modal-tags">
							{#each selectedAchievement.display.tags as tag}
								<span class="modal-tag">{tag}</span>
							{/each}
						</div>
					{/if}
					
					{#if selectedAchievement.display?.rarity}
						<div class="modal-rarity" style="color: {rarityColor}">
							{selectedAchievement.display.rarity}
						</div>
					{/if}
					
					<div class="modal-status">
						{#if selectedAchievement.owned}
							<span class="status-completed">✓ Completed</span>
						{:else if selectedAchievement.eligible}
							<span class="status-eligible">🎁 Ready to Claim</span>
							<button 
								class="modal-claim-button"
								on:click={() => claimSingleAchievement(selectedAchievement.id)}
								disabled={$claimingInProgress}
							>
								{#if $claimingInProgress}
									<Loader2 class="w-4 h-4 animate-spin" />
								{:else}
									<Gift class="w-4 h-4" />
								{/if}
								Claim Achievement
							</button>
						{:else if Array.from($nextAchievementProgress.values()).some(p => p.achievement.id === selectedAchievement.id) && typeof selectedAchievement.progress === 'number' && selectedAchievement.progress > 0}
							<span class="status-progress">📈 {formatProgress(selectedAchievement.progress)} Complete</span>
							<div class="modal-progress-bar">
								<div 
									class="modal-progress-fill" 
									style="width: {selectedAchievement.progress * 100}%; background-color: {getProgressColor(selectedAchievement.progress)}"
								></div>
							</div>
						{:else}
							<span class="status-locked">🔒 Not Yet Earned</span>
						{/if}
					</div>
				</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.achievements-container {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	/* Loading and Error States */
	.loading-section,
	.error-section,
	.no-address-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-height: 300px;
		text-align: center;
	}

	.loading-text {
		color: #94a3b8;
		font-size: 1.1rem;
	}

	.error-text,
	.no-address-text {
		color: #ef4444;
		font-size: 1rem;
		margin: 0;
	}

	.no-address-text {
		color: #94a3b8;
	}

	.retry-button {
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: opacity 0.2s;
	}

	.retry-button:hover {
		opacity: 0.9;
	}

	/* Controls */
	.achievement-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.search-and-filters {
		display: flex;
		gap: 1rem;
		align-items: center;
		flex: 1;
		flex-wrap: wrap;
	}

	.search-input {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.5rem 1rem;
		color: white;
		font-size: 0.9rem;
		min-width: 200px;
	}

	.search-input::placeholder {
		color: #6b7280;
	}

	.category-select,
	.series-select {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.5rem;
		color: white;
		font-size: 0.9rem;
	}

	.category-select option,
	.series-select option {
		background: #1f2937;
		color: white;
	}

	.owned-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #e2e8f0;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.action-buttons {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.view-toggle {
		display: flex;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		overflow: hidden;
	}

	.view-button {
		background: transparent;
		border: none;
		color: #9ca3af;
		padding: 0.5rem 1rem;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.85rem;
	}

	.view-button.active {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
	}

	.view-button:hover:not(.active) {
		background: rgba(255, 255, 255, 0.1);
		color: #e2e8f0;
	}

	.claim-all-button,
	.refresh-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: 8px;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s;
	}

	.claim-all-button {
		background: linear-gradient(135deg, #10b981, #059669);
		color: white;
	}

	.claim-all-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.refresh-button {
		background: rgba(255, 255, 255, 0.1);
		color: #e2e8f0;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.refresh-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.2);
	}

	/* Status Messages */
	.success-message,
	.error-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.success-message {
		background: rgba(16, 185, 129, 0.1);
		color: #10b981;
		border: 1px solid rgba(16, 185, 129, 0.2);
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	/* Stats */
	.achievement-stats {
		display: flex;
		justify-content: center;
		gap: 2rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.stat {
		text-align: center;
	}

	.stat-value {
		display: block;
		font-size: 2rem;
		font-weight: 700;
		color: white;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.stat-label {
		display: block;
		font-size: 0.9rem;
		color: #94a3b8;
		margin-top: 0.25rem;
	}

	/* Series Progression Layout */
	.series-progression {
		display: flex;
		flex-direction: column;
		gap: 4rem;
	}

	.series-track {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 20px;
		padding: 2rem;
		overflow: hidden;
	}

	.series-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2.5rem;
		gap: 2rem;
	}

	.series-info {
		flex: 1;
		min-width: 0;
	}

	.series-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.series-description {
		color: #94a3b8;
		font-size: 0.95rem;
		margin: 0;
		line-height: 1.4;
	}

	.series-progress {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
		min-width: 200px;
	}

	.progress-stats {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.progress-count {
		color: white;
		font-weight: 600;
		font-size: 1.1rem;
	}

	.progress-percentage {
		color: #10b981;
		font-size: 0.85rem;
		font-weight: 500;
	}

	.progress-bar {
		width: 200px;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(135deg, #10b981, #059669);
		transition: width 0.5s ease;
	}

	/* Next Achievement Highlight */
	.next-achievement-highlight {
		background: rgba(168, 85, 247, 0.1);
		border: 1px solid rgba(168, 85, 247, 0.3);
		border-radius: 12px;
		padding: 1rem;
		margin: 1.5rem 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.next-achievement-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #a855f7;
		font-weight: 600;
		font-size: 0.9rem;
	}

	.next-achievement-progress {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex: 1;
		justify-content: flex-end;
	}

	.next-progress-text {
		color: #e2e8f0;
		font-size: 0.85rem;
		font-weight: 500;
		min-width: 80px;
		text-align: right;
	}

	.next-progress-bar {
		width: 120px;
		height: 6px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		overflow: hidden;
	}

	.next-progress-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.5s ease;
	}

	/* Achievement Progression Path */
	.achievement-path {
		position: relative;
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
		overflow-x: auto;
		overflow-y: visible;
		padding: 1rem 0 2rem 0;
		scroll-snap-type: x mandatory;
	}

	.progression-line {
		position: absolute;
		top: 70px;
		left: 70px;
		right: 70px;
		height: 3px;
		background: linear-gradient(
			to right,
			rgba(16, 185, 129, 0.3) 0%,
			rgba(16, 185, 129, 0.3) var(--progress-width, 0%),
			rgba(255, 255, 255, 0.1) var(--progress-width, 0%),
			rgba(255, 255, 255, 0.1) 100%
		);
		border-radius: 2px;
		z-index: 1;
	}

	.achievement-milestone {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 140px;
		scroll-snap-align: center;
		z-index: 2;
	}

	.milestone-connector {
		position: absolute;
		top: 68px;
		left: 50%;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		border: 3px solid rgba(255, 255, 255, 0.2);
		transform: translateX(-50%);
		transition: all 0.3s ease;
		z-index: 3;
	}

	.milestone-connector.completed {
		background: #10b981;
		border-color: #10b981;
		box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
	}

	.achievement-milestone.next-to-earn .milestone-connector {
		background: rgba(168, 85, 247, 0.3);
		border-color: #a855f7;
		animation: pulse 2s infinite;
	}

	.achievement-milestone.eligible .milestone-connector {
		background: rgba(255, 193, 7, 0.4);
		border-color: #ffc107;
		animation: eligible-pulse 2s infinite;
	}

	@keyframes eligible-pulse {
		0%, 100% {
			box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
		}
		50% {
			box-shadow: 0 0 20px rgba(255, 193, 7, 0.7);
		}
	}

	@keyframes pulse {
		0%, 100% {
			box-shadow: 0 0 8px rgba(168, 85, 247, 0.4);
		}
		50% {
			box-shadow: 0 0 20px rgba(168, 85, 247, 0.7);
		}
	}

	/* Milestone Achievement Styling */
	.milestone-achievement {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		width: 100%;
	}

	.achievement-badge {
		position: relative;
		margin-bottom: 1rem;
		transition: transform 0.3s ease;
		cursor: pointer;
	}

	.achievement-badge:hover {
		transform: scale(1.02);
	}

	/* Progress Ring Styles */
	.progress-ring {
		position: absolute;
		top: -6px;
		left: -6px;
		width: calc(100% + 12px);
		height: calc(100% + 12px);
		z-index: 5;
		pointer-events: none;
	}

	.progress-circle {
		transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;
	}

	.progress-circle.near-complete {
		animation: progress-pulse 2s infinite;
	}

	@keyframes progress-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.progress-text {
		font-size: 0.65rem;
		font-weight: 600;
		text-align: center;
		margin-bottom: 0.25rem;
		letter-spacing: 0.025em;
	}

	.achievement-milestone.owned .achievement-badge {
		filter: none;
	}

	.achievement-milestone:not(.owned) .achievement-badge {
		filter: grayscale(0.7) brightness(0.6);
	}

	.achievement-milestone.next-to-earn .achievement-badge {
		filter: none;
		animation: glow 2s ease-in-out infinite alternate;
	}

	@keyframes glow {
		from {
			filter: brightness(1) drop-shadow(0 0 8px rgba(168, 85, 247, 0.3));
		}
		to {
			filter: brightness(1.1) drop-shadow(0 0 16px rgba(168, 85, 247, 0.5));
		}
	}

	.badge-image {
		width: 80px;
		height: 80px;
		border-radius: 16px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		object-fit: cover;
		transition: all 0.3s ease;
	}

	.badge-image.locked {
		opacity: 0.4;
	}

	.achievement-milestone.owned .badge-image {
		border-color: rgba(16, 185, 129, 0.6);
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);
	}

	.badge-icon {
		width: 80px;
		height: 80px;
		border-radius: 16px;
		border: 3px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		transition: all 0.3s ease;
	}

	.badge-icon.locked {
		opacity: 0.4;
	}

	.achievement-milestone.owned .badge-icon {
		border-color: rgba(16, 185, 129, 0.6);
		background: rgba(16, 185, 129, 0.1);
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.2);
	}

	.completion-indicator {
		position: absolute;
		top: -6px;
		right: -6px;
		background: #10b981;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		border: 3px solid rgba(16, 185, 129, 0.3);
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.4);
		z-index: 10;
	}

	.tier-label {
		position: absolute;
		bottom: -10px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0, 0, 0, 0.9);
		color: white;
		border-radius: 10px;
		padding: 0.2rem 0.4rem;
		font-size: 0.7rem;
		font-weight: 700;
		border: 2px solid rgba(255, 255, 255, 0.3);
		min-width: 20px;
		text-align: center;
		backdrop-filter: blur(4px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		z-index: 20;
		transition: all 0.3s ease;
		pointer-events: none;
	}

	.achievement-milestone.owned .tier-label {
		background: rgba(16, 185, 129, 0.9);
		border-color: rgba(16, 185, 129, 0.5);
		color: white;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.3);
	}

	.achievement-milestone.next-to-earn .tier-label {
		background: rgba(168, 85, 247, 0.9);
		border-color: rgba(168, 85, 247, 0.5);
		color: white;
		box-shadow: 0 0 8px rgba(168, 85, 247, 0.4);
		animation: tier-pulse 2s infinite;
	}

	@keyframes tier-pulse {
		0%, 100% {
			box-shadow: 0 0 8px rgba(168, 85, 247, 0.4);
		}
		50% {
			box-shadow: 0 0 16px rgba(168, 85, 247, 0.7);
		}
	}

	/* Achievement Details */
	.achievement-details {
		max-width: 140px;
		width: 100%;
	}

	.milestone-name {
		color: white;
		font-size: 0.9rem;
		font-weight: 600;
		margin: 0 0 0.5rem 0;
		line-height: 1.2;
		word-wrap: break-word;
		hyphens: auto;
	}

	.achievement-milestone:not(.owned) .milestone-name {
		color: #9ca3af;
	}

	.achievement-milestone.next-to-earn .milestone-name {
		color: #a855f7;
		font-weight: 700;
	}

	.milestone-description {
		color: #6b7280;
		font-size: 0.75rem;
		line-height: 1.3;
		margin: 0 0 0.75rem 0;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
		word-wrap: break-word;
		hyphens: auto;
	}

	.achievement-milestone.owned .milestone-description {
		color: #94a3b8;
	}

	.milestone-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		justify-content: center;
	}

	.milestone-tag {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
		padding: 0.125rem 0.375rem;
		border-radius: 3px;
		font-size: 0.65rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.achievement-milestone.owned .milestone-tag {
		background: rgba(16, 185, 129, 0.2);
		color: #10b981;
	}

	.eligible-indicator {
		position: absolute;
		top: -8px;
		left: -8px;
		background: #ffc107;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #1f2937;
		border: 2px solid rgba(255, 193, 7, 0.3);
		box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
		z-index: 15;
		animation: eligible-bounce 2s infinite;
	}

	@keyframes eligible-bounce {
		0%, 100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	.claim-achievement-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		background: linear-gradient(135deg, #ffc107, #f59e0b);
		color: #1f2937;
		border: none;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: 600;
		transition: all 0.2s ease;
		margin-top: 0.5rem;
		width: 100%;
		box-shadow: 0 2px 4px rgba(255, 193, 7, 0.3);
	}

	.claim-achievement-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 8px rgba(255, 193, 7, 0.4);
	}

	.claim-achievement-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	.series-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.series-title {
		font-size: 1.5rem;
		font-weight: 600;
		color: white;
		margin: 0;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.series-progress {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.progress-text {
		color: #e2e8f0;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.progress-bar {
		width: 120px;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(135deg, #10b981, #059669);
		transition: width 0.3s ease;
	}

	.progress-percentage {
		color: #10b981;
		font-size: 0.85rem;
		font-weight: 600;
		min-width: 35px;
	}

	.series-achievements {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.achievement-tier {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		transition: all 0.3s ease;
	}

	.achievement-tier:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(168, 85, 247, 0.3);
	}

	.achievement-tier.owned {
		border-color: rgba(16, 185, 129, 0.5);
		background: rgba(16, 185, 129, 0.03);
	}

	.achievement-image {
		position: relative;
		flex-shrink: 0;
	}

	.tier-image {
		width: 80px;
		height: 80px;
		border-radius: 12px;
		transition: all 0.3s ease;
	}

	.tier-image.locked {
		opacity: 0.3;
		filter: grayscale(1);
	}

	.tier-icon {
		width: 80px;
		height: 80px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid;
	}

	.achievement-tier:not(.owned) .tier-icon {
		opacity: 0.3;
		filter: grayscale(1);
	}

	.tier-owned-indicator {
		position: absolute;
		top: -6px;
		right: -6px;
		background: #10b981;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		border: 2px solid rgba(16, 185, 129, 0.2);
	}

	.tier-number {
		position: absolute;
		bottom: -6px;
		right: -6px;
		background: rgba(168, 85, 247, 0.9);
		color: white;
		border-radius: 50%;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
		border: 2px solid rgba(168, 85, 247, 0.3);
	}

	.achievement-tier-info {
		flex: 1;
		min-width: 0;
	}

	.tier-name {
		font-size: 1.1rem;
		font-weight: 600;
		color: white;
		margin: 0 0 0.5rem 0;
	}

	.achievement-tier:not(.owned) .tier-name {
		color: #9ca3af;
	}

	.tier-description {
		font-size: 0.9rem;
		color: #94a3b8;
		line-height: 1.4;
		margin: 0 0 0.75rem 0;
	}

	.tier-tags {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.tag {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.claim-tier-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: opacity 0.2s;
		align-self: flex-start;
	}

	.claim-tier-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.claim-tier-button:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* Achievement Grid */
	.achievements-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.achievement-card {
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		transition: all 0.3s ease;
		position: relative;
	}

	.achievement-card:hover {
		border-color: rgba(168, 85, 247, 0.3);
		background: rgba(255, 255, 255, 0.08);
		transform: translateY(-2px);
	}

	.achievement-card.owned {
		border-color: rgba(16, 185, 129, 0.5);
		background: rgba(16, 185, 129, 0.05);
	}

	.achievement-visual {
		position: relative;
		margin-bottom: 1rem;
		display: flex;
		justify-content: center;
	}

	.achievement-image {
		width: 80px;
		height: 80px;
		border-radius: 12px;
		object-fit: cover;
		transition: all 0.3s ease;
	}

	.achievement-image.locked {
		opacity: 0.3;
		filter: grayscale(1);
	}

	.achievement-icon {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid;
		transition: all 0.3s ease;
	}

	.achievement-card:not(.owned) .achievement-icon {
		opacity: 0.4;
		filter: grayscale(1);
	}

	.card-tier-badge {
		position: absolute;
		top: -6px;
		right: -6px;
		background: rgba(168, 85, 247, 0.9);
		color: white;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
		font-weight: 600;
		border: 2px solid rgba(168, 85, 247, 0.3);
	}

	.owned-indicator {
		position: absolute;
		top: -4px;
		right: -4px;
		background: #10b981;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
	}

	.achievement-info {
		flex: 1;
	}

	.achievement-name {
		font-size: 1.1rem;
		font-weight: 600;
		color: white;
		margin: 0 0 0.5rem 0;
	}

	.achievement-card:not(.owned) .achievement-name {
		color: #9ca3af;
	}

	.achievement-description {
		font-size: 0.9rem;
		color: #94a3b8;
		line-height: 1.4;
		margin: 0 0 1rem 0;
	}

	.series-badge {
		display: inline-block;
		background: rgba(59, 130, 246, 0.2);
		color: #3b82f6;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		margin-bottom: 0.5rem;
	}

	.card-tags {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.card-tag {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.7rem;
		font-weight: 500;
	}

	.rarity-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		margin-bottom: 0.5rem;
	}

	.claim-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: linear-gradient(135deg, #8b5cf6, #6366f1);
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: opacity 0.2s;
		width: 100%;
		justify-content: center;
	}

	.claim-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.claim-button:hover:not(:disabled) {
		opacity: 0.9;
	}

	/* No achievements state */
	.no-achievements {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-height: 200px;
		text-align: center;
	}

	.no-achievements-text {
		color: #94a3b8;
		font-size: 1rem;
		margin: 0;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.achievements-container {
			padding: 1.5rem;
		}

		.achievement-controls {
			flex-direction: column;
			align-items: stretch;
		}

		.search-and-filters {
			justify-content: stretch;
			flex-direction: column;
		}

		.search-input {
			min-width: unset;
		}

		.action-buttons {
			justify-content: center;
		}

		.achievement-stats {
			gap: 1rem;
		}

		.stat-value {
			font-size: 1.5rem;
		}

		/* Series progression responsive */
		.series-track {
			padding: 1.5rem;
		}

		.series-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 1.5rem;
		}

		.series-title {
			font-size: 1.5rem;
		}

		.series-progress {
			width: 100%;
			align-items: stretch;
		}

		.progress-stats {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			width: 100%;
		}

		.progress-bar {
			width: 100%;
		}

		/* Next achievement highlight responsive */
		.next-achievement-highlight {
			flex-direction: column;
			align-items: stretch;
			gap: 0.75rem;
		}

		.next-achievement-progress {
			justify-content: flex-start;
			gap: 0.75rem;
		}

		.next-progress-bar {
			flex: 1;
		}

		.achievement-path {
			gap: 1rem;
			padding: 1rem 0.5rem 2rem 0.5rem;
		}

		.progression-line {
			left: 60px;
			right: 60px;
			top: 60px;
		}

		.milestone-connector {
			top: 58px;
			width: 14px;
			height: 14px;
		}

		.achievement-milestone {
			min-width: 120px;
		}

		.badge-image,
		.badge-icon {
			width: 60px;
			height: 60px;
		}

		.completion-indicator {
			width: 20px;
			height: 20px;
			top: -4px;
			right: -4px;
		}

		.tier-label {
			font-size: 0.65rem;
			padding: 0.15rem 0.3rem;
			bottom: -8px;
		}

		.achievement-details {
			max-width: 120px;
		}

		.milestone-name {
			font-size: 0.85rem;
		}

		.milestone-description {
			font-size: 0.7rem;
			-webkit-line-clamp: 2;
		}

		.milestone-tag {
			font-size: 0.6rem;
			padding: 0.1rem 0.3rem;
		}
	}

	@media (max-width: 480px) {
		.achievements-container {
			padding: 1rem;
		}

		.achievement-stats {
			flex-direction: column;
			gap: 0.5rem;
		}

		.series-track {
			padding: 1rem;
		}

		.series-title {
			font-size: 1.3rem;
		}

		.series-description {
			font-size: 0.85rem;
		}

		.achievement-path {
			gap: 0.75rem;
			padding: 0.75rem 0.25rem 1.5rem 0.25rem;
		}

		.progression-line {
			left: 45px;
			right: 45px;
			top: 45px;
		}

		.milestone-connector {
			top: 43px;
			width: 12px;
			height: 12px;
		}

		.achievement-milestone {
			min-width: 100px;
		}

		.badge-image,
		.badge-icon {
			width: 50px;
			height: 50px;
		}

		.badge-icon :global(svg) {
			width: 1.25rem;
			height: 1.25rem;
		}

		.completion-indicator {
			width: 18px;
			height: 18px;
			top: -3px;
			right: -3px;
		}

		.completion-indicator :global(svg) {
			width: 0.7rem;
			height: 0.7rem;
		}

		.tier-label {
			font-size: 0.6rem;
			padding: 0.12rem 0.25rem;
			bottom: -6px;
		}

		.achievement-details {
			max-width: 100px;
		}

		.milestone-name {
			font-size: 0.8rem;
			margin-bottom: 0.4rem;
		}

		.milestone-description {
			font-size: 0.65rem;
			margin-bottom: 0.5rem;
		}

		.milestone-tags {
			gap: 0.2rem;
		}

		.milestone-tag {
			font-size: 0.55rem;
			padding: 0.08rem 0.25rem;
		}
	}

	/* Achievement Modal */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.8);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: rgba(30, 30, 30, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		padding: 2rem;
		max-width: 500px;
		width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		position: relative;
		backdrop-filter: blur(8px);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
	}

	.modal-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #94a3b8;
		transition: all 0.2s ease;
	}

	.modal-close:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.modal-achievement {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	.modal-badge {
		position: relative;
	}

	.modal-image {
		width: 150px;
		height: 150px;
		border-radius: 20px;
		border: 3px solid rgba(255, 255, 255, 0.1);
		object-fit: cover;
	}

	.modal-image.locked {
		opacity: 0.4;
		filter: grayscale(1);
	}

	.modal-badge.owned .modal-image {
		border-color: rgba(16, 185, 129, 0.6);
		box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
	}

	.modal-icon {
		width: 150px;
		height: 150px;
		border-radius: 20px;
		border: 3px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
	}

	.modal-icon.locked {
		opacity: 0.4;
		filter: grayscale(1);
	}

	.modal-badge.owned .modal-icon {
		border-color: rgba(16, 185, 129, 0.6);
		background: rgba(16, 185, 129, 0.1);
		box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
	}

	.modal-completion-indicator {
		position: absolute;
		top: -10px;
		right: -10px;
		background: #10b981;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		border: 4px solid rgba(16, 185, 129, 0.3);
		box-shadow: 0 0 16px rgba(16, 185, 129, 0.4);
	}

	.modal-tier-label {
		position: absolute;
		bottom: -15px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(168, 85, 247, 0.9);
		color: white;
		border-radius: 12px;
		padding: 0.4rem 0.8rem;
		font-size: 0.9rem;
		font-weight: 700;
		border: 2px solid rgba(168, 85, 247, 0.3);
	}

	.modal-badge.owned .modal-tier-label {
		background: rgba(16, 185, 129, 0.9);
		border-color: rgba(16, 185, 129, 0.5);
	}

	.modal-details {
		text-align: center;
		width: 100%;
	}

	.modal-title {
		font-size: 1.75rem;
		font-weight: 700;
		color: white;
		margin: 0 0 1rem 0;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.modal-description {
		font-size: 1.1rem;
		color: #94a3b8;
		line-height: 1.6;
		margin: 0 0 1.5rem 0;
	}

	.modal-series {
		color: #3b82f6;
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}

	.modal-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.modal-tag {
		background: rgba(168, 85, 247, 0.2);
		color: #a855f7;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.8rem;
		font-weight: 500;
	}

	.modal-rarity {
		font-size: 0.9rem;
		font-weight: 600;
		text-transform: uppercase;
		margin-bottom: 1rem;
		letter-spacing: 0.5px;
	}

	.modal-status {
		padding: 1rem;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.02);
	}

	.status-completed {
		color: #10b981;
		font-weight: 600;
		font-size: 1.1rem;
	}

	.status-locked {
		color: #6b7280;
		font-weight: 600;
		font-size: 1.1rem;
	}

	.status-eligible {
		color: #ffc107;
		font-weight: 600;
		font-size: 1.1rem;
		display: block;
		margin-bottom: 1rem;
	}

	.status-progress {
		color: #10b981;
		font-weight: 600;
		font-size: 1.1rem;
		display: block;
		margin-bottom: 1rem;
	}

	.modal-progress-bar {
		width: 100%;
		height: 8px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		overflow: hidden;
	}

	.modal-progress-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.5s ease;
	}

	.modal-claim-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		background: linear-gradient(135deg, #ffc107, #f59e0b);
		color: #1f2937;
		border: none;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		transition: all 0.2s ease;
		width: 100%;
		box-shadow: 0 4px 8px rgba(255, 193, 7, 0.3);
	}

	.modal-claim-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 12px rgba(255, 193, 7, 0.4);
	}

	.modal-claim-button:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	@media (max-width: 480px) {
		.modal-content {
			padding: 1.5rem;
			margin: 1rem;
		}

		.modal-image,
		.modal-icon {
			width: 120px;
			height: 120px;
		}

		.modal-title {
			font-size: 1.5rem;
		}

		.modal-description {
			font-size: 1rem;
		}
	}
</style>