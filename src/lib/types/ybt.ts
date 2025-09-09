export interface YBTState {
  userShares: bigint;
  totalSupply: bigint;
  sharePercentage: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface YBTStateWithTransfers extends YBTState {
  transfersLoading: boolean;
  transfersError: string | null;
  profitLoss: {
    totalDeposited: bigint;
    totalWithdrawn: bigint;
    netDeposited: bigint;
    currentPortfolioValue: bigint;
    profitLoss: bigint;
    profitLossPercentage: number;
    isProfit: boolean;
  } | null;
}

export interface YBTGlobalState {
  totalSupply: bigint;
  name: string;
  symbol: string;
  decimals: number;
  yieldBearingSource: number;
  owner: string;
}

export interface YBTTransactionResult {
  txId: string;
  sharesReceived?: bigint;
  amountWithdrawn?: bigint;
  success: boolean;
  error?: string;
}

export interface YBTDepositParams {
  amount: bigint;
}

export interface YBTWithdrawParams {
  shares: bigint;
}