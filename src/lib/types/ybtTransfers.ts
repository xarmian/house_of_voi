export interface YBTTransaction {
  round: number;
  intra: number;
  ts: string;
  txid: string;
  direction: 'in' | 'out';
  amount: bigint;
}

export interface YBTTransferTotals {
  in: bigint;
  out: bigint;
  net: bigint;
}

export interface YBTTransfersData {
  transactions: YBTTransaction[];
  totals: YBTTransferTotals;
}

export interface YBTProfitLoss {
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  netDeposited: bigint;
  currentPortfolioValue: bigint;
  profitLoss: bigint;
  profitLossPercentage: number;
  isProfit: boolean;
}

export interface YBTTransfersState {
  transfersData: YBTTransfersData | null;
  profitLoss: YBTProfitLoss | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface GetUserYBTTransfersParams {
  userAddress: string;
  machineAppId: bigint;
  ybtAppId: bigint;
  limit?: number;
  offset?: number;
}