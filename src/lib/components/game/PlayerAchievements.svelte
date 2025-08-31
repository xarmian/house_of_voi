<script lang="ts">
	import { Award, Star, Lock, Trophy, Target } from 'lucide-svelte';

	export let playerAddress: string;
</script>

<div class="achievements-container">
	<div class="coming-soon-section">
		<div class="achievement-icon-grid">
			<div class="achievement-icon locked">
				<Trophy class="w-8 h-8" />
			</div>
			<div class="achievement-icon locked">
				<Award class="w-8 h-8" />
			</div>
			<div class="achievement-icon locked">
				<Star class="w-8 h-8" />
			</div>
			<div class="achievement-icon locked">
				<Target class="w-8 h-8" />
			</div>
		</div>

		<div class="coming-soon-content">
			<Lock class="w-16 h-16 coming-soon-icon" />
			<h2 class="coming-soon-title">Achievements Coming Soon</h2>
			<p class="coming-soon-description">
				Track your gaming milestones and unlock special rewards as you play. 
				Achievements will showcase your biggest wins, longest streaks, and gaming prowess.
			</p>
			
			<div class="preview-achievements hidden">
				<h3 class="preview-title">Coming Features:</h3>
				<ul class="preview-list">
					<li class="preview-item">
						<Trophy class="w-4 h-4 text-yellow-400" />
						Big Winner - Win over 1,000 VOI in a single spin
					</li>
					<li class="preview-item">
						<Target class="w-4 h-4 text-blue-400" />
						Lucky Streak - Win 5 spins in a row
					</li>
					<li class="preview-item">
						<Star class="w-4 h-4 text-purple-400" />
						High Roller - Place a bet of 100+ VOI
					</li>
					<li class="preview-item">
						<Award class="w-4 h-4 text-green-400" />
						Veteran Player - Play for 30 consecutive days
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.achievements-container {
		padding: 2rem;
		min-height: 400px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.coming-soon-section {
		text-align: center;
		max-width: 600px;
		width: 100%;
	}

	.achievement-icon-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1rem;
		margin-bottom: 2rem;
		max-width: 300px;
		margin-left: auto;
		margin-right: auto;
	}

	.achievement-icon {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		transition: all 0.3s ease;
	}

	.achievement-icon.locked {
		opacity: 0.3;
		color: #6b7280;
	}

	.coming-soon-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.coming-soon-icon {
		color: #6b7280;
		opacity: 0.7;
	}

	.coming-soon-title {
		font-size: 2rem;
		font-weight: 700;
		color: white;
		margin: 0;
		background: linear-gradient(135deg, #a855f7, #3b82f6);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.coming-soon-description {
		font-size: 1.1rem;
		color: #94a3b8;
		line-height: 1.6;
		margin: 0;
		text-align: center;
	}

	.preview-achievements {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 1.5rem;
		width: 100%;
		max-width: 500px;
	}

	.preview-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: white;
		margin: 0 0 1rem 0;
		text-align: left;
	}

	.preview-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		color: #e2e8f0;
		font-size: 0.95rem;
		text-align: left;
	}

	/* Responsive design */
	@media (max-width: 768px) {
		.achievements-container {
			padding: 1.5rem;
		}

		.achievement-icon-grid {
			grid-template-columns: repeat(2, 1fr);
			gap: 0.75rem;
			max-width: 200px;
		}

		.achievement-icon {
			width: 50px;
			height: 50px;
		}

		.achievement-icon :global(svg) {
			width: 1.5rem;
			height: 1.5rem;
		}

		.coming-soon-title {
			font-size: 1.75rem;
		}

		.coming-soon-description {
			font-size: 1rem;
		}

		.preview-achievements {
			padding: 1rem;
		}
	}

	@media (max-width: 480px) {
		.achievements-container {
			padding: 1rem;
		}

		.coming-soon-title {
			font-size: 1.5rem;
		}

		.coming-soon-description {
			font-size: 0.9rem;
		}

		.preview-item {
			font-size: 0.85rem;
		}
	}
</style>