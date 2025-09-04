<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { timeStats, hovStatsStore } from '$lib/stores/hovStats';
  import { formatVOI } from '$lib/constants/betting';
  import { 
    Chart, 
    CategoryScale, 
    LinearScale, 
    PointElement, 
    LineElement, 
    BarElement,
    LineController,
    BarController,
    Title, 
    Tooltip, 
    Legend,
    Filler
  } from 'chart.js';
  import { TrendingUp, Users, Coins, BarChart3, RefreshCw } from 'lucide-svelte';

  // Register Chart.js components
  Chart.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    LineController,
    BarController,
    Title,
    Tooltip,
    Legend,
    Filler
  );

  let spinsChartCanvas: HTMLCanvasElement;
  let volumeChartCanvas: HTMLCanvasElement;
  let winRateChartCanvas: HTMLCanvasElement;
  let playersChartCanvas: HTMLCanvasElement;
  
  let spinsChart: Chart | null = null;
  let volumeChart: Chart | null = null;
  let winRateChart: Chart | null = null;
  let playersChart: Chart | null = null;

  let activeTab: 'spins' | 'volume' | 'winrate' | 'players' = 'spins';
  let isRefreshing = false;
  let chartsInitialized = false;

  // Chart colors matching the theme
  const colors = {
    primary: '#10b981', // voi-400
    secondary: '#60a5fa', // blue-400
    tertiary: '#a78bfa', // purple-400
    quaternary: '#fbbf24', // yellow-400
    background: 'rgba(16, 185, 129, 0.1)',
    grid: '#475569', // slate-600
    text: '#f8fafc' // slate-50
  };

  // Watch for data changes and update charts
  $: {
    if ($timeStats.data && !$timeStats.loading && !$timeStats.error && $timeStats.data.length > 0) {
      // Wait for next tick to ensure DOM is ready
      tick().then(() => {
        updateCharts();
      });
    }
  }

  onMount(async () => {
    // Give the canvas elements time to render
    await tick();
    
    // Check if we already have data
    if ($timeStats.data && $timeStats.data.length > 0) {
      updateCharts();
    } else {
      // If no data, try to refresh it
      await refreshData();
    }
  });

  onDestroy(() => {
    destroyCharts();
  });

  async function refreshData() {
    if (isRefreshing) return;
    
    isRefreshing = true;
    try {
      await hovStatsStore.refreshTimeStats('day', 30);
    } finally {
      isRefreshing = false;
    }
  }

  function destroyCharts() {
    if (spinsChart) {
      spinsChart.destroy();
      spinsChart = null;
    }
    if (volumeChart) {
      volumeChart.destroy();
      volumeChart = null;
    }
    if (winRateChart) {
      winRateChart.destroy();
      winRateChart = null;
    }
    if (playersChart) {
      playersChart.destroy();
      playersChart = null;
    }
  }

  function updateCharts() {
    if (!$timeStats.data || $timeStats.data.length === 0) {
      console.log('No timeStats data available for charts');
      return;
    }

    // Wait for canvas elements to be available
    if (!spinsChartCanvas || !volumeChartCanvas || !winRateChartCanvas || !playersChartCanvas) {
      console.log('Canvas elements not yet available');
      return;
    }

    console.log('Updating charts with', $timeStats.data.length, 'data points');

    // Sort data by time_period to ensure chronological order
    const sortedData = [...$timeStats.data].sort((a, b) => 
      new Date(a.time_period).getTime() - new Date(b.time_period).getTime()
    );

    const labels = sortedData.map(item => 
      new Date(item.time_period).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    );

    // Destroy existing charts before creating new ones
    destroyCharts();
    
    chartsInitialized = true;

    // Create Spins Chart
    if (spinsChartCanvas) {
      spinsChart = new Chart(spinsChartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Daily Spins',
            data: sortedData.map(item => Number(item.total_bets)),
            borderColor: colors.primary,
            backgroundColor: colors.background,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: colors.text,
              bodyColor: colors.text,
              borderColor: colors.primary,
              borderWidth: 2,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const date = new Date(sortedData[context[0].dataIndex].time_period);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  });
                },
                label: (context) => {
                  const dataPoint = sortedData[context.dataIndex];
                  return [
                    `Spins: ${Number(context.parsed.y).toLocaleString()}`,
                    `Volume: ${formatVOI(Number(dataPoint.total_amount_bet))} VOI`,
                    `Players: ${Number(dataPoint.unique_players).toLocaleString()}`,
                    `Win Rate: ${Number(dataPoint.win_rate).toFixed(1)}%`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                maxTicksLimit: 7
              }
            },
            y: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                callback: function(value) {
                  return Number(value).toLocaleString();
                }
              }
            }
          }
        }
      });
    }

    // Create Volume Chart
    if (volumeChartCanvas) {
      volumeChart = new Chart(volumeChartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Daily Volume (VOI)',
            data: sortedData.map(item => Number(item.total_amount_bet) / 1_000_000),
            borderColor: colors.secondary,
            backgroundColor: 'rgba(96, 165, 250, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: colors.text,
              bodyColor: colors.text,
              borderColor: colors.secondary,
              borderWidth: 2,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const date = new Date(sortedData[context[0].dataIndex].time_period);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  });
                },
                label: (context) => {
                  const dataPoint = sortedData[context.dataIndex];
                  const volume = context.parsed.y * 1_000_000;
                  return [
                    `Volume: ${formatVOI(volume)} VOI`,
                    `Spins: ${Number(dataPoint.total_bets).toLocaleString()}`,
                    `Avg Bet: ${formatVOI(volume / Number(dataPoint.total_bets))} VOI`,
                    `Win Rate: ${Number(dataPoint.win_rate).toFixed(1)}%`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                maxTicksLimit: 7
              }
            },
            y: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                callback: function(value) {
                  return formatVOI(Number(value) * 1_000_000) + ' VOI';
                }
              }
            }
          }
        }
      });
    }

    // Create Win Rate Chart
    if (winRateChartCanvas) {
      winRateChart = new Chart(winRateChartCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Win Rate (%)',
            data: sortedData.map(item => Number(item.win_rate)),
            borderColor: colors.tertiary,
            backgroundColor: 'rgba(167, 139, 250, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: colors.text,
              bodyColor: colors.text,
              borderColor: colors.tertiary,
              borderWidth: 2,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const date = new Date(sortedData[context[0].dataIndex].time_period);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  });
                },
                label: (context) => {
                  const dataPoint = sortedData[context.dataIndex];
                  return [
                    `Win Rate: ${context.parsed.y.toFixed(1)}%`,
                    `House Edge: ${Number(dataPoint.house_edge).toFixed(1)}%`,
                    `Total Spins: ${Number(dataPoint.total_bets).toLocaleString()}`,
                    `Volume: ${formatVOI(Number(dataPoint.total_amount_bet))} VOI`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                maxTicksLimit: 7
              }
            },
            y: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                callback: function(value) {
                  return Number(value).toFixed(1) + '%';
                }
              },
              suggestedMin: 0,
              suggestedMax: 100
            }
          }
        }
      });
    }

    // Create Players Chart
    if (playersChartCanvas) {
      playersChart = new Chart(playersChartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Active Players',
            data: sortedData.map(item => Number(item.unique_players)),
            backgroundColor: colors.quaternary,
            borderColor: colors.quaternary,
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: colors.text,
              bodyColor: colors.text,
              borderColor: colors.quaternary,
              borderWidth: 2,
              cornerRadius: 8,
              displayColors: false,
              callbacks: {
                title: (context) => {
                  const date = new Date(sortedData[context[0].dataIndex].time_period);
                  return date.toLocaleDateString('en-US', { 
                    weekday: 'long',
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  });
                },
                label: (context) => {
                  const dataPoint = sortedData[context.dataIndex];
                  const avgSpinsPerPlayer = Number(dataPoint.total_bets) / Number(dataPoint.unique_players);
                  return [
                    `Active Players: ${Number(context.parsed.y).toLocaleString()}`,
                    `Total Spins: ${Number(dataPoint.total_bets).toLocaleString()}`,
                    `Avg Spins/Player: ${avgSpinsPerPlayer.toFixed(1)}`,
                    `Volume: ${formatVOI(Number(dataPoint.total_amount_bet))} VOI`
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                maxTicksLimit: 7
              }
            },
            y: {
              grid: {
                color: colors.grid,
                drawBorder: false
              },
              ticks: {
                color: colors.text,
                callback: function(value) {
                  return Number(value).toLocaleString();
                }
              }
            }
          }
        }
      });
    }
  }
