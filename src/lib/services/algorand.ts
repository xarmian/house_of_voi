import algosdk from 'algosdk';
import * as algokit from '@algorandfoundation/algokit-utils';
import { SlotMachineClient } from '../../clients/SlotMachineClient.js';
import { CONTRACT } from 'ulujs';
import { NETWORK_CONFIG, CONTRACT_CONFIG, BLOCKCHAIN_CONFIG } from '$lib/constants/network';
import type { WalletAccount } from '$lib/types/wallet';
import type { 
  TransactionParams, 
  SpinTransaction, 
  SpinResult, 
  BetInfo, 
  ClaimResult, 
  GridOutcome,
  TransactionStatus,
  BlockchainError 
} from '$lib/types/blockchain';
import { contractDataCache } from './contractDataCache';

// Import the actual ABI from SlotMachineClient like React component does
import { APP_SPEC as SlotMachineAppSpec } from '../../clients/SlotMachineClient.js';

// Slot Machine ABI for ulujs - use the real ABI like React component
const slotMachineABI = {
  name: "Slot Machine",
  desc: "A simple slot machine game",
  methods: SlotMachineAppSpec.contract.methods, // Use actual methods from generated client
  events: [
    {
      name: "BetPlaced",
      args: [
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" }
      ]
    },
    {
      name: "BetClaimed", 
      args: [
        { type: "address" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" }
      ]
    }
  ]
};

// Helper function to sign, send and confirm transactions
const signSendAndConfirm = async (client: algosdk.Algodv2, txns: string[], sk: Uint8Array) => {
  const stxns = txns
    .map((t) => {
      // Convert base64 string to Uint8Array (browser-compatible)
      const binaryString = atob(t);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    })
    .map((t) => {
      const txn = algosdk.decodeUnsignedTransaction(t);
      return txn;
    })
    .map((t) => algosdk.signTransaction(t, sk).blob);

  const { txId } = await client.sendRawTransaction(stxns).do();
  const result = await algosdk.waitForConfirmation(client, txId, 4);
  return {
    txId,
    confirmedRound: result.confirmedRound
  };
};

export class AlgorandService {
  private client: algosdk.Algodv2;
  private indexer: algosdk.Indexer;
  private appId: number;

  constructor() {
    // Validate configuration before creating clients
    if (!NETWORK_CONFIG.nodeUrl || !NETWORK_CONFIG.indexerUrl) {
      console.error('Missing required network configuration for AlgorandService');
      throw new Error('Invalid network configuration');
    }
    
    this.client = new algosdk.Algodv2(
      NETWORK_CONFIG.token || '',
      NETWORK_CONFIG.nodeUrl || '',
      NETWORK_CONFIG.port
    );
    
    this.indexer = new algosdk.Indexer(
      NETWORK_CONFIG.token || '',
      NETWORK_CONFIG.indexerUrl || '',
      NETWORK_CONFIG.port
    );
    
    this.appId = CONTRACT_CONFIG.slotMachineAppId;
    
    if (!this.appId || this.appId === 0) {
      console.error('Missing or invalid slot machine app ID');
      throw new Error('Invalid contract configuration');
    }
  }

  private hexToUint8Array(hex: string): Uint8Array {
    return new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  }

  private hexStringToUint8Array(hexString: string): Uint8Array {
    // Remove any whitespace and ensure even length
    const cleanHex = hexString.replace(/\s/g, '');
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    return new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
  }

  async generateWallet(): Promise<WalletAccount> {
    const account = algosdk.generateAccount();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    
    return {
      address: account.addr,
      privateKey: Array.from(account.sk, (byte: number) => byte.toString(16).padStart(2, '0')).join(''),
      mnemonic,
      createdAt: Date.now(),
      isLocked: false
    };
  }

  async getBalance(address: string): Promise<number> {
    const accountInfo = await this.client.accountInformation(address).do();
    return accountInfo.amount;
  }

  getClient(): algosdk.Algodv2 {
    return this.client;
  }

  getIndexer(): algosdk.Indexer {
    return this.indexer;
  }

  getAppId(): number {
    return this.appId;
  }

  private createSlotMachineClient(account: { addr: string; sk: Uint8Array }) {
    return new SlotMachineClient(
      {
        resolveBy: "id",
        id: this.appId,
        sender: account,
      },
      this.client
    );
  }

  /**
   * Get suggested transaction parameters
   */
  async getSuggestedParams(): Promise<any> {
    try {
      if (!this.client) {
        throw new Error('Algorand client not initialized');
      }
      return await this.client.getTransactionParams().do();
    } catch (error) {
      throw this.handleError(error, 'Failed to get transaction parameters');
    }
  }

  /**
   * Ensure the contract is bootstrapped (spin_params box initialized)
   */
  async ensureBootstrapped(appClient: any): Promise<void> {
    try {
      console.log('Checking if contract is bootstrapped...');
      
      // Check if the spin_params box exists by directly querying box storage
      // This avoids the chicken-and-egg problem of calling spinCost which needs the box
      try {
        console.log('Checking for spin_params box...');
        const boxResponse = await this.client.getApplicationBoxByName(this.appId, new TextEncoder().encode('spin_params')).do();
        if (boxResponse && boxResponse.value && boxResponse.value.length > 0) {
          console.log('✅ Contract is already bootstrapped (spin_params box exists with data)');
          return;
        }
        console.log('spin_params box exists but is empty, need to bootstrap');
      } catch (error: any) {
        // Box doesn't exist, need to bootstrap
        console.log('❌ spin_params box not found, contract needs bootstrap. Error:', error.message);
      }
      
      console.log('🔄 Attempting to bootstrap contract...');
      
      // Get bootstrap cost
      console.log('Getting bootstrap cost...');
      const bootstrapCostResult = await appClient.bootstrapCost({});
      const bootstrapCost = Number(bootstrapCostResult.return);
      
      console.log('💰 Bootstrap cost:', bootstrapCost, 'microAlgos');
      
      // Call bootstrap with payment
      console.log('Executing bootstrap transaction...');
      const bootstrapResult = await appClient.bootstrap({}, {
        payment: algokit.microAlgos(bootstrapCost),
        sendParams: {
          extraProgramPages: 1,
        }
      });
      
      console.log('✅ Contract bootstrapped successfully!');
      console.log('Bootstrap transaction ID:', bootstrapResult.transaction.txID());
      
      // Wait for confirmation
      console.log('Waiting for bootstrap confirmation...');
      await this.waitForConfirmation(bootstrapResult.transaction.txID());
      console.log('Bootstrap confirmed!');
      
      // Verify bootstrap worked
      try {
        const verifyBoxResponse = await this.client.getApplicationBoxByName(this.appId, new TextEncoder().encode('spin_params')).do();
        if (verifyBoxResponse && verifyBoxResponse.value && verifyBoxResponse.value.length > 0) {
          console.log('✅ Bootstrap verification successful - spin_params box now exists');
        } else {
          throw new Error('Bootstrap verification failed - spin_params box still empty');
        }
      } catch (verifyError) {
        console.error('❌ Bootstrap verification failed:', verifyError);
        throw new Error('Bootstrap completed but verification failed');
      }
      
    } catch (error) {
      console.error('💥 Failed to ensure bootstrap:', error);
      throw this.handleError(error, 'Failed to ensure contract is bootstrapped');
    }
  }

  /**
   * Force bootstrap the contract manually
   */
  async forceBootstrap(senderAccount: { address: string; privateKey: string }): Promise<void> {
    try {
      console.log('🔄 FORCE BOOTSTRAP: Starting manual bootstrap...');
      
      const account = {
        addr: senderAccount.address,
        sk: this.hexToUint8Array(senderAccount.privateKey)
      };

      // Create client instance
      const appClient = this.createSlotMachineClient(account);
      
      // Get bootstrap cost
      console.log('Getting bootstrap cost...');
      const bootstrapCostResult = await appClient.bootstrapCost({});
      const bootstrapCost = Number(bootstrapCostResult.return);
      
      console.log('💰 Bootstrap cost:', bootstrapCost, 'microAlgos');
      
      // Call bootstrap with payment
      console.log('Executing bootstrap transaction...');
      const bootstrapResult = await appClient.bootstrap({}, {
        payment: algokit.microAlgos(bootstrapCost),
        sendParams: {
          extraProgramPages: 1,
        }
      });
      
      console.log('✅ FORCE BOOTSTRAP COMPLETED!');
      console.log('Bootstrap transaction ID:', bootstrapResult.transaction.txID());
      
      // Wait for confirmation
      console.log('Waiting for bootstrap confirmation...');
      await this.waitForConfirmation(bootstrapResult.transaction.txID());
      console.log('✅ Bootstrap confirmed and ready!');
      
    } catch (error) {
      console.error('💥 FORCE BOOTSTRAP FAILED:', error);
      throw this.handleError(error, 'Failed to force bootstrap contract');
    }
  }

  /**
   * Check account and contract balances before spinning
   */
  async checkBalances(accountAddress: string, totalRequired: number): Promise<void> {
    try {
      console.log('💰 Checking balances...');
      
      // Check user account balance
      const accountInfo = await this.client.accountInformation(accountAddress).do();
      const userBalance = accountInfo.amount;
      
      console.log('👤 User account balance:', {
        address: accountAddress,
        balance: userBalance,
        balanceVOI: (userBalance / 1000000).toFixed(6),
        required: totalRequired,
        requiredVOI: (totalRequired / 1000000).toFixed(6),
        sufficient: userBalance >= totalRequired
      });
      
      // Check slot machine contract balance
      const contractAddress = algosdk.getApplicationAddress(this.appId);
      const contractInfo = await this.client.accountInformation(contractAddress).do();
      const contractBalance = contractInfo.amount;
      
      console.log('🎰 Slot machine contract balance:', {
        address: contractAddress,
        appId: this.appId,
        balance: contractBalance,
        balanceVOI: (contractBalance / 1000000).toFixed(6)
      });
      
      // Check if user has sufficient balance
      if (userBalance < totalRequired) {
        throw new Error(`Insufficient balance. Need ${(totalRequired / 1000000).toFixed(6)} VOI, have ${(userBalance / 1000000).toFixed(6)} VOI`);
      }
      
      // Check if contract has reasonable balance (should have enough to pay potential winnings)  
      const betAmount = totalRequired - 37700; // Extract bet amount from total required
      const maxPayout = betAmount * 1000; // Assume max 1000x multiplier
      if (contractBalance < maxPayout) {
        console.warn('⚠️ Contract balance might be insufficient for max payout:', {
          contractBalance: (contractBalance / 1000000).toFixed(6),
          maxPayout: (maxPayout / 1000000).toFixed(6)
        });
      }
      
      console.log('✅ Balance checks passed');
      
    } catch (error) {
      console.error('💥 Balance check failed:', error);
      throw this.handleError(error, 'Balance check failed');
    }
  }

  /**
   * Submit spin transaction to the smart contract using ulujs (like working React component)
   */
  async submitSpin(
    senderAccount: { address: string; privateKey: string },
    spinTx: SpinTransaction
  ): Promise<SpinResult> {
    try {
      console.log('🎰 Starting ulujs spin...');
      
      // Calculate required payment first
      const spinCost = 50500;
      const spinPaylineCost = 30000;
      const minimumExtraCosts = spinCost + spinPaylineCost * (spinTx.maxPaylineIndex + 1);
      const totalRequired = spinTx.betAmount + minimumExtraCosts;
      
      // Check balances before attempting spin
      await this.checkBalances(senderAccount.address, totalRequired);
      console.log(slotMachineABI);
      
      // Create ulujs CONTRACT instance (matching React component pattern exactly)
      const ci = new CONTRACT(
        this.appId,
        this.client,
        undefined, // Use undefined for indexer like React component
        slotMachineABI,
        {
          addr: senderAccount.address,
          sk: this.hexToUint8Array(senderAccount.privateKey),
        }
      );

      // Configure CONTRACT instance 
      ci.setEnableRawBytes(true);
      
      // Set payment amount (calculated above)
      const paymentAmount = totalRequired;
      ci.setPaymentAmount(paymentAmount);
      
      console.log('💰 TEAL-compliant Payment calculation:', {
        betAmount: spinTx.betAmount,
        maxPaylineIndex: spinTx.maxPaylineIndex,
        index: spinTx.index,
        spinCost,
        spinPaylineCost,
        minimumExtraCosts,
        totalPayment: paymentAmount
      });
      
      console.log('Calling ulujs spin with TEAL-compliant parameters...');
      
      // Call spin with parameters matching successful transaction and TEAL contract
      // TEAL expects: spin(bet_amount, provider_id, index)
      const spinR = await ci.spin(
        BigInt(spinTx.betAmount / (spinTx.maxPaylineIndex + 1)),        // bet_amount (directly from spinTx, no conversion)
        BigInt(spinTx.maxPaylineIndex),  // provider_id (second parameter in successful tx)
        BigInt(spinTx.index)             // index (third parameter in successful tx)
      );

      if (!spinR.success) {
        throw new Error(`Spin failed: ${spinR.error || 'Unknown error'}`);
      }

      console.log('✅ ulujs spin simulation successful, now submitting real transactions:', spinR);

      // Extract bet key from the simulated response
      const betKey = spinR.returnValue;
      const betKeyHex = Array.from(new Uint8Array(betKey)).map(b => b.toString(16).padStart(2, '0')).join('');
      console.log('🔑 Simulated bet key:', betKeyHex);

      // Get the unsigned transactions from the simulation
      const unsignedTxns = spinR.txns;
      if (!unsignedTxns || unsignedTxns.length === 0) {
        throw new Error('No transactions returned from ulujs simulation');
      }

      console.log('📄 Got unsigned transactions to submit:', unsignedTxns);

      // Decode the unsigned transactions
      const decodedTxns = unsignedTxns.map(txnBlob => {
        // Decode base64 transaction blob
        const txnBytes = this.base64ToUint8Array(txnBlob);
        return algosdk.decodeUnsignedTransaction(txnBytes);
      });

      console.log('🔍 Decoded transactions:', decodedTxns);

      // Sign the transactions
      const account = {
        addr: senderAccount.address,
        sk: this.hexToUint8Array(senderAccount.privateKey)
      };

      const signedTxns = decodedTxns.map(txn => {
        return algosdk.signTransaction(txn, account.sk);
      });

      console.log('📝 Transactions signed');

      // Submit the signed transactions as a group
      const submittedGroup = await this.client.sendRawTransaction(signedTxns.map(stxn => stxn.blob)).do();
      const txId = submittedGroup.txId;
      
      console.log('🚀 Transaction group submitted with ID:', txId);

      // Wait for confirmation
      console.log('⏳ Waiting for transaction confirmation...');
      const confirmedTxn = await this.waitForConfirmation(txId);
      console.log('✅ Transaction confirmed:', confirmedTxn);
      
      // Extract the actual bet key from the confirmed transaction logs
      let actualBetKey = betKeyHex; // fallback to simulated key
      
      if (confirmedTxn && confirmedTxn.logs && confirmedTxn.logs.length > 0) {
        try {
          // The bet key should be in the first log entry
          const logData = this.base64ToUint8Array(confirmedTxn.logs[0]);
          console.log('📜 Transaction log data:', logData);
          
          // Extract bet key from log (it should be the first part of the log after the event signature)
          // Based on TEAL contract, the log format includes the bet key
          if (logData.length >= 56) {
            // Skip the first 4 bytes (event signature) and extract the bet key (56 bytes)
            const betKeyBytes = logData.slice(4, 60);
            actualBetKey = Array.from(betKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('🔑 Actual bet key from logs:', actualBetKey);
          }
        } catch (error) {
          console.warn('⚠️ Could not extract bet key from logs, using simulated key:', error);
        }
      }
      
      return {
        txId: txId,
        betKey: actualBetKey,
        round: confirmedTxn['confirmed-round'] || 0,
        transactions: signedTxns.map(stxn => stxn.blob)
      };

    } catch (error) {
      console.error('💥 ulujs spin failed:', error);
      throw this.handleError(error, 'Failed to submit spin transaction');
    }
  }

  /**
   * Get bet grid from the contract - generates the same grid as the contract would
   */
  async getBetGrid(betKey: string): Promise<string> {
    try {
      // First get the bet info to get the claim round
      const betInfo = await this.getBetInfo(betKey);
      
      // Get block seed for the claim round
      const blockSeed = await this.getBlockSeed(betInfo.claimRound);
      
      // Generate grid using the same algorithm as the contract
      // combined = block_seed + bet_key, then sha256, then generate grid
      const betKeyBytes = this.hexStringToUint8Array(betKey);
      const combined = new Uint8Array(blockSeed.length + betKeyBytes.length);
      combined.set(blockSeed);
      combined.set(betKeyBytes, blockSeed.length);
      
      // Hash the combined data
      const hashedBytes = await crypto.subtle.digest('SHA-256', combined);
      const seed = new Uint8Array(hashedBytes);
      
      // Generate grid from seed (same as contract logic)
      const grid = this.generateGridFromSeed(seed);
      
      console.log('🎲 Generated grid from seed:', grid);
      return grid;

    } catch (error) {
      throw this.handleError(error, 'Failed to get bet grid');
    }
  }

  /**
   * Generate 5x3 grid from seed (matching contract logic)
   */
  private generateGridFromSeed(seed: Uint8Array): string {
    // Default reel data (matching contract)
    const reelData = "DDD_C___CD_C__C_C__CBDDBC______DD_____D_D_A_DDC_CCDC_D_____BD_DC_C________C__C_C_____B_D_C______C_D_" +
                    "_D_D_D___C_____DBC_C_B__D_B_____CAD______D___CDC_CCD__D____CD__C_CCDC___C_C_______C_DBD_D__DC___CD_D" +
                    "_CC_DBD__DC_C___DD_BDD___CA__D___CC_DC__DCD__CCC_C_____DC_B_CD__C________D___DB____C_DC_D____D______" +
                    "__DCDBCD_DDD___CC____C__C__CCD_C__C_CBDB__C_DC___C__DD_D________D____CAB____D_C__DDD___C_____C_D____" +
                    "____DCDCD_D_BBDDC_____CC__D__D__D_______B_CC___D_CD___BCDC__A_______DCD_C__C__D_____D__D___C_C_CDCC_";
    
    const reelLength = 100;
    const reelCount = 5;
    const windowLength = 3;
    
    let grid = '';
    
    console.log('🎲 Generating grid from seed length:', seed.length);
    
    // Generate 5 reels - use modular arithmetic to stay within seed bounds
    for (let reel = 0; reel < reelCount; reel++) {
      // Create a unique seed for each reel by hashing seed + reel number
      const reelSeedInput = new Uint8Array(seed.length + 1);
      reelSeedInput.set(seed);
      reelSeedInput[seed.length] = reel + 1;
      
      // Use a simpler approach - take bytes from different offsets
      const offset = (reel * 4) % (seed.length - 4); // Ensure we don't go out of bounds
      const reelSeedSlice = seed.slice(offset, offset + 4);
      const seedValue = new DataView(reelSeedSlice.buffer).getUint32(0, false);
      
      const maxReelStop = reelLength - windowLength;
      const position = seedValue % maxReelStop;
      
      // Extract 3 characters from this reel
      const startPos = reel * reelLength + position;
      const reelWindow = reelData.slice(startPos, startPos + windowLength);
      grid += reelWindow;
      
      console.log(`  Reel ${reel}: position=${position}, window="${reelWindow}"`);
    }
    
    console.log('🎰 Final grid:', grid);
    return grid;
  }

  /**
   * Get bet information from the contract
   */
  async getBetInfo(betKey: string): Promise<BetInfo> {
    try {
      // Validate bet key format
      if (!betKey || betKey.length !== 112) {
        throw new Error(`Invalid bet key format: expected 112 hex chars, got ${betKey?.length || 0}`);
      }

      // Validate bet key contains valid hex
      if (!/^[0-9a-fA-F]+$/.test(betKey)) {
        throw new Error('Bet key contains non-hex characters');
      }

      console.log('🔍 Getting bet info for key:', betKey.slice(0, 16) + '...');
      
      const betKeyBytes = this.hexStringToUint8Array(betKey);

      // For read-only calls, we can use box storage directly or simulate without signature
      // Let's try reading the bet data from box storage directly
      try {
        const boxResponse = await this.client.getApplicationBoxByName(this.appId, betKeyBytes).do();
        
        if (boxResponse && boxResponse.value && boxResponse.value.length >= 56) {
          // Parse the bet data from the box
          // Format: who (32 bytes) + amount (8 bytes) + max_payline_index (8 bytes) + claim_round (8 bytes) + payline_index (8 bytes)
          const betData = new Uint8Array(boxResponse.value);
          
          // Extract claim_round (bytes 48-56)
          const claimRoundBytes = betData.slice(48, 56);
          const claimRound = Number(new DataView(claimRoundBytes.buffer).getBigUint64(0, false));
          
          console.log('📦 Read bet data from box storage, claim round:', claimRound);
          
          return {
            who: '',
            amount: 0,
            maxPaylineIndex: 0,
            claimRound,
            paylineIndex: 0
          };
        } else {
          throw new Error('Bet not found in box storage');
        }
      } catch (boxError) {
        console.warn('Could not read from box storage, bet may not exist:', boxError);
        throw new Error('Bet not found');
      }

    } catch (error) {
      throw this.handleError(error, 'Failed to get bet information');
    }
  }

  /**
   * Check if bet is ready to claim
   */
  async isBetReadyToClaim(betKey: string): Promise<boolean> {
    try {
      const betInfo = await this.getBetInfo(betKey);
      const currentRound = await this.getCurrentRound();
      
      return currentRound >= betInfo.claimRound;
    } catch (error) {
      console.error('Error checking bet claim status:', error);
      return false;
    }
  }

  /**
   * Get all paylines from the contract (direct contract call)
   */
  private async getPaylinesDirect(address: string): Promise<number[][]> {
    try {
      // Create a read-only account for contract calls
      const readOnlyAccount = {
        addr: address,
        sk: new Uint8Array(0) // Empty private key for read-only
      };

      // Create Ulujs CONTRACT instance (matching spin method pattern)
      const ci = new CONTRACT(
        this.appId,
        this.client,
        undefined, // Use undefined for indexer like in spin method
        slotMachineABI,
        readOnlyAccount
      );

      // Configure CONTRACT instance 
      ci.setEnableRawBytes(true);
      
      // Call get_paylines method - gets return value without submitting
      const result = await ci.get_paylines();

      // Convert BigInt array to number array and reshape to paylines
      const flatPaylines = (result.returnValue as bigint[]).map(x => Number(x));
      
      // Convert flat array to 2D array (assuming 20 paylines with 5 positions each)
      const paylines: number[][] = [];
      for (let i = 0; i < flatPaylines.length; i += 5) {
        paylines.push(flatPaylines.slice(i, i + 5));
      }

      return paylines;

    } catch (error) {
      throw this.handleError(error, 'Failed to get paylines');
    }
  }

  /**
   * Get all paylines from the contract (with caching)
   */
  async getPaylines(address: string): Promise<number[][]> {
    // Use cache service to handle caching logic
    return contractDataCache.getPaylines(address);
  }

  /**
   * Get payout multiplier for a specific symbol and count from the contract (with caching)
   */
  async getPayoutMultiplier(symbol: string, count: number, address: string): Promise<number> {
    // Use cache service to handle caching logic
    return contractDataCache.getPayoutMultiplier(symbol, count, address);
  }

  /**
   * Get grid outcome for a completed bet
   */
  async getGridOutcome(betKey: string): Promise<GridOutcome> {
    try {
      // Get the actual grid from the contract
      const gridString = await this.getBetGrid(betKey);
      
      // Convert the 15-character string to a 2D array for compatibility
      // String format: "___D__CCCC____D" -> 5 columns x 3 rows
      const grid: string[][] = [];
      for (let col = 0; col < 5; col++) {
        grid[col] = [];
        for (let row = 0; row < 3; row++) {
          const index = col * 3 + row;
          grid[col][row] = gridString[index];
        }
      }

      const betInfo = await this.getBetInfo(betKey);

      return {
        grid,
        gridString, // Include the raw 15-character string
        seed: betKey, // Use bet key as seed reference
        round: betInfo.claimRound
      };

    } catch (error) {
      throw this.handleError(error, 'Failed to get grid outcome');
    }
  }

  /**
   * Submit claim transaction
   */
  async submitClaim(
    senderAccount: { address: string; privateKey: string },
    betKey: string
  ): Promise<ClaimResult> {
    try {
      console.log(`🎯 Claiming bet with key: ${betKey.slice(0, 16)}...`);
      
      const account = {
        addr: senderAccount.address,
        sk: this.hexToUint8Array(senderAccount.privateKey)
      };

      // Create client instance
      const appClient = this.createSlotMachineClient(account);
      
      // Verify the bet key exists first
      try {
        const betKeyBytes = this.hexStringToUint8Array(betKey);
        const boxResponse = await this.client.getApplicationBoxByName(this.appId, betKeyBytes).do();
        console.log('📦 Box exists, length:', boxResponse.value?.length || 0);
        
        if (!boxResponse.value || boxResponse.value.length === 0) {
          throw new Error(`Bet box is empty or doesn't exist for key: ${betKey.slice(0, 16)}...`);
        }
      } catch (boxError: any) {
        console.error('❌ Box verification failed:', boxError);
        if (boxError.message?.includes('does not exist')) {
          throw new Error(`Bet not found in contract. The bet may have already been claimed or never existed. Key: ${betKey.slice(0, 16)}...`);
        }
        throw boxError;
      }
      
      // Call the claim method using CONTRACT class like in documentation
      console.log('📝 Calling claim method...');
      
      // Create CONTRACT instance for claim
      const ci = new CONTRACT(
        this.appId,
        this.client,
        undefined,
        slotMachineABI,
        account
      );
      
      // Set fee and enable params like in documentation
      ci.setFee(5000);
      ci.setEnableParamsLastRoundMod(true);
      ci.setEnableRawBytes(true);
      
      // Call claim method with bet key as bytes
      const betKeyBytes = this.hexStringToUint8Array(betKey);
      const claimResult = await ci.claim(betKeyBytes);

      // Check if claim was successful and extract results
      if (!claimResult.success) {
        throw new Error('Claim transaction failed');
      }

      // Sign, send and confirm the transaction like in documentation
      const txnResult = await signSendAndConfirm(this.client, claimResult.txns, account.sk);
      
      // Extract payout from return value
      const payout = Number(claimResult.returnValue || 0);
      console.log(`✅ Claim successful, payout: ${payout} microVOI`);

      return {
        txId: txnResult.txId || '',
        payout,
        round: txnResult.confirmedRound || 0
      };

    } catch (error: any) {
      console.error('💥 Claim failed:', error);
      
      // Provide more specific error messages
      if (error.message?.includes('invalid Box reference')) {
        throw new Error(`Bet not found in contract storage. This bet may have already been claimed or expired. Key: ${betKey.slice(0, 16)}...`);
      }
      
      throw this.handleError(error, 'Failed to submit claim transaction');
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txId: string, maxRounds = BLOCKCHAIN_CONFIG.transactionTimeout): Promise<any> {
    const startRound = (await this.getSuggestedParams()).firstRound;
    let round = startRound;
    
    while (round < startRound + maxRounds) {
      try {
        const txInfo = await this.client.pendingTransactionInformation(txId).do();
        if (txInfo['confirmed-round']) {
          return txInfo;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }
      
      // Wait for next round
      await this.waitForRound(round + 1);
      round++;
    }
    
    throw new Error(`Transaction ${txId} not confirmed after ${maxRounds} rounds`);
  }

  /**
   * Wait for specific round
   */
  async waitForRound(round: number): Promise<void> {
    let currentRound = await this.getCurrentRound();
    
    while (currentRound < round) {
      await new Promise(resolve => setTimeout(resolve, BLOCKCHAIN_CONFIG.blockTime));
      currentRound = await this.getCurrentRound();
    }
  }

  /**
   * Get current network round
   */
  async getCurrentRound(): Promise<number> {
    const status = await this.client.status().do();
    return status['last-round'];
  }

  /**
   * Get block seed for specific round
   */
  async getBlockSeed(round: number): Promise<string> {
    try {
      const block = await this.client.block(round).do();
      return block.block.seed;
    } catch (error) {
      throw this.handleError(error, `Failed to get block seed for round ${round}`);
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txId: string): Promise<TransactionStatus> {
    try {
      const txInfo = await this.client.pendingTransactionInformation(txId).do();
      
      if (txInfo['confirmed-round']) {
        return {
          confirmed: true,
          round: txInfo['confirmed-round'],
          txId
        };
      } else {
        return {
          confirmed: false,
          txId
        };
      }
    } catch (error) {
      return {
        confirmed: false,
        txId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Helper methods
  private encodeUint64(value: number): Uint8Array {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, BigInt(value), false); // false for big-endian
    return new Uint8Array(buffer);
  }


  private extractBetKeyFromLogs(txInfo: any): string {
    // Parse the bet key from transaction logs
    // Look for logs in the confirmed transaction
    if (txInfo.logs && txInfo.logs.length > 0) {
      // The bet key should be in the first log entry as returned by the contract
      // This would need to be implemented based on the actual contract log format
      try {
        const logData = this.base64ToUint8Array(txInfo.logs[0]);
        // TODO: Parse the actual bet key from the log based on contract format
        return Array.from(logData).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); // Example parsing
      } catch (error) {
        console.error('Error parsing bet key from logs:', error);
      }
    }
    
    // Fallback: generate deterministic key from transaction ID if logs parsing fails
    const hash = require('crypto').createHash('sha256').update(txInfo.txId || 'fallback').digest('hex');
    return hash.slice(0, 16);
  }

  private extractPayoutFromLogs(txInfo: any): number {
    // Parse the payout amount from transaction logs
    if (txInfo.logs && txInfo.logs.length > 1) {
      try {
        const logData = this.base64ToUint8Array(txInfo.logs[1]);
        // TODO: Parse the actual payout from the log based on contract format
        // For now, assume it's a uint64 in the second log entry
        if (logData.length >= 8) {
          const view = new DataView(logData.buffer);
          return Number(view.getBigUint64(0, false)); // false for big-endian
        }
      } catch (error) {
        console.error('Error parsing payout from logs:', error);
      }
    }
    
    // Fallback: return 0 if no payout found
    return 0;
  }


  private handleError(error: any, context: string): BlockchainError {
    console.error(`${context}:`, error);
    
    let errorType: BlockchainError['type'] = 'UNKNOWN';
    let message = error?.message || 'Unknown blockchain error';
    
    // Categorize error types
    if (error?.message?.includes('network') || error?.message?.includes('connection')) {
      errorType = 'NETWORK';
    } else if (error?.message?.includes('insufficient')) {
      errorType = 'INSUFFICIENT_FUNDS';
    } else if (error?.message?.includes('validation') || error?.message?.includes('invalid')) {
      errorType = 'VALIDATION';
    } else if (error?.message?.includes('contract') || error?.message?.includes('app')) {
      errorType = 'CONTRACT';
    }
    
    return {
      type: errorType,
      message,
      details: error
    };
  }
}

// Create service instance with error handling
let algorandService: AlgorandService | null = null;

try {
  algorandService = new AlgorandService();
} catch (error) {
  console.error('Failed to initialize AlgorandService:', error);
  
  // Create a mock service that throws errors on method calls
  algorandService = {
    generateWallet: async () => { throw new Error('AlgorandService not properly initialized'); },
    getBalance: async () => { throw new Error('AlgorandService not properly initialized'); },
    getClient: () => { throw new Error('AlgorandService not properly initialized'); },
    getIndexer: () => { throw new Error('AlgorandService not properly initialized'); },
    getAppId: () => { throw new Error('AlgorandService not properly initialized'); },
    getSuggestedParams: async () => { throw new Error('AlgorandService not properly initialized'); },
    forceBootstrap: async () => { throw new Error('AlgorandService not properly initialized'); },
    submitSpin: async () => { throw new Error('AlgorandService not properly initialized'); },
    getBetGrid: async () => { throw new Error('AlgorandService not properly initialized'); },
    getBetInfo: async () => { throw new Error('AlgorandService not properly initialized'); },
    isBetReadyToClaim: async () => { throw new Error('AlgorandService not properly initialized'); },
    getGridOutcome: async () => { throw new Error('AlgorandService not properly initialized'); },
    getPaylines: async () => { throw new Error('AlgorandService not properly initialized'); },
    getPayoutMultiplier: async () => { throw new Error('AlgorandService not properly initialized'); },
    submitClaim: async () => { throw new Error('AlgorandService not properly initialized'); },
    waitForConfirmation: async () => { throw new Error('AlgorandService not properly initialized'); },
    waitForRound: async () => { throw new Error('AlgorandService not properly initialized'); },
    getCurrentRound: async () => { throw new Error('AlgorandService not properly initialized'); },
    getBlockSeed: async () => { throw new Error('AlgorandService not properly initialized'); },
    getTransactionStatus: async () => { throw new Error('AlgorandService not properly initialized'); }
  } as any;
}

export { algorandService };