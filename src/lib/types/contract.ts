export interface ContractConfig {
  appId: number;
  nodeUrl: string;
  indexerUrl: string;
  networkGenesisId: string;
  networkGenesisHash: string;
}

export interface SpinParams {
  betAmount: number;
  maxPaylineIndex: number;
  index: number;
}

export interface BetInfo {
  who: string;
  amount: number;
  maxPaylineIndex: number;
  claimRound: number;
  paylineIndex: number;
}