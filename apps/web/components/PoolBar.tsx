"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "../lib/chain";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";

interface PoolBalance {
  pool: string;
  chain_id: number;
  usdc: string;
  weth: string;
  usdc_decimals: number;
  weth_decimals: number;
}

interface UserCredit {
  credit: string;
  decimals: number;
}

export function PoolBar() {
  const { address, isConnected } = useAccount();
  const [balance, setBalance] = useState<PoolBalance | null>(null);
  const [userCredit, setUserCredit] = useState<UserCredit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${ORCHESTRATOR}/pool/balance`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load pool");
        setBalance(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!address) {
      setUserCredit(null);
      return;
    }
    async function loadCredit() {
      try {
        const res = await fetch(`${ORCHESTRATOR}/user/${address}/credit`);
        const data = await res.json();
        if (res.ok) setUserCredit(data);
      } catch {
        /* ignore */
      }
    }
    loadCredit();
    const interval = setInterval(loadCredit, 8000);
    return () => clearInterval(interval);
  }, [address]);

  return (
    <section className="panel mb-6 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-umbra-muted">
            Dark pool · Base Sepolia testnet
          </p>
          {balance ? (
            <>
              <p className="mt-1 font-mono text-xs text-umbra-text-dim">{balance.pool}</p>
              <p className="mt-2 text-sm text-umbra-text">
                <span className="text-umbra-text-dim">Pool USDC:</span>{" "}
                {formatUnits(BigInt(balance.usdc), balance.usdc_decimals)}{" "}
                <span className="text-umbra-muted">·</span>{" "}
                <span className="text-umbra-text-dim">Pool WETH:</span>{" "}
                {formatUnits(BigInt(balance.weth), balance.weth_decimals)}
              </p>
              {isConnected && userCredit && (
                <p className="mt-1 text-sm text-emerald-400">
                  Your pool credit: {formatUnits(BigInt(userCredit.credit), userCredit.decimals)} USDC
                </p>
              )}
            </>
          ) : error ? (
            <p className="mt-2 text-sm text-amber-400/90">{error}</p>
          ) : (
            <p className="mt-2 text-sm text-umbra-muted">Loading pool balance…</p>
          )}
        </div>
        <div className="text-xs text-umbra-muted">
          <p>User-funded (zero cost):</p>
          <ul className="mt-1 space-y-0.5">
            <li>
              <a className="text-emerald-400 hover:underline" href="https://faucet.base.org" target="_blank" rel="noreferrer">
                Base Sepolia ETH
              </a>{" "}
              for gas
            </li>
            <li>
              <a className="text-emerald-400 hover:underline" href="https://faucet.circle.com/" target="_blank" rel="noreferrer">
                Circle test USDC
              </a>{" "}
              → deposit in UI
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
