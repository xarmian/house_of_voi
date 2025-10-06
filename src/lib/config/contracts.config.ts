import type { MultiContractConfig } from '$lib/types/multiContract';

export const CONTRACTS_CONFIG: MultiContractConfig = {
  contracts: [
    {
      id: 'alpha-1',
      name: 'Original Alpha Slots',
      description: 'The original alpha slot machine',
      slotMachineAppId: 40879920,
      ybtAppId: 40879921,
      status: 'active',
      theme: 'default',
      displayOrder: 0,
      metadata: {
        version: '1.0.0',
        deployedAt: 1704067200000, // 2025-08-28
        owner: '',
        minBet: 1000000, // 1 VOI
        maxBet: 100000000, // 100 VOI
        maxPaylines: 20,
        houseEdge: 5.0,
        symbols: ['A', 'B', 'C', 'D', '_'],
        reelData: "_CCC__BD___D_____D_____D__DBDDCC_D_C_D__AD_D_CB_C_A_B___B_______DD___D_C_A_____B__C__D______D_______C_A_____C__DC_____B__B_CD_B___CD__DAD__C__C______CDD_______C_DA________DDD____CDDD___DB____BD__B_______D_D_B_________CD__D__C_C____B__A___CDB__BC_D__D__CD_C_________D___A_DC__B______B_DDDDD_____C_CDA_C___C_CDDDDC__D__CCB____D_B__B______D______BD_____A____D_D__AD__D__B___B__C____A____C_D_D___C__CDD___________________CC___DC___DDB_BDADDC______B____C__D___D__CA_______CD__D_D_C_______BD_C_DBA_BDD__CD__CCC__BD___D_____D_____D__DBDDCC_D_C_D__AD_D_CB_C_A_B___B_______DD___D_C_A_____B__C__D______D_______C_A_____C__DC_____B__B_CD_B___CD__DAD__C__C______CDD_______C_DA________DDD____CDDD___DB____BD__B________D_D_B_________CD__D__C_C____B__A___CDB__BC_D__D__CD_C_________D___A_DC__B______B_DDDDD_____C_CDA_C___C_CDDDDC__D__CCB____D_B__B______D______BD_____A____D_D__AD__D__B___B__C____A____C_D_D___C__CDD___________________CC___DC___DDB_BDADDC______B____C__D___D__CA_______CD__D_D_C_______BD_C_DBA_BDD__CD_",
        reelLength: 100,
        reelCount: 5,
        windowLength: 3,
        paylines: [
          // 1. Middle line
          [1, 1, 1, 1, 1],
          // 2. Top line
          [0, 0, 0, 0, 0],
          // 3. Bottom line
          [2, 2, 2, 2, 2],
          // 4. V shape
          [0, 1, 2, 1, 0],
          // 5. Inverted V
          [2, 1, 0, 1, 2],
          // 6. Diagonal down
          [0, 1, 1, 2, 2],
          // 7. Diagonal up
          [2, 1, 1, 0, 0],
          // 8. Zigzag top
          [0, 0, 1, 0, 0],
          // 9. Zigzag bottom
          [2, 2, 1, 2, 2],
          // 10. Staircase down
          [0, 1, 2, 2, 1],
          // 11. Staircase up
          [2, 1, 0, 0, 1],
          // 12. Slight diagonal
          [1, 0, 0, 0, 1],
          // 13. Slight diagonal
          [1, 2, 2, 2, 1],
          // 14. Top-bottom-top
          [0, 2, 0, 2, 0],
          // 15. Bottom-top-bottom
          [2, 0, 2, 0, 2],
          // 16. Outer rails up
          [0, 2, 1, 2, 0],
          // 17. Outer rails down
          [2, 0, 1, 0, 2],
          // 18. Left hook
          [0, 0, 1, 2, 2],
          // 19. Right hook
          [2, 2, 1, 0, 0],
          // 20. Wave
          [1, 0, 1, 2, 1]
        ],
        payouts: {
          A: { 3: 200, 4: 1000, 5: 10000 },
          B: { 3: 60, 4: 200, 5: 1000 },
          C: { 3: 30, 4: 100, 5: 500 },
          D: { 3: 10, 4: 55, 5: 250 }
        },
        settings: {
          transactionTimeout: 10,
          maxRetries: 3,
          refreshInterval: 30000,
          showTransactionHistory: true
        }
      },
      features: {
        depositsEnabled: true,
        withdrawalsEnabled: true,
        gameplayEnabled: true,
        houseDashboardEnabled: true,
        playerSelectionEnabled: true,
        stakingEnabled: true,
        leaderboardEnabled: true,
        betaMode: false
      }
    },
    /*{
      id: 'alpha-2',
      name: 'New Alpha Slots',
      description: 'A new alpha slot machine for testing',
      slotMachineAppId: 41501763,
      ybtAppId: 41501764,
      status: 'active',
      theme: 'default',
      displayOrder: 0,
      metadata: {
        version: '1.0.0',
        deployedAt: 1704067200000, // 2025-08-28
        owner: '',
        minBet: 1000000, // 1 VOI
        maxBet: 100000000, // 100 VOI
        maxPaylines: 20,
        houseEdge: 5.0,
        symbols: ['A', 'B', 'C', 'D', '_'],
        reelData: '_CCC__BD___D_____D_____D__DBDDCC_D_C_D__AD_D_CB_C_A_B___B_______DD___D_C_A_____B__C__D______D_______C_A_____C__DC_____B__B_CD_B___CD__DAD__C__C______CDD_______C_DA________DDD____CDDD___DB____BD__B________D_D_B_________CD__D__C_C____B__A___CDB__BC_D__D__CD_C_________D___A_DC__B______B_DDDDD_____C_CDA_C___C_CDDDDC__D__CCB____D_B__B______D______BD_____A____D_D__AD__D__B___B__C____A____C_D_D___C__CDD___________________CC___DC___DDB_BDADDC______B____C__D___D__CA_______CD__D_D_C_______BD_C_DBA_BDD__CD_',
        reelLength: 100,
        reelCount: 5,
        windowLength: 3,
        paylines: [
          // 1. Middle line
          [1, 1, 1, 1, 1],
          // 2. Top line
          [0, 0, 0, 0, 0],
          // 3. Bottom line
          [2, 2, 2, 2, 2],
          // 4. V shape
          [0, 1, 2, 1, 0],
          // 5. Inverted V
          [2, 1, 0, 1, 2],
          // 6. Diagonal down
          [0, 1, 1, 2, 2],
          // 7. Diagonal up
          [2, 1, 1, 0, 0],
          // 8. Zigzag top
          [0, 0, 1, 0, 0],
          // 9. Zigzag bottom
          [2, 2, 1, 2, 2],
          // 10. Staircase down
          [0, 1, 2, 2, 1],
          // 11. Staircase up
          [2, 1, 0, 0, 1],
          // 12. Slight diagonal
          [1, 0, 0, 0, 1],
          // 13. Slight diagonal
          [1, 2, 2, 2, 1],
          // 14. Top-bottom-top
          [0, 2, 0, 2, 0],
          // 15. Bottom-top-bottom
          [2, 0, 2, 0, 2],
          // 16. Outer rails up
          [0, 2, 1, 2, 0],
          // 17. Outer rails down
          [2, 0, 1, 0, 2],
          // 18. Left hook
          [0, 0, 1, 2, 2],
          // 19. Right hook
          [2, 2, 1, 0, 0],
          // 20. Wave
          [1, 0, 1, 2, 1]
        ],
        payouts: {
          A: { 3: 200, 4: 1000, 5: 10000 },
          B: { 3: 60, 4: 200, 5: 1000 },
          C: { 3: 30, 4: 100, 5: 500 },
          D: { 3: 10, 4: 55, 5: 250 }
        },
        settings: {
          transactionTimeout: 10,
          maxRetries: 3,
          refreshInterval: 30000,
          showTransactionHistory: true
        }
      },
      features: {
        depositsEnabled: true,
        withdrawalsEnabled: true,
        gameplayEnabled: true,
        houseDashboardEnabled: true,
        playerSelectionEnabled: true,
        stakingEnabled: true,
        leaderboardEnabled: true,
        betaMode: false
      }
    }*/
  ],
  defaultContractId: 'alpha-1',
  globalSettings: {
    showAggregatedPortfolio: true,
    enableContractSwitching: false,
    showCrossContractStats: false,
    healthCheckInterval: 300000, // 5 minutes
    enablePersistentCache: true,
    preloadContractData: true
  },
  multiContractFeatures: {
    portfolioAggregation: true,
    contractComparison: false,
    crossContractLeaderboards: false,
    contractMigration: false,
    performanceAnalytics: true,
    riskDistributionAnalysis: false
  }
};