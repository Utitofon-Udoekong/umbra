"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttestationReport } from "@umbra/shared";
import { useAccount } from "wagmi";
import { ActionNotice, type ActionNoticePayload } from "./ActionNotice";
import { DepositStep } from "./DepositStep";
import { parseUnits, TOKEN_DECIMALS } from "../lib/chain";
import { fetchJson } from "../lib/fetch";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";

function formatSwapError(raw: string): string {
  const line = raw.split("\n")[0]?.trim() || raw;
  if (line.includes("T3N credits") || line.includes("InsufficientCredit")) {
    return "T3N credits exhausted — claim more at terminal3.io/claim-page";
  }
  if (line.includes("internal_error") || line.includes("T3 platform error")) {
    return line.length > 200 ? `${line.slice(0, 200)}…` : line;
  }
  if (line.includes("Uniswap quote failed")) {
    return "Uniswap quote failed — check orchestrator is running with latest Base Sepolia addresses";
  }
  if (line.length > 200) {
    return `${line.slice(0, 200)}…`;
  }
  return line;
}

type Tab = "deposit" | "swap";
type Step = "idle" | "committing" | "quoting" | "attesting" | "settling" | "done" | "error";

export function TransactionUI({
  onAttestation,
  onClearAttestation,
  activeStep,
  onStepChange,
}: {
  onAttestation: (report: AttestationReport & { vc_hash?: string }) => void;
  onClearAttestation?: () => void;
  activeStep: Step;
  onStepChange: (step: Step) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const [tab, setTab] = useState<Tab>("swap");
  const [amount, setAmount] = useState("0.5");
  const [maxSlippage, setMaxSlippage] = useState(50);
  const [routingMode, setRoutingMode] = useState<"secure" | "public">("secure");
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("WETH");
  const [error, setError] = useState<string | null>(null);
  const [depositReady, setDepositReady] = useState(false);

  const tokenInDecimals = TOKEN_DECIMALS[tokenIn] ?? 6;
  const [notice, setNotice] = useState<ActionNoticePayload | null>(null);

  const showNotice = useCallback((payload: ActionNoticePayload) => {
    setNotice(payload);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const ms = notice.kind === "success" ? 12_000 : 20_000;
    const timer = setTimeout(() => setNotice(null), ms);
    return () => clearTimeout(timer);
  }, [notice]);

  const isProcessing = activeStep !== "idle" && activeStep !== "done" && activeStep !== "error";
  const onBaseSepolia = chainId === 84532;
  const canSubmit = isConnected && onBaseSepolia && depositReady && Boolean(address);

  async function submitIntent() {
    if (!address) return;
    setError(null);
    onClearAttestation?.();
    onStepChange("committing");
    try {
      onStepChange("quoting");
      const { ok, data } = await fetchJson<AttestationReport & { vc_hash?: string; error?: string }>(
        `${ORCHESTRATOR}/intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: address,
            tokenIn,
            tokenOut,
            amount: parseUnits(amount, tokenInDecimals).toString(),
            maxSlippageBps: maxSlippage,
            simulateViolation: routingMode === "public",
          }),
          timeoutMs: 180_000,
        },
      );
      if (!ok) throw new Error(data.error ?? "failed");

      if (data.status === "violation") {
        onStepChange("error");
        const msg = data.violation_message || "Compliance Blocked: Enclave policy violation.";
        setError(msg);
        onAttestation(data);
        showNotice({ kind: "error", message: msg });
        return;
      }

      onStepChange("attesting");
      onStepChange("settling");
      onAttestation(data);
      onStepChange("done");
      const txHash = data.settlement_tx_hash ?? data.base_tx_hash;
      showNotice({
        kind: "success",
        message: `Swap settled — ${amount} ${tokenIn} → ${tokenOut}`,
        txHash,
      });
    } catch (err) {
      onStepChange("error");
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[umbra/swap]", raw);
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "swap timed out — check orchestrator logs and try again"
          : formatSwapError(raw);
      setError(message);
      showNotice({ kind: "error", message });
    }
  }

  function resetSwap() {
    setError(null);
    onStepChange("idle");
  }

  return (
  <>
    <div className="panel">
      <div className="grid grid-cols-2 border-b border-umbra-border">
        <button
          type="button"
          onClick={() => setTab("deposit")}
          className={`py-3 text-center text-sm font-medium transition-colors ${tab === "deposit" ? "tab-active" : "tab-inactive"}`}
        >
          deposit
        </button>
        <button
          type="button"
          onClick={() => setTab("swap")}
          className={`py-3 text-center text-sm font-medium transition-colors ${tab === "swap" ? "tab-active" : "tab-inactive"}`}
        >
          swap
        </button>
      </div>

      <div className="p-5">
        {tab === "deposit" ? (
          <DepositStep
            requiredAmount={amount}
            tokenSymbol={tokenIn}
            onReadyChange={setDepositReady}
            onActionNotice={showNotice}
          />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs text-umbra-muted">route</label>
              <div className="input-field flex items-center justify-between text-umbra-muted">
                <span>{tokenIn} → {tokenOut}</span>
                <span className="text-[10px] text-umbra-muted">Base Sepolia</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs text-umbra-muted">amount ({tokenIn})</label>
              <input
                className="input-field"
                type="text"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div>
              <label className="mb-2 block text-xs text-umbra-muted">
                slippage {(maxSlippage / 100).toFixed(2)}%
              </label>
              <input
                type="range"
                min={1}
                max={500}
                value={maxSlippage}
                onChange={(e) => setMaxSlippage(Number(e.target.value))}
                disabled={isProcessing}
                className="h-px w-full cursor-pointer appearance-none bg-umbra-border accent-umbra-accent"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs text-umbra-muted">routing path</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRoutingMode("secure")}
                  className={`flex-1 border py-2 text-center text-xs transition-colors ${
                    routingMode === "secure"
                      ? "border-umbra-accent text-umbra-accent bg-umbra-accent/10"
                      : "border-umbra-border text-umbra-muted hover:border-umbra-text-dim"
                  }`}
                  disabled={isProcessing}
                >
                  <span className="font-semibold block">Private TEE</span>
                  <span className="text-[9px] opacity-70">Anti-MEV Shield</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoutingMode("public")}
                  className={`flex-1 border py-2 text-center text-xs transition-colors ${
                    routingMode === "public"
                      ? "border-red-500/50 text-red-400 bg-red-950/20"
                      : "border-umbra-border text-umbra-muted hover:border-umbra-text-dim"
                  }`}
                  disabled={isProcessing}
                >
                  <span className="font-semibold block">Public Mempool</span>
                  <span className="text-[9px] opacity-70 text-red-400/80">Unshielded (Triggers Block)</span>
                </button>
              </div>
            </div>

            {isProcessing && (
              <p className="text-center text-xs text-umbra-accent animate-pulse">{activeStep}…</p>
            )}

            <button
              type="button"
              onClick={submitIntent}
              disabled={isProcessing || !canSubmit}
              className="btn-primary"
            >
              {!isConnected
                ? "connect"
                : !depositReady
                  ? "deposit first"
                  : isProcessing
                    ? "…"
                    : "swap"}
            </button>

            {activeStep === "done" && !error && (
              <div className="status-banner status-ok">
                <span>swap settled on Base Sepolia</span>
              </div>
            )}

            {error && (
              <div className="space-y-2">
                <p className="max-h-24 overflow-y-auto break-words text-xs text-red-400">{error}</p>
                <button type="button" onClick={resetSwap} className="btn-ghost w-full py-2">
                  reset
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
  </>
  );
}
