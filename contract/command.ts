import { Command } from "commander";
import {
  SlotMachineClient,
  APP_SPEC as SlotMachineAppSpec,
} from "./clients/SlotMachineClient.js";

import { BeaconClient } from "./clients/BeaconClient.js";
import { BankManagerClient } from "./clients/BankManagerClient.js";
import { SpinManagerClient } from "./clients/SpinManagerClient.js";
import {
  YieldBearingTokenClient,
  APP_SPEC as YieldBearingTokenAppSpec,
} from "./clients/YieldBearingTokenClient.js";
import algosdk from "algosdk";
import * as algokit from "@algorandfoundation/algokit-utils";
import * as dotenv from "dotenv";
import * as crypto from "crypto";
import { AppSpec } from "@algorandfoundation/algokit-utils/types/app-spec.js";
dotenv.config({ path: ".env" });

export const paylines = [
  [0, 0, 0, 0, 0], // top line
  [1, 1, 1, 1, 1], // middle line
  [2, 2, 2, 2, 2], // bottom line
  [0, 1, 2, 1, 0], // V shape
  [2, 1, 0, 1, 2], // inverted V
  [0, 0, 1, 0, 0], // top-center peak
  [2, 2, 1, 2, 2], // bottom-center valley
  [1, 0, 1, 2, 1], // M shape
  [1, 2, 1, 0, 1], // W shape
  [0, 1, 1, 1, 2],
  [2, 1, 1, 1, 0],
  [0, 1, 2, 2, 2],
  [2, 1, 0, 0, 0],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 2, 2, 2, 1],
  [1, 0, 0, 0, 1],
  [0, 1, 0, 1, 2],
];


export const program = new Command();

const { MN } = process.env;

export const acc = algosdk.mnemonicToSecretKey(MN || "");
export const { addr, sk } = acc;

export const addressses = {
  deployer: addr,
};

export const sks = {
  deployer: sk,
};

// DEVNET
// const ALGO_SERVER = "http://localhost";
// const ALGO_PORT = 4001;
// const ALGO_INDEXER_SERVER = "http://localhost";
// const ALGO_INDEXER_PORT = 8980;

// TESTNET
const ALGO_SERVER = "https://testnet-api.voi.nodely.dev";
const ALGO_INDEXER_SERVER = "https://testnet-idx.voi.nodely.dev";
const ALGO_PORT = 443;
const ALGO_INDEXER_PORT = 443;

// MAINNET
// const ALGO_SERVER = "https://mainnet-api.voi.nodely.dev";
// const ALGO_INDEXER_SERVER = "https://mainnet-idx.voi.nodely.dev";

const algodServerURL = process.env.ALGOD_SERVER || ALGO_SERVER;
const algodServerPort = process.env.ALGOD_PORT || ALGO_PORT;
export const algodClient = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN ||
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  algodServerURL,
  algodServerPort
);

const indexerServerURL = process.env.INDEXER_SERVER || ALGO_INDEXER_SERVER;
const indexerServerPort = process.env.INDEXER_PORT || ALGO_INDEXER_PORT;
export const indexerClient = new algosdk.Indexer(
  process.env.INDEXER_TOKEN || "",
  indexerServerURL,
  indexerServerPort
);


export const fund = async (addr: string, amount: number) => {
  console.log("funding", addr, amount);
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: addressses.deployer,
    to: addr,
    amount: amount,
    suggestedParams: await algodClient.getTransactionParams().do(),
  });
  const signedTxn = algosdk.signTransaction(txn, sks.deployer);
  const res = await algodClient.sendRawTransaction(signedTxn.blob).do();
  await algosdk.waitForConfirmation(algodClient, res.txId, 4);
};

// algod client helpers

export const getAccountBalance = async (addr: string) => {
  const accInfo = await algodClient.accountInformation(addr).do();
  return accInfo.amount;
};

export const getStatus = async () => {
  const status = await algodClient.status().do();
  return status;
};

// indxer client helpers

