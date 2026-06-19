"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityEntry } from "@umbra/shared";
import { useAccount } from "wagmi";
import { formatUnits } from "../lib/chain";
import { fetchJson } from "../lib/fetch";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";
const POLL_MS = 30_000;

const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6,
  WETH: 18,
};

function truncate(s: string, n = 6) {
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

function formatAmount(raw: string | undefined, token: string | undefined): string | null {
  if (!raw || !token) return null;
  const decimals = TOKEN_DECIMALS[token.toUpperCase()] ?? 18;
  try {
    return formatUnits(BigInt(raw), decimals);
  } catch {
    return null;
  }
}

function formatEntryAmounts(entry: ActivityEntry): string {
  if (entry.type === "deposit") {
    const amount = formatAmount(entry.amount_in, entry.token_in);
    return amount ? `${amount} ${entry.token_in}` : "deposit";
  }

  const amountIn = formatAmount(entry.amount_in, entry.token_in);
  const amountOut = formatAmount(entry.amount_out, entry.token_out);
  if (amountIn && amountOut && entry.token_in && entry.token_out) {
    return `${amountIn} ${entry.token_in} → ${amountOut} ${entry.token_out}`;
  }
  if (amountIn && entry.token_in) {
    return `${amountIn} ${entry.token_in}`;
  }
  return entry.type;
}

function typeBadgeClass(type: ActivityEntry["type"], status?: ActivityEntry["status"]) {
  if (type === "violation" || status === "violation") {
    return "border-red-500/40 text-red-400";
  }
  if (type === "deposit") {
    return "border-umbra-border text-umbra-muted";
  }
  return "border-umbra-accent/40 text-umbra-accent";
}

export function ActivityLedger() {
  const { address, isConnected } = useAccount();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const loadActivity = useCallback(async () => {
    if (!address) {
      setEntries([]);
      return;
    }

    try {
      const { ok, data } = await fetchJson<{ entries?: ActivityEntry[]; error?: string }>(
        `${ORCHESTRATOR}/user/${address}/activity`,
        { timeoutMs: 25_000 },
      );
      if (!ok) throw new Error(data.error ?? "failed to load activity");
      setEntries(data.entries ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("activity request timed out — orchestrator may be busy");
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      loadedOnce.current = true;
      setInitialLoad(false);
    }
  }, [address]);

  useEffect(() => {
    setInitialLoad(true);
    loadActivity();
    if (!address) return;
    const interval = setInterval(loadActivity, POLL_MS);
    return () => clearInterval(interval);
  }, [address, loadActivity]);

  if (!isConnected) {
    return (
      <div className="border-t border-umbra-border px-4 py-4">
        <p className="mb-2 text-xs text-umbra-text">activity</p>
        <p className="text-xs text-umbra-muted">connect wallet</p>
      </div>
    );
  }

  return (
    <div className="border-t border-umbra-border px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-umbra-text">activity</span>
        {initialLoad && <span className="text-[10px] text-umbra-muted">loading…</span>}
      </div>

      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

      {entries.length === 0 && !initialLoad && !error && (
        <p className="text-xs text-umbra-muted">no activity yet</p>
      )}

      <ul className="max-h-48 space-y-2 overflow-y-auto">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className="space-y-1 border border-umbra-border px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`border px-1.5 py-0.5 text-[10px] uppercase ${typeBadgeClass(entry.type, entry.status)}`}
              >
                {entry.type}
              </span>
              {entry.tx_hash && entry.basescan_url && (
                <a
                  href={entry.basescan_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-umbra-accent hover:underline"
                >
                  {truncate(entry.tx_hash)}
                </a>
              )}
            </div>
            <p className="text-xs text-umbra-text">{formatEntryAmounts(entry)}</p>
            {entry.shadow_intent_id && (
              <p className="font-mono text-[10px] text-umbra-muted">
                {truncate(entry.shadow_intent_id, 4)}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
