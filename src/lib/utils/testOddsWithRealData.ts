// Test the odds calculator with the real data provided by the user

import { testOddsCalculator, generateDetailedReport } from './testOddsCalculator';

/**
 * Run the odds calculator test and display results
 */
export function runOddsTest(): void {
  console.log('🎰 Testing Slot Machine Odds Calculator');
  console.log('=' .repeat(60));
  
  try {
    // Run the main test
    const result = testOddsCalculator();
    
    console.log('\n📊 SUMMARY OF CALCULATED ODDS:');
    console.log('=' .repeat(60));
    console.log('Based on your actual slot machine data:');
    console.log(`- Reel Data: 500 characters (5 reels × 100 positions)`);
    console.log(`- Paylines: 20 active paylines`);
    console.log(`- Symbols: A (Diamond), B (Gold), C (Silver), D (Bronze)`);
    console.log(`- Multipliers: 3-of-kind to 5-of-kind combinations`);
    
    console.log('\n✅ Test completed successfully!');
    console.log('Check the console output above for detailed results.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

/**
 * Export a detailed report to download
 */
export function exportDetailedAnalysis(): string {
  try {
    return generateDetailedReport();
  } catch (error) {
    console.error('Failed to generate report:', error);
    return `Error generating report: ${error}`;
  }
}

// Auto-run test if in development environment
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('🧪 Odds Calculator Test Available');
  console.log('Run in console: window.runOddsTest()');
  console.log('Generate report: window.exportOddsReport()');
  
  (window as any).runOddsTest = runOddsTest;
  (window as any).exportOddsReport = exportDetailedAnalysis;
}