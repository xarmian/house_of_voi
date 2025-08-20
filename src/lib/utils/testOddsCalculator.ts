// Test the odds calculator with the provided data

import { oddsCalculator } from '../services/oddsCalculator';
import { generateOddsSummary, validateOdds } from './oddsAnalysis';
import type { CachedReelData, CachedMultiplier } from '../services/contractDataCache';

// Test data from your provided JSON
const testData = {
  paylines: [[0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,0,0],[2,2,1,2,2],[1,0,1,2,1],[1,2,1,0,1],[0,1,1,1,2],[2,1,1,1,0],[0,1,2,2,2],[2,1,0,0,0],[1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0],[2,0,2,0,2],[1,2,2,2,1],[1,0,0,0,1],[0,1,0,1,2]],
  
  multipliers: {
    "A_3": { data: 50, timestamp: 1755614247157, symbol: "A", count: 3 },
    "A_4": { data: 200, timestamp: 1755614247163, symbol: "A", count: 4 },
    "A_5": { data: 1000, timestamp: 1755614247165, symbol: "A", count: 5 },
    "C_5": { data: 200, timestamp: 1755614247171, symbol: "C", count: 5 },
    "B_3": { data: 20, timestamp: 1755614247177, symbol: "B", count: 3 },
    "D_4": { data: 20, timestamp: 1755614247178, symbol: "D", count: 4 },
    "D_5": { data: 100, timestamp: 1755614247178, symbol: "D", count: 5 },
    "C_4": { data: 50, timestamp: 1755614247178, symbol: "C", count: 4 },
    "B_5": { data: 500, timestamp: 1755614247179, symbol: "B", count: 5 },
    "B_4": { data: 100, timestamp: 1755614247179, symbol: "B", count: 4 },
    "D_3": { data: 5, timestamp: 1755614247182, symbol: "D", count: 3 },
    "C_3": { data: 10, timestamp: 1755614247207, symbol: "C", count: 3 }
  },
  
  reelData: {
    reelData: "DDD_C___CD_C__C_C__CBDDBC______DD_____D_D_A_DDC_CCDC_D_____BD_DC_C________C__C_C_____B_D_C______C_D__D_D_D___C_____DBC_C_B__D_B_____CAD______D___CDC_CCD__D____CD__C_CCDC___C_C_______C_DBD_D__DC___CD_D_CC_DBD__DC_C___DD_BDD___CA__D___CC_DC__DCD__CCC_C_____DC_B_CD__C________D___DB____C_DC_D____D________DCDBCD_DDD___CC____C__C__CCD_C__C_CBDB__C_DC___C__DD_D________D____CAB____D_C__DDD___C_____C_D________DCDCD_D_BBDDC_____CC__D__D__D_______B_CC___D_CD___BCDC__A_______DCD_C__C__D_____D__D___C_C_CDCC_",
    reelLength: 100,
    reelCount: 5,
    windowLength: 3,
    timestamp: 1755616776420
  }
};

/**
 * Test the odds calculator with the provided data
 */