</script>

<div class="card p-4 sm:p-6">
  <div class="flex items-center justify-between mb-4 sm:mb-6">
    <div class="flex items-center gap-2">
      <BarChart3 class="w-5 h-5 text-voi-400" />
      <h2 class="text-xl sm:text-2xl font-bold text-theme">Platform Trends</h2>
    </div>
    <button 
      class="btn-refresh" 
      on:click={refreshData} 
      disabled={isRefreshing || $timeStats.loading}
      title="Refresh chart data"
    >
      <RefreshCw class="w-4 h-4 {isRefreshing || $timeStats.loading ? 'animate-spin' : ''}" />
    </button>
  </div>

  <!-- Loading State -->
  {#if $timeStats.loading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-voi-400"></div>
    </div>
  {:else if $timeStats.error}
    <!-- Error State -->
    <div class="text-red-400 text-center py-12">
      Failed to load chart data: {$timeStats.error}
    </div>
  {:else if !$timeStats.available}
    <!-- Service Unavailable State -->
    <div class="text-amber-400 text-center py-12">
      <BarChart3 class="w-12 h-12 mx-auto mb-4 text-amber-600" />
      <p class="mb-2">Chart data service unavailable</p>
      <p class="text-sm text-slate-400">Using fallback data for platform statistics</p>
    </div>
  {:else if $timeStats.data && $timeStats.data.length > 0}
    <!-- Tab Navigation -->
    <div class="flex flex-wrap gap-2 mb-4 sm:mb-6">
      <button 
        class="chart-tab-button {activeTab === 'spins' ? 'active' : ''}" 
        on:click={() => activeTab = 'spins'}
      >
        <TrendingUp class="w-4 h-4" />
        <span class="hidden sm:inline">Daily Spins</span>
        <span class="sm:hidden">Spins</span>
      </button>
      <button 
        class="chart-tab-button {activeTab === 'volume' ? 'active' : ''}" 
        on:click={() => activeTab = 'volume'}
      >
        <Coins class="w-4 h-4" />
        <span class="hidden sm:inline">Volume</span>
        <span class="sm:hidden">Volume</span>
      </button>
      <button 
        class="chart-tab-button {activeTab === 'winrate' ? 'active' : ''}" 
        on:click={() => activeTab = 'winrate'}
      >
        <BarChart3 class="w-4 h-4" />
        <span class="hidden sm:inline">Win Rate</span>
        <span class="sm:hidden">Win Rate</span>
      </button>
      <button 
        class="chart-tab-button {activeTab === 'players' ? 'active' : ''}" 
        on:click={() => activeTab = 'players'}
      >
        <Users class="w-4 h-4" />
        <span class="hidden sm:inline">Players</span>
        <span class="sm:hidden">Players</span>
      </button>
    </div>

    <!-- Chart Content -->
    <div class="chart-container">
      <!-- Spins Chart -->
      <div class:hidden={activeTab !== 'spins'} class="chart-wrapper">
        <canvas bind:this={spinsChartCanvas} class="chart-canvas"></canvas>
      </div>

      <!-- Volume Chart -->
      <div class:hidden={activeTab !== 'volume'} class="chart-wrapper">
        <canvas bind:this={volumeChartCanvas} class="chart-canvas"></canvas>
      </div>

      <!-- Win Rate Chart -->
      <div class:hidden={activeTab !== 'winrate'} class="chart-wrapper">
        <canvas bind:this={winRateChartCanvas} class="chart-canvas"></canvas>
      </div>

      <!-- Players Chart -->
      <div class:hidden={activeTab !== 'players'} class="chart-wrapper">
        <canvas bind:this={playersChartCanvas} class="chart-canvas"></canvas>
      </div>
    </div>
  {:else}
    <!-- No Data State -->
    <div class="text-slate-400 text-center py-12">
      <BarChart3 class="w-12 h-12 mx-auto mb-4 text-slate-600" />
      <p>No chart data available</p>
    </div>
  {/if}
</div>

<style>
  .text-voi-400 {
    color: #10b981;
  }

  .card {
    @apply bg-slate-800 rounded-xl shadow-lg border border-slate-700;
  }

  .chart-tab-button {
    @apply flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 rounded-lg transition-all duration-200 min-h-[44px];
    background: transparent;
    border: 1px solid transparent;
  }

  .chart-tab-button:hover {
    @apply text-slate-200 bg-slate-700/30;
  }

  .chart-tab-button.active {
    @apply text-voi-400 bg-slate-700/20;
    border-color: #10b981;
  }

  .btn-refresh {
    @apply bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-slate-100 p-2 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed;
  }

  .chart-container {
    min-height: 300px;
    position: relative;
  }

  .chart-wrapper {
    position: relative;
    width: 100%;
    height: 300px;
  }

  .chart-canvas {
    width: 100% !important;
    height: 100% !important;
  }

  @media (min-width: 640px) {
    .chart-container {
      min-height: 400px;
    }

    .chart-wrapper {
      height: 400px;
    }
  }
</style>