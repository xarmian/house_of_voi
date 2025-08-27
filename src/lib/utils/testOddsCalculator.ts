// Test the odds calculator with real contract data

import { oddsCalculator } from '../services/oddsCalculator';
import { generateOddsSummary, validateOdds } from './oddsAnalysis';
import { contractDataCache } from '../services/contractDataCache';
import type { CachedReelData, CachedMultiplier } from '../services/contractDataCache';

/**
 * Test the odds calculator with real contract data
 * @param address - Wallet address to use for contract calls (optional, uses default if not provided)
 */
export async function testOddsCalculator(address?: string): Promise<void> {
  // Use a default test address if none provided
  const testAddress = address || 'H7W63MIQJMYBOEYPM5NJEGX3P54H54RZIV2G3OQ2255AULG6U74BE5KFC4';
  
  console.log('🧪 Testing Odds Calculator with real contract data...');
  console.log(`📍 Using address: ${testAddress}`);
  
  try {
    console.log('🔄 Fetching real contract data and calculating odds...');
    
    // Use the contractDataCache method which fetches all data and calculates odds
    const startTime = Date.now();
    const odds = await contractDataCache.getWinOdds(testAddress);
    const calculationTime = Date.now() - startTime;
    
    if (!odds) {
      throw new Error('Failed to calculate odds - received null result');
    }
    
    // Get individual data for reporting (optional, for display purposes)
    const [paylines, reelData] = await Promise.all([
      contractDataCache.getPaylines(testAddress),
      contractDataCache.getReelData(testAddress)
    ]);
    
    console.log('✅ Contract data fetched and odds calculated successfully!');
    console.log('📊 Input Data Summary:');
    console.log(`- Paylines: ${paylines.length}`);
    console.log(`- Reel Length: ${reelData.reelLength} per reel`);
    console.log(`- Reel Count: ${reelData.reelCount} reels`);
    console.log(`- Total Reel Data: ${reelData.reelData.length} characters`);
    console.log(`- Symbol combinations calculated: ${odds.winAnalysis.reduce((sum, analysis) => sum + analysis.combinations.length, 0)}`);
    
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
    
    for (const scenario of betScenarios) {
      const betOdds = await contractDataCache.calculateBetOdds(testAddress, scenario.betPerLine, scenario.selectedPaylines);
      const totalBet = scenario.betPerLine * scenario.selectedPaylines;
      console.log(`\n${scenario.description}:`);
      console.log(`  Total Bet: ${(totalBet / 1000000).toFixed(1)} VOI`);
      console.log(`  Expected Return: ${(betOdds.expectedReturn / 1000000).toFixed(3)} VOI`);
      console.log(`  Expected Loss: ${(betOdds.expectedLoss / 1000000).toFixed(3)} VOI`);
      console.log(`  Return Rate: ${((betOdds.expectedReturn / totalBet) * 100).toFixed(2)}%`);
    }
    
    console.log('\n✅ Odds calculation test completed successfully!');
    console.log('📝 Note: All data was fetched from the live blockchain contract');
    
    return odds;
    
  } catch (error) {
    console.error('❌ Error during odds calculation test:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('contract')) {
        console.error('🔗 This appears to be a contract connectivity issue.');
        console.error('💡 Make sure you have a valid network connection and the contract is deployed.');
      } else if (error.message.includes('CORS')) {
        console.error('🌐 This appears to be a CORS issue.');
        console.error('💡 Try running this from the deployed application or check your network configuration.');
      }
    }
    
    throw error;
  }
}

/**
 * Generate a detailed text report using real contract data
 * @param address - Wallet address to use for contract calls (optional, uses default if not provided)
 */
export async function generateDetailedReport(address?: string): Promise<string> {
  // Use a default test address if none provided
  const testAddress = address || 'H7W63MIQJMYBOEYPM5NJEGX3P54H54RZIV2G3OQ2255AULG6U74BE5KFC4';
  
  try {
    console.log('🔄 Fetching contract data for report generation...');
    
    // Use the contractDataCache method which fetches all data and calculates odds
    const odds = await contractDataCache.getWinOdds(testAddress);
    
    if (!odds) {
      throw new Error('Failed to calculate odds for report generation');
    }
    
    const validation = validateOdds(odds);
    
    // Get individual data for reporting details
    const [paylines, reelData] = await Promise.all([
      contractDataCache.getPaylines(testAddress),
      contractDataCache.getReelData(testAddress)
    ]);
  
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
Contract Address Used: ${testAddress}

This report was generated using actual blockchain contract data fetched in real-time.
  `.trim();
  
    return report;
    
  } catch (error) {
    console.error('❌ Error generating detailed report:', error);
    
    const errorReport = `
SLOT MACHINE ODDS ANALYSIS REPORT - ERROR
=========================================
Generated: ${new Date().toISOString()}

ERROR: Failed to generate report due to contract data fetching issues.

${error instanceof Error ? error.message : 'Unknown error occurred'}

Please ensure:
- Network connectivity is available
- Contract is properly deployed
- Address is valid: ${testAddress}

This report was attempted using real-time blockchain contract data.
    `.trim();
    
    return errorReport;
  }
}

// Export test functions for console access
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).testOdds = testOddsCalculator;
  (window as any).generateOddsReport = generateDetailedReport;
  
  // Add helper function for easy testing
  (window as any).testOddsWithDefaultAddress = () => testOddsCalculator();
  (window as any).generateReportWithDefaultAddress = () => generateDetailedReport();
  
  console.log('🧪 Odds Calculator Test Functions Available:');
  console.log('  testOdds(address?) - Test odds calculator with real contract data');
  console.log('  generateOddsReport(address?) - Generate detailed report with real contract data');
  console.log('  testOddsWithDefaultAddress() - Test with default address (no params needed)');
  console.log('  generateReportWithDefaultAddress() - Generate report with default address');
  console.log('💡 All functions now use real blockchain contract data!');
}