export function testOddsCalculator(): void {
  console.log('🧪 Testing Odds Calculator with provided data...');
  
  try {
    // Convert test data to proper format
    const reelData: CachedReelData = testData.reelData;
    const multipliers: { [key: string]: CachedMultiplier } = testData.multipliers;
    const paylines: number[][] = testData.paylines;
    
    console.log('📊 Input Data Summary:');
    console.log(`- Paylines: ${paylines.length}`);
    console.log(`- Reel Length: ${reelData.reelLength} per reel`);
    console.log(`- Total Reel Data: ${reelData.reelData.length} characters`);
    console.log(`- Multipliers: ${Object.keys(multipliers).length} combinations`);
    
    // Calculate odds
    const startTime = Date.now();
    const odds = oddsCalculator.calculateOdds(reelData, multipliers, paylines);
    const calculationTime = Date.now() - startTime;
    
    console.log(`⏱️ Calculation completed in ${calculationTime}ms`);
    
    // Validate results
    const validation = validateOdds(odds);
    if (!validation.isValid) {
      console.error('❌ Validation failed:', validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.warn('⚠️ Validation warnings:', validation.warnings);
    }
    
    // Display summary
    console.log('\n📈 ODDS CALCULATION RESULTS:');
    console.log('=' .repeat(50));
    
    const summary = oddsCalculator.getOddsSummary(odds);
    console.log(`RTP: ${summary.rtpPercentage}`);
    console.log(`Hit Frequency: ${summary.hitFrequency}`);
    console.log(`Most Likely Win: ${summary.mostLikelyWin}`);
    console.log(`Best Payout: ${summary.bestPayout}`);
    
    // Detailed analysis
    console.log('\n🔬 DETAILED ANALYSIS:');
    console.log('=' .repeat(50));
    
    // Symbol distribution
    console.log('\nSymbol Distribution:');
    odds.symbolAnalysis.forEach(reel => {
      console.log(`Reel ${reel.reelIndex + 1}:`);
      reel.symbols.forEach(symbol => {
        console.log(`  ${symbol.symbol}: ${symbol.count}/${reel.totalPositions} (${(symbol.probability * 100).toFixed(2)}%)`);
      });
    });
    
    // Win analysis
    console.log('\nWin Analysis:');
    odds.winAnalysis.forEach(analysis => {
      console.log(`\n${analysis.symbol} Symbol:`);
      console.log(`  Total Expected Value: ${analysis.totalExpectedValue.toFixed(6)}`);
      console.log(`  Hit Frequency: 1 in ${analysis.hitFrequency.toFixed(1)}`);
      
      analysis.combinations.forEach(combo => {
        console.log(`  ${combo.count}-of-a-kind: ${(combo.probability * 100).toFixed(4)}% chance, ${combo.multiplier}x multiplier, ${combo.expectedValue.toFixed(6)} expected value`);
      });
    });
    
    // Overall metrics
    console.log('\n📊 OVERALL METRICS:');
    console.log('=' .repeat(50));
    console.log(`Expected Value per Spin: ${odds.expectedValuePerSpin.toFixed(6)}`);
    console.log(`House Edge: ${((1 - odds.overallRTP) * 100).toFixed(2)}%`);
    console.log(`Total Hit Frequency: 1 in ${odds.totalHitFrequency.toFixed(1)} spins`);
    
    // Test with different bet scenarios
    console.log('\n💰 BET SCENARIO ANALYSIS:');
    console.log('=' .repeat(50));
    
    const betScenarios = [
      { betPerLine: 1000000, selectedPaylines: 1, description: '1 VOI per line, 1 payline' },
      { betPerLine: 1000000, selectedPaylines: 5, description: '1 VOI per line, 5 paylines' },
      { betPerLine: 1000000, selectedPaylines: 20, description: '1 VOI per line, all paylines' },
      { betPerLine: 5000000, selectedPaylines: 20, description: '5 VOI per line, all paylines' }
    ];
    
    betScenarios.forEach(scenario => {
      const betOdds = oddsCalculator.calculateBetOdds(odds, scenario.betPerLine, scenario.selectedPaylines);
      const totalBet = scenario.betPerLine * scenario.selectedPaylines;
      console.log(`\n${scenario.description}:`);
      console.log(`  Total Bet: ${(totalBet / 1000000).toFixed(1)} VOI`);
      console.log(`  Expected Return: ${(betOdds.expectedReturn / 1000000).toFixed(3)} VOI`);
      console.log(`  Expected Loss: ${(betOdds.expectedLoss / 1000000).toFixed(3)} VOI`);
      console.log(`  Return Rate: ${((betOdds.expectedReturn / totalBet) * 100).toFixed(2)}%`);
    });
    
    console.log('\n✅ Odds calculation test completed successfully!');
    
    return odds;
    
  } catch (error) {
    console.error('❌ Error during odds calculation test:', error);
    throw error;
  }
}

/**
 * Generate a detailed text report
 */
export function generateDetailedReport(): string {
  const reelData: CachedReelData = testData.reelData;
  const multipliers: { [key: string]: CachedMultiplier } = testData.multipliers;
  const paylines: number[][] = testData.paylines;
  
  const odds = oddsCalculator.calculateOdds(reelData, multipliers, paylines);
  const validation = validateOdds(odds);
  
  const report = `
SLOT MACHINE ODDS ANALYSIS REPORT
==================================
Generated: ${new Date().toISOString()}

${generateOddsSummary(odds)}

VALIDATION RESULTS:
${validation.isValid ? '✅ Validation passed' : '❌ Validation failed'}
${validation.errors.length > 0 ? `Errors: ${validation.errors.join(', ')}` : ''}
${validation.warnings.length > 0 ? `Warnings: ${validation.warnings.join(', ')}` : ''}

RAW DATA ANALYSIS:
Reel Data Length: ${reelData.reelData.length} characters
Unique Symbols: ${[...new Set(reelData.reelData)].join(', ')}
Symbol Counts:
${[...new Set(reelData.reelData)].map(symbol => 
  `  ${symbol}: ${(reelData.reelData.match(new RegExp(symbol, 'g')) || []).length}`
).join('\n')}

CALCULATION METADATA:
Paylines Analyzed: ${paylines.length}
Symbol Combinations: ${odds.winAnalysis.reduce((sum, analysis) => sum + analysis.combinations.length, 0)}
Calculation Timestamp: ${odds.calculatedAt}

This report was generated using actual blockchain contract data.
  `.trim();
  
  return report;
}

// Export test function for console access
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testOdds = testOddsCalculator;
  (window as any).generateOddsReport = generateDetailedReport;
}