export const getBlockSeed = async (block: number) => {
  let blockInfo;
  do {
    try {
      blockInfo = await indexerClient.lookupBlock(block).do();
    } catch (e) {}
    if (blockInfo?.seed) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (1);
  return blockInfo?.seed;
};


type DeployType =
  | "SlotMachine"
  | "Beacon"
  | "BankManager"
  | "SpinManager"
  | "YieldBearingToken";

interface DeployOptions {
  type: DeployType;
  name: string;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const deploy: any = async (options: DeployOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = {
    addr,
    sk,
  };
  let Client;
  switch (options.type) {
    case "SlotMachine": {
      Client = SlotMachineClient;
      break;
    }
    case "Beacon": {
      Client = BeaconClient;
      break;
    }
    case "BankManager": {
      Client = BankManagerClient;
      break;
    }
    case "SpinManager": {
      Client = SpinManagerClient;
      break;
    }
    case "YieldBearingToken": {
      Client = YieldBearingTokenClient;
      break;
    }
  }
  const clientParams: any = {
    resolveBy: "creatorAndName",
    findExistingUsing: indexerClient,
    creatorAddress: acc.addr,
    name: options.name || "",
    sender: acc,
  };
  const appClient = Client ? new Client(clientParams, algodClient) : null;
  if (appClient) {
    const app = await appClient.deploy({
      deployTimeParams: {},
      onUpdate: "update",
      onSchemaBreak: "fail",
    });
    return { appId: app.appId, appClient: appClient };
  }
};
program
  .command("deploy")
  .requiredOption("-t, --type <string>", "Specify factory type")
  .requiredOption("-n, --name <string>", "Specify contract name")
  .option("--debug", "Debug the deployment", false)
  .description("Deploy a specific contract type")
  .action(async (options: DeployOptions) => {
    const apid = await deploy(options);
    if (!apid) {
      console.log("Failed to deploy contract");
      return;
    }
    console.log(apid);
  });

interface GetReelsOptions {
  appId: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getReels = async (options: GetReelsOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_reelsR = await appClient.getReels({});
  return get_reelsR;
};

interface GetGridOptions {
  appId: number;
  seed: string; // b64 encoded
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getGrid = async (options: GetGridOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_gridR = await appClient.getGrid({
    seed: new Uint8Array(Buffer.from(options.seed, "base64")),
    staticFee: algokit.microAlgos(2000)
  });
  return get_gridR;
};

interface GetReelOptions {
  appId: number;
  reelIndex: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getReel = async (options: GetReelOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_reelR = await appClient.getReel({
    reel: BigInt(options.reelIndex),
  });
  return get_reelR;
};

interface GetPaylineOptions {
  appId: number;
  paylineIndex: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getPayline = async (options: GetPaylineOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_paylineR = await appClient.getPayline({
    paylineIndex: BigInt(options.paylineIndex),
  });
  return get_paylineR;
};

interface GetReelWindowOptions {
  appId: number;
  reel: number;
  index: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getReelWindow = async (options: GetReelWindowOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_reel_windowR = await appClient.getReelWindow({
    reel: BigInt(options.reel),
    index: BigInt(options.index),
  });
  return get_reel_windowR;
};

interface GetPaylinesOptions {
  appId: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getPaylines = async (options: GetPaylinesOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_paylinesR = await appClient.getPaylines({});
  return get_paylinesR;
};

interface MatchPaylineOptions {
  appId: number;
  grid: any;
  paylineIndex: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const matchPayline = async (options: MatchPaylineOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const match_paylineR = await appClient.matchPayline({
    grid: options.grid,
    paylineIndex: BigInt(options.paylineIndex),
  });
  if (options.debug) {
    console.log(match_paylineR);
  }
  return match_paylineR;
};

interface GetBetClaimRoundOptions {
  appId: number;
  betKey: string;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const getBetClaimRound = async (options: GetBetClaimRoundOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_bet_claim_roundR = await appClient.getBetClaimRound({
    betKey: new Uint8Array(Buffer.from(options.betKey, "hex")),
  });
  return Number(get_bet_claim_roundR.return);
};

interface SpinOptions {
  appId: number;
  betAmount: number;
  maxPaylineIndex: number;
  index: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
  simulate?: boolean;
}

export const invalidBetKey =
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"; // Bytes56()

export const spin = async (options: SpinOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  
  // Get costs
  const spin_costR = await appClient.spinCost({});
  const spin_cost = Number(spin_costR.return);
  const spin_payline_costR = await appClient.spinPaylineCost({});
  const spin_payline_cost = Number(spin_payline_costR.return);
  const total_spin_payline_cost =
    spin_payline_cost * (options.maxPaylineIndex + 1);
  const paymentAmount =
    options.betAmount * (options.maxPaylineIndex + 1) +
    spin_cost +
    total_spin_payline_cost;

  const spinR = await appClient.spin({
    betAmount: BigInt(options.betAmount),
    maxPaylineIndex: BigInt(options.maxPaylineIndex),
    index: BigInt(options.index),
    sendParams: {
      extraProgramPages: 1,
    },
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  }, {
    payment: algokit.microAlgos(paymentAmount),
  });
  
  if (options.debug) {
    console.log(spinR);
  }
  
  return Buffer.from(spinR.return).toString("hex");
};

program
  .command("spin")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-b, --betAmount <number>", "Specify bet amount")
  .requiredOption("-m, --maxPaylineIndex <number>", "Specify max payline index")
  .requiredOption("-i, --index <number>", "Specify index")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the spin", false)
  .option("--simulate", "Simulate the spin", false)
  .action(async (options: SpinOptions) => {
    const appId = Number(options.appId);
    const maxPaylineIndex = Number(options.maxPaylineIndex);
    const betKey = await spin({
      ...options,
      appId,
      betAmount: Number(options.betAmount),
      maxPaylineIndex,
      index: Number(options.index),
    });
    if (betKey === invalidBetKey) {
      return;
    }
    console.log(betKey);
    let getBetGridR;
    do {
      getBetGridR = await getBetGrid({
        ...options,
        appId: Number(options.appId),
        betKey,
      });
      if (getBetGridR.return) {
        displayGrid(getBetGridR.return);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } while (1);
    console.log(getBetGridR.return);
    console.log(getBetGridR.return.length);
    for (let j = 0; j <= maxPaylineIndex; j++) {
      const simulatedMatchPayline = simulateGridPaylineMatch(
        getBetGridR.return,
        paylines[j]
      );
      console.log({ simulatedMatchPayline });
      const matchPaylineR = await matchPayline({
        appId,
        grid: new Uint8Array(Buffer.from(getBetGridR.return)),
        paylineIndex: j,
        ...acc,
      });
      const [matchesBN, initialSymbolBN] = matchPaylineR.return;
      console.log(
        "matches",
        Number(matchesBN),
        "initialSymbol",
        String.fromCharCode(initialSymbolBN)
      );
      if (matchesBN >= BigInt(3)) {
        do {
          const claimR = await claim({
            appId,
            betKey,
            ...acc,
          });
          //if (claimR.success) break;
        } while (1);
        break;
      }
    }
    let i = 0;
    for (const payline of paylines) {
      const matchPaylineR = simulateGridPaylineMatch(
        getBetGridR.return,
        payline
      );
      if (matchPaylineR.matches >= 3) {
        console.log(i++, matchPaylineR);
      }
    }
  });

interface GetBetGridOptions {
  appId: number;
  betKey: string;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
  simulate?: boolean;
}

export const getBetGrid = async (options: GetBetGridOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_bet_gridR = await appClient.getBetGrid({
    betKey: new Uint8Array(Buffer.from(options.betKey, "hex")),
    staticFee: algokit.microAlgos(5000),
  });
  if (options.debug) {
    console.log(get_bet_gridR);
  }
  return get_bet_gridR;
};

interface ClaimOptions {
  appId: number;
  betKey: string;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
  simulate?: boolean;
}

export const claim = async (options: ClaimOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const claimR = await appClient.claim({
    betKey: new Uint8Array(Buffer.from(options.betKey, "hex")),
    staticFee: algokit.microAlgos(5000),
    sendParams: {
      extraProgramPages: 1,
    },
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  });
  if (options.debug) {
    console.log(claimR);
  }
  return claimR;
};

interface GetPayoutMultiplierOptions {
  appId: number;
  symbol: string;
  count: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
  simulate?: boolean;
}

export const getPayoutMultiplier = async (
  options: GetPayoutMultiplierOptions
) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const get_payout_multiplierR = await appClient.getPayoutMultiplier({
    symbol: new Uint8Array(Buffer.from(options.symbol))[0],
    count: BigInt(options.count),
  });
  return get_payout_multiplierR;
};

// simulate reel window
export const simulateReelWindow = (reel: string, index: number) => {
  const reelArray = reel.split("");
  const reelWindow = [];
  for (let i = 0; i < 3; i++) {
    const wrappedIndex = (index + i) % reelArray.length;
    reelWindow.push(reelArray[wrappedIndex]);
  }
  return reelWindow.join("");
};

// simulate grid payline match
export const simulateGridPaylineMatch = (grid: string, payline: number[]) => {
  // grid is 5 x 3 grid of symbols
  // payline is 5 numbers
  // each number an index in the grid column
  const gridArray = grid.split("");
  // split into columns of 3
  const columns: string[][] = [];
  for (let i = 0; i < gridArray.length; i += 3) {
    columns.push(gridArray.slice(i, i + 3));
  }
  // get symbols along the payline
  const paylineSymbols = payline.map(
    (rowIndex, colIndex) => columns[colIndex][rowIndex]
  );

  // count consecutive matching symbols from left to right
  let matches = 1; // Start with 1 since we're counting symbols, not pairs
  for (let i = 0; i < paylineSymbols.length - 1; i++) {
    if (paylineSymbols[i] === paylineSymbols[i + 1]) {
      matches++;
    } else {
      break; // Stop counting when we hit a non-match
    }
  }
  if (paylineSymbols[0] === "_") {
    return { matches: 0, initialSymbol: "_" };
  }
  // return the number of matches and initial symbol
  return { matches, initialSymbol: paylineSymbols[0] };
};

// Display the grid in a readable format ie 5 x 3 grid
// Display the grid in a readable format ie 5 x 3 grid
// from C0_0 C0_1 C0_2 C1_0 C1_1 C1_2 C2_0 C2_1 C2_2 C3_0 C3_1 C3_2 C4_0 C4_1 C4_2
// to
// C0_0 C1_0 C2_0 C3_0 C4_0
// C0_1 C1_1 C2_1 C3_1 C4_1
// C0_2 C1_2 C2_2 C3_2 C4_2

export const displayGrid = (grid: string) => {
  const row1 = grid[0] + grid[3] + grid[6] + grid[9] + grid[12];
  const row2 = grid[1] + grid[4] + grid[7] + grid[10] + grid[13];
  const row3 = grid[2] + grid[5] + grid[8] + grid[11] + grid[14];
  console.log(row1);
  console.log(row2);
  console.log(row3);
};

// generate random 32 byte seed
export const generateSeed = () => {
  return crypto.randomBytes(32);
};

// Beacon

interface TouchOptions {
  appId: number;
  addr: string;
  sk: Uint8Array;
  debug?: boolean;
}

export const touch = async (options: TouchOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new BeaconClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const txn = await appClient.touch({});
  if (options.debug) {
    console.log(txn);
  }
  return txn;
};

// bank

interface DepositOptions {
  appId: number;
  amount: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const deposit: any = async (options: DepositOptions) => {
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const depositR = await appClient.deposit({
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  }, {
    payment: algokit.microAlgos(options.amount),
  });
  if (options.debug) {
    console.log(depositR);
  }
  return true;
};

interface WithdrawOptions {
  appId: number;
  amount: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const withdraw: any = async (options: WithdrawOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const withdrawR = await appClient.withdraw({
    amount: BigInt(options.amount),
    staticFee: algokit.microAlgos(2000),
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  });
  if (options.debug) {
    console.log(withdrawR);
  }
  return true;
};

// common

interface BootstrapOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const bootstrap: any = async (options: BootstrapOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const bootstrap_costR = await appClient.bootstrapCost({});
  const bootstrap_cost = Number(bootstrap_costR.return);
  const bootstrapR = await appClient.bootstrap({
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  }, {
    payment: algokit.microAlgos(bootstrap_cost),
  });
  if (options.debug) {
    console.log(bootstrapR);
  }
  return true;
};

program
  .command("bootstrap")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the bootstrap", false)
  .option("--simulate", "Simulate the bootstrap", false)
  .action(async (options: BootstrapOptions) => {
    const success = await bootstrap({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to bootstrap");
    }
  });

interface GetOwnerOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
}

export const getOwner: any = async (options: GetOwnerOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const ownerR = await appClient.getOwner({});
  if (options.debug) {
    console.log(ownerR);
  }
  return ownerR.return;
};

program
  .command("get-owner")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the get-owner", false)
  .action(async (options: GetOwnerOptions) => {
    const owner = await getOwner({
      ...options,
      appId: Number(options.appId),
    });
    console.log(owner);
  });

// yield bearing token

interface BootstrapCostOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
}

export const bootstrapCost: any = async (options: BootstrapCostOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const bootstrap_costR = await appClient.bootstrapCost({});
  return bootstrap_costR.return;
};

interface YBTDepositOptions {
  appId: number;
  amount: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const ybtDeposit: any = async (options: YBTDepositOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const ybt_balanceR = await appClient.arc200BalanceOf({ address: acc.addr });
  const ybt_balance = ybt_balanceR.return;
  console.log("ybt_balance", ybt_balance);
  const ybt_deposit_costR = await appClient.depositCost({});
  const ybt_deposit_cost = Number(ybt_deposit_costR.return);
  console.log("ybt_deposit_cost", ybt_deposit_cost);
  const paymentAmount =
    Number(options.amount) +
    (Number(ybt_balance) === 0 ? ybt_deposit_cost : 0);
  console.log("paymentAmount", paymentAmount);
  
  const ybt_depositR = await appClient.deposit({
    staticFee: algokit.microAlgos(4000),
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  }, {
    payment: algokit.microAlgos(paymentAmount),
  });
  if (options.debug) {
    console.log(ybt_depositR);
  }
  return true;
};

program
  .command("ybt-deposit")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-b, --amount <number>", "Specify amount")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the ybt-deposit", false)
  .option("--simulate", "Simulate the ybt-deposit", false)
  .action(async (options: YBTDepositOptions) => {
    const success = await ybtDeposit({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to deposit ybt");
    }
  });

interface YBTWithdrawOptions {
  appId: number;
  amount: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const ybtWithdraw: any = async (options: YBTWithdrawOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const ybt_withdrawR = await appClient.withdraw({
    amount: BigInt(options.amount),
    staticFee: algokit.microAlgos(5000),
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  });
  if (options.debug) {
    console.log(ybt_withdrawR);
  }
  return true;
};

program
  .command("ybt-withdraw")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-b, --amount <number>", "Specify amount")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the ybt-withdraw", false)
  .option("--simulate", "Simulate the ybt-withdraw", false)
  .action(async (options: YBTWithdrawOptions) => {
    const success = await ybtWithdraw({
      ...options,
      appId: Number(options.appId),
      amount: Number(options.amount),
    });
    if (!success) {
      console.log("Failed to withdraw ybt");
    }
  });

interface SetYieldBearingSourceOptions {
  appId: number;
  source: number;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const setYieldBearingSource: any = async (
  options: SetYieldBearingSourceOptions
) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const set_yield_bearing_sourceR = await appClient.setYieldBearingSource({
    appId: BigInt(options.source),
    staticFee: algokit.microAlgos(2000),
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  });
  if (options.debug) {
    console.log(set_yield_bearing_sourceR);
  }
  return true;
};

program
  .command("set-yield-bearing-source")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-s, --source <number>", "Specify source")
  .option("-t, --sender <string>", "Specify sender")
  .option("--debug", "Debug the set-yield-bearing-source", false)
  .option("--simulate", "Simulate the set-yield-bearing-source", false)
  .action(async (options: SetYieldBearingSourceOptions) => {
    const success = await setYieldBearingSource({
      ...options,
      appId: Number(options.appId),
      source: Number(options.source),
    });
    if (!success) {
      console.log("Failed to set yield bearing source");
    }
  });

// arc200

interface Arc200NameOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
}

export const arc200Name: any = async (options: Arc200NameOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const arc200_nameR = await appClient.arc200Name({});
  return arc200_nameR.return;
};

interface Arc200SymbolOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
}

export const arc200Symbol: any = async (options: Arc200SymbolOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const arc200_symbolR = await appClient.arc200Symbol({});
  return arc200_symbolR.return;
};

interface Arc200DecimalsOptions {
  appId: number;
  addr: string;
  sk: any;
  debug?: boolean;
}

export const arc200Decimals: any = async (options: Arc200DecimalsOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const arc200_decimalsR = await appClient.arc200Decimals({});
  return arc200_decimalsR.return;
};

interface Arc200BalanceOfOptions {
  appId: number;
  address: string;
  sender: string;
  sk: any;
  debug?: boolean;
}

export const arc200BalanceOf: any = async (options: Arc200BalanceOfOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new YieldBearingTokenClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const balanceOfR = await appClient.arc200BalanceOf({ address: options.address });
  return balanceOfR.return;
};

// ownable

interface TransferOwnershipOptions {
  appId: number;
  newOwner: string;
  addr: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const transferOwnership: any = async (
  options: TransferOwnershipOptions
) => {
  const addr = options.addr || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const appClient = new SlotMachineClient(
    {
      resolveBy: "id",
      id: Number(options.appId),
      sender: acc,
    },
    algodClient
  );
  const transferOwnershipR = await appClient.transferOwnership({
    newOwner: options.newOwner,
    ...(options.simulate ? {} : { sendParams: { suppressLog: false } }),
  });
  if (options.debug) {
    console.log(transferOwnershipR);
  }
  return true;
};

program
  .command("transfer-ownership")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-n, --newOwner <string>", "Specify new owner")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the transfer-ownership", false)
  .option("--simulate", "Simulate the transfer-ownership", false)
  .action(async (options: TransferOwnershipOptions) => {
    const success = await transferOwnership({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to transfer ownership");
    }
  });
