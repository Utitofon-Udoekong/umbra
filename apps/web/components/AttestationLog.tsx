"use client";

import { useEffect, useState } from "react";
import type { AttestationReport } from "@umbra/shared";
import { useAccount, useReadContract } from "wagmi";
import { BASE_SEPOLIA, ERC20_ABI, formatUnits } from "../lib/chain";
import { fetchJson } from "../lib/fetch";
import { ActivityLedger } from "./ActivityLedger";

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
  const [poolUsdc, setPoolUsdc] = useState<string | null>(null);
  const [userCredit, setUserCredit] = useState<string | null>(null);

  const { data: walletWeth } = useReadContract({
    address: BASE_SEPOLIA.weth,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const active = polled ?? report;

  useEffect(() => {
    async function loadPool() {
      try {
        const { ok, data } = await fetchJson<{
          usdc: string;
          usdc_decimals: number;
          error?: string;
        }>(`${ORCHESTRATOR}/pool/balance`, { timeoutMs: 15_000 });
        if (ok) {
          setPoolUsdc(formatUnits(BigInt(data.usdc), data.usdc_decimals));
        }
      } catch {
        /* ignore */
      }
    }
    loadPool();
    const interval = setInterval(loadPool, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!address) {
      setUserCredit(null);
      return;
    }
    async function loadCredit() {
      try {
        const { ok, data } = await fetchJson<{ credit: string; decimals: number }>(
          `${ORCHESTRATOR}/user/${address}/credit`,
          { timeoutMs: 15_000 },
        );
        if (ok) setUserCredit(formatUnits(BigInt(data.credit), data.decimals));
      } catch {
        /* ignore */
      }
    }
    loadCredit();
    const interval = setInterval(loadCredit, 15_000);
    return () => clearInterval(interval);
  }, [address]);

  useEffect(() => {
    setPolled(null);
  }, [report?.shadow_intent_id]);

  useEffect(() => {
    if (pipelineStep === "committing") {
      setPolled(null);
    }
  }, [pipelineStep]);

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

  const isViolation = active?.status === "violation";
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
            <span className="text-umbra-muted">pool inventory</span>
            <span className="text-umbra-text">{poolUsdc ?? "—"} USDC</span>
          </div>
          {address && (
            <div className="flex justify-between">
              <span className="text-umbra-muted">your credit</span>
              <span className="text-umbra-accent">{userCredit ?? "—"} USDC</span>
            </div>
          )}
          {address && walletWeth !== undefined && (
            <div className="flex justify-between">
              <span className="text-umbra-muted">your wallet</span>
              <span className="text-umbra-text">
                {formatUnits(walletWeth, 18)} WETH
              </span>
            </div>
          )}
          <p className="text-[10px] text-umbra-muted">swap output (WETH) → your wallet</p>
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
            {isViolation && active.violation_message && (
              <p className="text-red-400 font-medium">{active.violation_message}</p>
            )}
          </div>
        ) : (
          <p className="text-umbra-muted">no swap yet</p>
        )}

        <ActivityLedger />
      </div>
    </div>
  );
}
