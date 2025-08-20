// Utility functions for analyzing slot machine odds and win data

import type { OddsCalculationResult, WinAnalysis, SymbolProbability } from '../services/oddsCalculator';

/**
 * Format probability as a readable percentage
 */
export function formatProbability(probability: number): string {
  if (probability < 0.0001) {
    return '<0.01%';
  }
  return `${(probability * 100).toFixed(2)}%`;
}

/**
 * Format hit frequency as "1 in X" format
 */
export function formatHitFrequency(frequency: number): string {
  if (frequency === 0 || !isFinite(frequency)) {
    return 'Never';
  }
  if (frequency < 1) {
    return `${frequency.toFixed(3)}x`;
  }
  return `1 in ${Math.round(frequency)}`;
}

/**
 * Format multiplier values with proper suffix
 */
export function formatMultiplier(multiplier: number): string {
  if (multiplier >= 1000) {
    return `${(multiplier / 1000).toFixed(1)}k×`;
  }
  return `${multiplier}×`;
}

/**
 * Calculate the house edge from RTP
 */
export function calculateHouseEdge(rtp: number): number {
  return 1 - rtp;
}

/**
 * Get risk assessment based on RTP and volatility
 */
export function getRiskAssessment(odds: OddsCalculationResult): {
  level: 'low' | 'medium' | 'high' | 'extreme';
  description: string;
  rtp: number;
  houseEdge: number;
} {
  const rtp = odds.overallRTP;
  const houseEdge = calculateHouseEdge(rtp);
  
  let level: 'low' | 'medium' | 'high' | 'extreme';
  let description: string;
  
  if (rtp >= 0.95) {
    level = 'low';
    description = 'Favorable odds with high return to player';
  } else if (rtp >= 0.90) {
    level = 'medium';
    description = 'Standard casino odds with moderate house edge';
  } else if (rtp >= 0.80) {
    level = 'high';
    description = 'High house edge, unfavorable for players';
  } else {
    level = 'extreme';
    description = 'Very high house edge, extremely unfavorable';
  }
  
  return {
    level,
    description,
    rtp: rtp * 100, // Convert to percentage
    houseEdge: houseEdge * 100 // Convert to percentage
  };
}

/**
 * Find the most profitable symbol combinations
 */
export function getMostProfitableCombinations(odds: OddsCalculationResult, limit: number = 5): Array<{
  symbol: string;
  count: number;
  expectedValue: number;
  probability: number;
  multiplier: number;
  profitRatio: number; // Expected value per unit probability
}> {
  const combinations: Array<{
    symbol: string;
    count: number;
    expectedValue: number;
    probability: number;
    multiplier: number;
    profitRatio: number;
  }> = [];
  
  for (const analysis of odds.winAnalysis) {
    for (const combo of analysis.combinations) {
      combinations.push({
        symbol: analysis.symbol,
        count: combo.count,
        expectedValue: combo.expectedValue,
        probability: combo.probability,
        multiplier: combo.multiplier,
        profitRatio: combo.probability > 0 ? combo.expectedValue / combo.probability : 0
      });
    }
  }
  
  // Sort by expected value (highest first)
  combinations.sort((a, b) => b.expectedValue - a.expectedValue);
  
  return combinations.slice(0, limit);
}

/**
 * Calculate break-even analysis for different bet amounts
 */
export function calculateBreakEvenAnalysis(odds: OddsCalculationResult): {
  breaksEven: boolean;
  expectedLossPerSpin: number;
  spinsToLose100Units: number;
  probabilityOfProfit: number;
} {
  const expectedReturn = odds.expectedValuePerSpin;
  const breaksEven = expectedReturn >= 1.0;
  const expectedLossPerSpin = Math.max(0, 1.0 - expectedReturn);
  const spinsToLose100Units = expectedLossPerSpin > 0 ? 100 / expectedLossPerSpin : Infinity;
  
  // Simplified probability of profit (would need more complex calculation for accuracy)
  const probabilityOfProfit = Math.min(expectedReturn, 0.5);
  
  return {
    breaksEven,
    expectedLossPerSpin,
    spinsToLose100Units,
    probabilityOfProfit
  };
}

/**
 * Compare two sets of odds (useful for A/B testing or changes)
 */
