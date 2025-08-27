import algosdk from 'algosdk';
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
// Import BankManager ABI for balance queries
import { APP_SPEC as BankManagerAppSpec } from '../../clients/BankManagerClient.js';

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

const BankManagerABI = {
  name: "BankManager",
  desc: "A simple bank manager contract",
  methods: BankManagerAppSpec.contract.methods,
  events: []
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
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
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

  async getBalances(options?: { appId?: number; addr?: string; sk?: Uint8Array; debug?: boolean }): Promise<{ balanceAvailable: number; balanceTotal: number; balanceLocked: number }> {
    try {
      const appId = options?.appId || this.appId;
      const addr = options?.addr || algosdk.getApplicationAddress(appId);
      const sk = options?.sk || new Uint8Array(64); // Dummy SK for readonly calls

      const acc = { addr, sk };
      const ci = new CONTRACT(appId, this.client, undefined, BankManagerABI, acc);

      if (options?.debug) {
        console.log('🔍 Calling get_balances on contract:', appId);
      }

      const getBalancesR = await ci.get_balances();

      if (!getBalancesR.success) {
        throw new Error(`Contract get_balances failed: ${getBalancesR.error || 'Unknown error'}`);
      }

      if (options?.debug) {
        console.log('Raw balance result:', getBalancesR);
      }

      // check the balance of the contract account
      const contractInfo = await this.client.accountInformation(addr).do();
      const contractBalance = contractInfo.amount / 1e6;

      const balances = this.decodeBalances(getBalancesR.returnValue);
      balances.balanceTotal = contractBalance;
      balances.balanceAvailable = (contractBalance - balances.balanceLocked);

      return balances;

    } catch (error) {
      console.error('💥 getBalances failed:', error);
      throw this.handleError(error, 'Failed to get contract balances');
    }
  }

  private decodeBalances(balances: any): { balanceAvailable: number; balanceTotal: number; balanceLocked: number } {

    const balanceAvailable = balances[0];
    const balanceTotal = balances[1];
    const balanceLocked = balances[2];

    return {
      balanceAvailable: Number(BigInt(balanceAvailable) / BigInt(1e6)),
      balanceTotal: Number(BigInt(balanceTotal) / BigInt(1e6)),
      balanceLocked: Number(BigInt(balanceLocked) / BigInt(1e6)),
    };
  }

  async sendPayment(recipientAddress: string, amount: number): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const { walletStore } = await import('$lib/stores/wallet');
      let currentWallet: any = null;
      
      // Get current wallet state
      walletStore.subscribe(state => {
        currentWallet = state.account;
      })();
      
      if (!currentWallet) {
        throw new Error('No wallet connected');
      }

      // Get suggested transaction parameters
      const params = await this.getSuggestedParams();
      
      // Create payment transaction
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: currentWallet.address,
        to: recipientAddress,
        amount: amount,
        suggestedParams: params,
        note: new TextEncoder().encode('Transfer via House of Voi')
      });

      // Sign the transaction
      const privateKeyBytes = this.hexToUint8Array(currentWallet.privateKey);
      const signedTxn = algosdk.signTransaction(txn, privateKeyBytes);

      // Send the transaction
      const { txId } = await this.client.sendRawTransaction(signedTxn.blob).do();
      
      // Wait for confirmation
      await this.waitForConfirmation(txId);
      
      return {
        success: true,
        txId: txId
      };

    } catch (error) {
      console.error('Payment failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment failed'
      };
    }
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
      //const spinPaylineCost = 30000;
      //const minimumExtraCosts = spinCost + spinPaylineCost * (spinTx.maxPaylineIndex + 1);
      //const totalRequired = spinTx.betAmount + minimumExtraCosts;
      
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

      const spin_costR = await ci.spin_cost();
      if (!spin_costR.success) {
        throw new Error(`Unable to obtain spin cost: ${spin_costR.error || 'Unknown error'}`);
      }

      const spinCost = Number(spin_costR.returnValue);
      const paymentAmount = spinTx.betAmount + spinCost; 

      // Check balances before attempting spin
      await this.checkBalances(senderAccount.address, paymentAmount);

      // Configure CONTRACT instance 
      ci.setEnableRawBytes(true);

      // Set payment amount (calculated above)
      ci.setPaymentAmount(paymentAmount);
      
      console.log('💰 TEAL-compliant Payment calculation:', {
        betAmount: spinTx.betAmount,
        maxPaylineIndex: spinTx.maxPaylineIndex,
        index: spinTx.index,
        spinCost,
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
      console.log('🔑 Simulation txn bet key:', betKeyHex);

      // Get the unsigned transactions from the simulation
      const unsignedTxns = spinR.txns;
      if (!unsignedTxns || unsignedTxns.length === 0) {
        throw new Error('No transactions returned from ulujs simulation');
      }

      // console.log('📄 Got unsigned transactions to submit:', unsignedTxns);

      // Decode the unsigned transactions
      const decodedTxns = unsignedTxns.map((txnBlob: string) => {
        // Decode base64 transaction blob
        const txnBytes = this.base64ToUint8Array(txnBlob);
        return algosdk.decodeUnsignedTransaction(txnBytes);
      });

      // console.log('🔍 Decoded transactions:', decodedTxns);

      // Sign the transactions
      const account = {
        addr: senderAccount.address,
        sk: this.hexToUint8Array(senderAccount.privateKey)
      };

      const signedTxns = decodedTxns.map((txn: algosdk.Transaction) => {
        return algosdk.signTransaction(txn, account.sk);
      });

      console.log(`📝 ${signedTxns.length} transactions signed`);

      // txid of the second transaction
      const appCallTxId = signedTxns[1].txID;

      // Submit the signed transactions as a group
      const submittedGroup = await this.client.sendRawTransaction(signedTxns.map((stxn: {txID: string, blob: string}) => stxn.blob)).do();
      const txId = submittedGroup.txId;
      
      console.log('🚀 Transaction group submitted with ID:', txId);

      // Wait for confirmation with progress feedback
      console.log('⏳ Waiting for transaction confirmation...');
      const confirmedTxn = await this.waitForConfirmation(
        appCallTxId, 
        4,
        (currentRound, maxRounds) => {
          console.log(`⏳ Confirmation progress: ${currentRound}/${maxRounds} rounds`);
        }
      );
      console.log('✅ Transaction confirmed:', confirmedTxn);
      
      // Extract the actual bet key from the confirmed transaction logs
      let actualBetKey = betKeyHex; // fallback to simulated key

      // get the bet key from the confirmed transaction logs
      for (const log of confirmedTxn.logs) {
        // log is already uint8array
        const betKey = Array.from(log as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join('');
        if (betKey.length === 112) {
          // actualBetKey = betKey;
          console.log('🔑 Actual bet key from logs:', betKey);
          break;
        }
      }

      return {
        txId: txId,
        betKey: actualBetKey,
        round: confirmedTxn['confirmed-round'] || 0,
        transactions: signedTxns.map((stxn: {txID: string, blob: string}) => stxn.blob)
      };

    } catch (error) {
      console.error('💥 ulujs spin failed:', error);
      throw this.handleError(error, 'Failed to submit spin transaction');
    }
  }


  /**
   * Generate 5x3 grid from seed using contract reel data (matching contract logic)
   */
  private async generateGridFromSeed(seed: Uint8Array, address: string): Promise<string> {
    const { reelData, reelLength, reelCount, windowLength } = await contractDataCache.getReelData(address);
    
    // Port of _get_reel_tops() - calculate position for each reel
    const maxReelStop = reelLength - (windowLength + 1);
    const reelTops: number[] = [];
    
    for (let reelIndex = 1; reelIndex <= 5; reelIndex++) {
      // Exact port: op.sha256(seed + Bytes(b"1")), etc.
      const reelIdByte = new Uint8Array([0x30 + reelIndex]); // "1" = 0x31, "2" = 0x32, etc.
      const combined = new Uint8Array(seed.length + 1);
      combined.set(seed);
      combined.set(reelIdByte, seed.length);
      
      // Hash to get reel-specific seed
      const hashedSeed = await crypto.subtle.digest('SHA-256', combined);
      const reelSeedBytes = new Uint8Array(hashedSeed);
      
      // Get last 8 bytes and convert to BigUint64 (big endian, as per contract)
      const seedValue = new DataView(reelSeedBytes.buffer, reelSeedBytes.length - 8).getBigUint64(0, false);
      const position = Number(seedValue % BigInt(maxReelStop));
      reelTops.push(position);
    }
    
    // Port of _get_grid() - combine all reel windows
    let grid = '';
    for (let reelIndex = 0; reelIndex < 5; reelIndex++) {
      const reelWindow = this.getReelWindow(reelData, reelIndex, reelTops[reelIndex], reelLength, windowLength);
      grid += reelWindow;
    }
    
    return grid;
  }

  /**
   * Port of _get_reel_window() - get 3-character window from specific reel at given position
   */
  private getReelWindow(reelData: string, reelIndex: number, position: number, reelLength: number, windowLength: number): string {
    // Get the reel data for this specific reel
    const reelStartInFullData = reelIndex * reelLength;
    const reelDataForThisReel = reelData.slice(reelStartInFullData, reelStartInFullData + reelLength);
    
    // Port of contract logic with wrap-around
    let window = '';
    for (let i = 0; i < windowLength; i++) {
      const pos = (position + i) % reelLength;
      window += reelDataForThisReel[pos];
    }
    
    return window;
  }

  /**
   * Get bet grid from the smart contract (authoritative source)
   */
  async getBetGrid(betKey: string, address: string): Promise<string> {
    try {
      console.log('🎲 Getting bet grid for key:', betKey.slice(0, 16) + '...');
      
      // Validate bet key format
      if (!betKey || betKey.length !== 112) {
        throw new Error(`Invalid bet key format: expected 112 hex chars, got ${betKey?.length || 0}`);
      }

      // Validate bet key contains valid hex
      if (!/^[0-9a-fA-F]+$/.test(betKey)) {
        throw new Error('Bet key contains non-hex characters');
      }

      // Get grid directly from contract
      return await this.getBetGridFromContract(betKey, address);

    } catch (error) {
      console.warn('⚠️ Contract grid retrieval failed, falling back to local generation:', error);
      // Fallback to local generation if contract call fails
      return await this.getBetGridLocally(betKey, address);
    }
  }

  /**
   * Get bet grid directly from the smart contract using get_bet_grid method
   */
  async getBetGridFromContract(betKey: string, address: string): Promise<string> {
    const maxRetries = 3;
    const retryDelay = 3000; // 3 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📞 Getting grid from contract (attempt ${attempt}/${maxRetries}) for key:`, betKey.slice(0, 16) + '...');
        
        // Create ulujs CONTRACT instance for readonly call
        const ci = new CONTRACT(
          this.appId,
          this.client,
          undefined, // indexer not needed for readonly call
          slotMachineABI,
          {
            addr: address, // Can use any address for readonly calls
            sk: new Uint8Array(64) // Dummy secret key for readonly calls
          }
        );

        ci.setFee(5000);
        ci.setEnableParamsLastRoundMod(true);

        // Convert bet key to the format expected by contract (Bytes56)
        const betKeyBytes = this.hexStringToUint8Array(betKey);
        
        // Call the contract's get_bet_grid method
        const gridResult = await ci.get_bet_grid(betKeyBytes);
        
        if (!gridResult.success) {
          throw new Error(`Contract get_bet_grid failed: ${gridResult.error || 'Unknown error'}`);
        }

        // The return value should be Bytes15 which converts to a 15-character string
        const gridString = gridResult.returnValue;
        
        console.log(`✅ Got grid from contract:`, gridString);
        
        // Validate the grid string is 15 characters (5 reels x 3 rows)
        if (gridString.length !== 15) {
          throw new Error(`Invalid grid length from contract: expected 15, got ${gridString.length}`);
        }

        return gridString;

      } catch (error: any) {
        console.log(`❌ Contract attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw this.handleError(error, 'Failed to get bet grid from contract after all retry attempts');
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error(`Failed to get bet grid from contract after ${maxRetries} attempts`);
  }

  /**
   * Get bet grid using cached reel data and block seed (preserved for future refinement)
   */
  async getBetGridLocally(betKey: string, address: string): Promise<string> {
    try {
      console.log('🎲 Getting bet grid locally for key:', betKey.slice(0, 16) + '...');
      
      // Validate bet key format
      if (!betKey || betKey.length !== 112) {
        throw new Error(`Invalid bet key format: expected 112 hex chars, got ${betKey?.length || 0}`);
      }

      // Validate bet key contains valid hex
      if (!/^[0-9a-fA-F]+$/.test(betKey)) {
        throw new Error('Bet key contains non-hex characters');
      }

      // First get the bet info to get the claim round
      const betInfo = await this.getBetInfo(betKey);
      
      // Get block seed for the claim round (with retry logic for block commitment)
      const blockSeed = await this.getBlockSeedWithRetry(betInfo.claimRound);
      
      // Generate grid using cached reel data and the same algorithm as the contract
      const betKeyBytes = this.hexStringToUint8Array(betKey);
      
      const combined = new Uint8Array(blockSeed.length + betKeyBytes.length);
      combined.set(blockSeed);
      combined.set(betKeyBytes, blockSeed.length);
      
      // Hash the combined data
      const hashedBytes = await crypto.subtle.digest('SHA-256', combined);
      const seed = new Uint8Array(hashedBytes);
      
      // Generate grid from seed
      const grid = await this.generateGridFromSeed(seed, address);
      
      console.log('✅ Generated grid locally:', grid);
      return grid;

    } catch (error) {
      throw this.handleError(error, 'Failed to get bet grid using local generation');
    }
  }

  /**
   * Get block seed with retry logic for when block isn't committed yet
   */
  private async getBlockSeedWithRetry(round: number): Promise<Uint8Array> {
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Getting block seed for round ${round} (attempt ${attempt}/${maxRetries})`);
        
        const block = await this.client.block(round).do();
        const blockSeed = block.block.seed;
        
        // Handle block seed correctly - it might be Uint8Array or string
        // Contract uses only the last 32 bytes: op.Block.blk_seed(round)[-32:]
        let seedBytes: Uint8Array;
        if (blockSeed instanceof Uint8Array) {
          seedBytes = blockSeed;
        } else if (typeof blockSeed === 'string') {
          // Block seed is base64-encoded, not hex
          seedBytes = this.base64ToUint8Array(blockSeed);
        } else if (Array.isArray(blockSeed)) {
          // If it's an array of numbers, convert to Uint8Array
          seedBytes = new Uint8Array(blockSeed);
        } else {
          throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
        }
        
        // Return only the last 32 bytes to match contract behavior
        const last32Bytes = seedBytes.slice(-32);
        const cleanSeed = new Uint8Array(last32Bytes);
        return cleanSeed;

      } catch (error: any) {
        console.log(`❌ Block seed fetch failed (attempt ${attempt}/${maxRetries}):`, error.message);
        
        // If this was the last attempt, throw the error
        if (attempt === maxRetries) {
          throw new Error(`Failed to get block seed for round ${round} after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error(`Failed to get block seed after ${maxRetries} attempts`);
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
  async getGridOutcome(betKey: string, address: string): Promise<GridOutcome> {
    try {
      // Get the actual grid from the contract
      const gridString = await this.getBetGrid(betKey, address);
      
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

      // Verify the bet key exists first
      /*try {
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
      }*/
      
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
      ci.setFee(32000);
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
   * Wait for transaction confirmation with optimized polling
   */
  async waitForConfirmation(
    txId: string, 
    maxRounds = BLOCKCHAIN_CONFIG.transactionTimeout,
    onProgress?: (currentRound: number, maxRounds: number) => void
  ): Promise<any> {
    try {
      // Use algosdk's built-in waitForConfirmation which is optimized
      const confirmedTxn = await algosdk.waitForConfirmation(this.client, txId, maxRounds);
      return confirmedTxn;
    } catch (error: any) {
      // If algosdk method fails, fall back to custom implementation with faster polling
      console.warn('algosdk.waitForConfirmation failed, using custom implementation:', error.message);
      return await this.waitForConfirmationCustom(txId, maxRounds, onProgress);
    }
  }

  /**
   * Custom confirmation waiting with faster polling as fallback
   */
  private async waitForConfirmationCustom(
    txId: string, 
    maxRounds: number,
    onProgress?: (currentRound: number, maxRounds: number) => void
  ): Promise<any> {
    const startTime = Date.now();
    const startRound = (await this.getSuggestedParams()).firstRound;
    let round = startRound;
    const fastPollInterval = 100; // Poll every 100ms for faster response
    
    while (round < startRound + maxRounds) {
      try {
        const txInfo = await this.client.pendingTransactionInformation(txId).do();
        if (txInfo['confirmed-round']) {
          console.log(`✅ Transaction confirmed in ${Date.now() - startTime}ms`);
          return txInfo;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }
      
      // Update progress if callback provided
      if (onProgress) {
        onProgress(round - startRound, maxRounds);
      }
      
      // Fast polling instead of waiting for full round
      await new Promise(resolve => setTimeout(resolve, fastPollInterval));
      
      // Check if we should move to next round
      const currentRound = await this.getCurrentRound();
      if (currentRound > round) {
        round = currentRound;
      }
    }
    
    throw new Error(`Transaction ${txId} not confirmed after ${maxRounds} rounds (${Date.now() - startTime}ms)`);
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
      const blockSeed = block.block.seed;
      
      // Handle different seed formats and return as hex string
      // Contract uses only the last 32 bytes: op.Block.blk_seed(round)[-32:]
      let bytes: Uint8Array;
      if (typeof blockSeed === 'string') {
        // Block seed is base64-encoded, not hex
        bytes = this.base64ToUint8Array(blockSeed);
      } else if (blockSeed instanceof Uint8Array) {
        bytes = blockSeed;
      } else if (Array.isArray(blockSeed)) {
        bytes = new Uint8Array(blockSeed);
      } else {
        throw new Error(`Unexpected block seed type: ${typeof blockSeed}`);
      }
      
      // Return only the last 32 bytes as hex string to match contract behavior
      // Create a new Uint8Array to avoid buffer view issues
      const last32Bytes = bytes.slice(-32);
      const cleanLast32Bytes = new Uint8Array(last32Bytes);
      return Array.from(cleanLast32Bytes).map(b => b.toString(16).padStart(2, '0')).join('');
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