// Phase 7: Blockchain Integration Types
// Types for Voi Network smart contract interaction

import type algosdk from 'algosdk';

export interface ContractConfig {
  appId: number;
  nodeUrl: string;
  indexerUrl: string;
  networkGenesisId: string;
  networkGenesisHash: string;
}

export interface TransactionParams {
  sender: string;
  suggestedParams: any; // algosdk.SuggestedParams type varies by version
  appId: number;
}

export interface SpinTransaction {
  betAmount: number; // microVOI
  maxPaylineIndex: number;
  index: number;
  extraPayment: number; // For fees
}

export interface SpinResult {
  txId: string;
  betKey: string;
  round: number;
  transactions?: string[]; // For ulujs unsigned transactions
}

export interface BetInfo {
  who: string;
  amount: number;
  maxPaylineIndex: number;
  claimRound: number;
  paylineIndex: number;
}

export interface ClaimResult {
  txId: string;
  payout: number;
  round: number;
}

export interface GridOutcome {
  grid: string[][];
  gridString?: string; // Raw 15-character string from contract
  seed: string;
  round: number;
}

export interface TransactionStatus {
  confirmed: boolean;
  round?: number;
  txId: string;
  error?: string;
}

export interface BlockchainError {
  type: 'NETWORK' | 'CONTRACT' | 'VALIDATION' | 'INSUFFICIENT_FUNDS' | 'UNKNOWN';
  message: string;
  details?: any;
}

// Contract Constants derived from smart contract analysis
export const CONTRACT_CONSTANTS = {
  MIN_BET_AMOUNT: 1_000_000, // 1 VOI
  MAX_BET_AMOUNT: 20_000_000, // 20 VOI  
  MAX_EXTRA_PAYMENT: 1_000_000, // 1 VOI
  MAX_PAYOUT_MULTIPLIER: 1000,
  MIN_BANK_AMOUNT: 100_000_000_000, // 100k VOI
  ROUND_FUTURE_DELTA: 1,
  MAX_CLAIM_ROUND_DELTA: 1000
} as const;

// Network status types
export interface NetworkStatus {
  connected: boolean;
  currentRound: number;
  blockTime?: number;
  lastUpdate: number;
  error?: string;
}

// Transaction history types
export interface TransactionRecord {
  txId: string;
  type: 'spin' | 'claim';
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
  betKey?: string;
  round?: number;
}