export function compareOdds(
  oddsA: OddsCalculationResult,
  oddsB: OddsCalculationResult
): {
  rtpDifference: number;
  hitFrequencyDifference: number;
  expectedValueDifference: number;
  betterForPlayer: 'A' | 'B' | 'equal';
} {
  const rtpDifference = oddsB.overallRTP - oddsA.overallRTP;
  const hitFrequencyDifference = oddsB.totalHitFrequency - oddsA.totalHitFrequency;
  const expectedValueDifference = oddsB.expectedValuePerSpin - oddsA.expectedValuePerSpin;
  
  let betterForPlayer: 'A' | 'B' | 'equal';
  if (Math.abs(rtpDifference) < 0.001) {
    betterForPlayer = 'equal';
  } else {
    betterForPlayer = rtpDifference > 0 ? 'B' : 'A';
  }
  
  return {
    rtpDifference,
    hitFrequencyDifference,
    expectedValueDifference,
    betterForPlayer
  };
}

/**
 * Generate a detailed text summary of the odds
 */
export function generateOddsSummary(odds: OddsCalculationResult): string {
  const riskAssessment = getRiskAssessment(odds);
  const profitableCombos = getMostProfitableCombinations(odds, 3);
  const breakEvenAnalysis = calculateBreakEvenAnalysis(odds);
  
  const summary = `
Slot Machine Odds Analysis
==========================

Overall Statistics:
- Return to Player (RTP): ${formatProbability(odds.overallRTP)}
- House Edge: ${formatProbability(calculateHouseEdge(odds.overallRTP))}
- Hit Frequency: ${formatHitFrequency(odds.totalHitFrequency)}
- Expected Value per Spin: ${odds.expectedValuePerSpin.toFixed(4)}

Risk Assessment: ${riskAssessment.level.toUpperCase()}
${riskAssessment.description}

Most Profitable Combinations:
${profitableCombos.map((combo, i) => 
  `${i + 1}. ${combo.symbol} × ${combo.count}: ${formatMultiplier(combo.multiplier)} (${formatProbability(combo.probability)} chance, ${combo.expectedValue.toFixed(4)} expected value)`
).join('\n')}

Break-Even Analysis:
- Breaks Even: ${breakEvenAnalysis.breaksEven ? 'Yes' : 'No'}
- Expected Loss per Spin: ${(breakEvenAnalysis.expectedLossPerSpin * 100).toFixed(2)}%
- Spins to Lose 100 Units: ${breakEvenAnalysis.spinsToLose100Units === Infinity ? 'Never' : Math.round(breakEvenAnalysis.spinsToLose100Units)}

Symbol Distribution:
${odds.symbolAnalysis.map(reel => 
  `Reel ${reel.reelIndex + 1}: ${reel.symbols.map(s => `${s.symbol}(${formatProbability(s.probability)})`).join(', ')}`
).join('\n')}
`.trim();
  
  return summary;
}

/**
 * Export odds data for external analysis (CSV format)
 */
export function exportOddsToCSV(odds: OddsCalculationResult): string {
  const lines: string[] = [
    'Symbol,Count,Probability,Multiplier,Expected Value'
  ];
  
  for (const analysis of odds.winAnalysis) {
    for (const combo of analysis.combinations) {
      lines.push([
        analysis.symbol,
        combo.count.toString(),
        combo.probability.toString(),
        combo.multiplier.toString(),
        combo.expectedValue.toString()
      ].join(','));
    }
  }
  
  return lines.join('\n');
}

/**
 * Validate odds calculation results for sanity checks
 */
export function validateOdds(odds: OddsCalculationResult): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  
  // Check RTP is reasonable
  if (odds.overallRTP > 1.0) {
    errors.push('RTP exceeds 100% - this would be impossible for a casino');
  } else if (odds.overallRTP > 0.99) {
    warnings.push('RTP is very high (>99%) - unusual for slot machines');
  } else if (odds.overallRTP < 0.5) {
    warnings.push('RTP is very low (<50%) - may indicate calculation error');
  }
  
  // Check hit frequency
  if (odds.totalHitFrequency < 1) {
    warnings.push('Hit frequency less than 1 in 1 - every spin would be a win');
  } else if (odds.totalHitFrequency > 1000) {
    warnings.push('Hit frequency very low - wins are extremely rare');
  }
  
  // Check expected values
  for (const analysis of odds.winAnalysis) {
    for (const combo of analysis.combinations) {
      if (combo.probability > 1.0) {
        errors.push(`Probability exceeds 100% for ${analysis.symbol} x${combo.count}`);
      }
      if (combo.expectedValue < 0) {
        errors.push(`Negative expected value for ${analysis.symbol} x${combo.count}`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}