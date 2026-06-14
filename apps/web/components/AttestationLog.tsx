"use client";

import { useEffect, useState } from "react";
import type { AttestationReport } from "@umbra/shared";
import { useAccount } from "wagmi";
import { formatUnits } from "../lib/chain";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";
const BASESCAN = "https://sepolia.basescan.org/tx/";

function truncate(s: string, n = 8) {
  if (s.length <= n * 2 + 1) return s;
  return `${s.slice(0, n)}…${s.slice(-n)}`;
}

export function AttestationLog({
  report,
  pipelineStep,
}: {
  report: (AttestationReport & { vc_hash?: string }) | null;
  pipelineStep: string | null;
}) {
  const { address } = useAccount();
  const [polled, setPolled] = useState<AttestationReport | null>(null);
  const [violation, setViolation] = useState<string | null>(null);
  const [violating, setViolating] = useState(false);
  const [poolUsdc, setPoolUsdc] = useState<string | null>(null);
  const [poolWeth, setPoolWeth] = useState<string | null>(null);
  const [userCredit, setUserCredit] = useState<string | null>(null);

  const active = polled ?? report;

  useEffect(() => {
    async function loadPool() {
      try {
        const res = await fetch(`${ORCHESTRATOR}/pool/balance`);
        const data = await res.json();
        if (res.ok) {
          setPoolUsdc(formatUnits(BigInt(data.usdc), data.usdc_decimals));
          setPoolWeth(formatUnits(BigInt(data.weth), data.weth_decimals));
        }
      } catch {
        /* ignore */
      }
    }
    loadPool();
    const interval = setInterval(loadPool, 10_000);
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
        if (res.ok) setUserCredit(formatUnits(BigInt(data.credit), data.decimals));
      } catch {
        /* ignore */
      }
    }
    loadCredit();
    const interval = setInterval(loadCredit, 8000);
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    if (!report?.shadow_intent_id) return;
    const id = report.shadow_intent_id;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${ORCHESTRATOR}/attestation/${id}`);
        if (res.ok) setPolled(await res.json());
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [report?.shadow_intent_id]);

  async function simulateLeak() {
    if (!active?.shadow_intent_id) return;
    setViolating(true);
    try {
      const res = await fetch(`${ORCHESTRATOR}/violation/${active.shadow_intent_id}`, {
        method: "POST",
      });
      const data = await res.json();
      setViolation(data.violation_message ?? "SHADOW_VIOLATION");
    } finally {
      setViolating(false);
    }
  }

  const isViolation = active?.status === "violation" || Boolean(violation);
  const txHash = active?.settlement_tx_hash ?? active?.base_tx_hash;

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between border-b border-umbra-border px-4 py-3">
        <span className="text-sm text-umbra-text">statistics</span>
        {active && (
          <span
            className={`border px-2 py-0.5 text-[10px] uppercase ${
              isViolation
                ? "border-red-500/40 text-red-400"
                : "border-umbra-accent/40 text-umbra-accent"
            }`}
          >
            {isViolation ? "violation" : active.status}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 p-4 text-xs">
        <div className="space-y-2 border-b border-umbra-border pb-4">
          <div className="flex justify-between">
            <span className="text-umbra-muted">pool usdc</span>
            <span className="text-umbra-text">{poolUsdc ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-umbra-muted">pool weth</span>
            <span className="text-umbra-text">{poolWeth ?? "—"}</span>
          </div>
          {address && (
            <div className="flex justify-between">
              <span className="text-umbra-muted">your credit</span>
              <span className="text-umbra-accent">{userCredit ?? "—"} USDC</span>
            </div>
          )}
        </div>

        {pipelineStep && pipelineStep !== "idle" && pipelineStep !== "done" && !active && (
          <p className="text-umbra-accent">{pipelineStep}</p>
        )}

        {active ? (
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-umbra-muted">quote</span>
              <span className="text-umbra-text">
                {active.dark_quote.buy_amount ?? active.dark_quote.price} WETH
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-umbra-muted">intent</span>
              <span className="font-mono text-umbra-muted">{active.shadow_intent_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-umbra-muted">mrenclave</span>
              <span className="font-mono text-umbra-muted">{truncate(active.mrenclave, 6)}</span>
            </div>
            {txHash && (
              <div className="flex justify-between">
                <span className="text-umbra-muted">tx</span>
                <a
                  href={`${BASESCAN}${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-umbra-accent hover:underline"
                >
                  {truncate(txHash, 6)}
                </a>
              </div>
            )}
            {(violation || active.violation_message) && (
              <p className="text-red-400">{violation ?? active.violation_message}</p>
            )}

            <button
              type="button"
              onClick={simulateLeak}
              disabled={violating || isViolation}
              className="mt-2 w-full border border-red-900/50 py-2 text-[10px] text-red-400/80 transition-colors hover:border-red-500/50 disabled:opacity-30"
            >
              {violating ? "…" : "test violation"}
            </button>
          </div>
        ) : (
          <p className="text-umbra-muted">no activity</p>
        )}
      </div>
    </div>
  );
}
