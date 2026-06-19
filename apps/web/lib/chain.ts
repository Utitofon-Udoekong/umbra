export const BASE_SEPOLIA = {
  chainId: 84532,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const,
  weth: "0x4200000000000000000000000000000000000006" as const,
} as const;

export const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  WETH: 18,
};

export const TOKEN_ADDRESSES: Record<string, `0x${string}`> = {
  USDC: BASE_SEPOLIA.usdc,
  WETH: BASE_SEPOLIA.weth,
};

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

export const POOL_ABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export function formatUnits(raw: bigint, decimals: number): string {
  const base = BigInt(10 ** decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function parseUnits(value: string, decimals: number): bigint {
  const clean = value.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  const whole = parts[0] || "0";
  let frac = parts[1] || "";
  if (parts.length > 2) {
    frac = parts[1];
  }
  if (frac.length > decimals) {
    frac = frac.slice(0, decimals);
  } else {
    frac = frac.padEnd(decimals, "0");
  }
  try {
    return BigInt(whole + frac);
  } catch {
    return BigInt(0);
  }
}

