"use client";

import { useState } from "react";
import type { AttestationReport } from "@umbra/shared";
import { useAccount } from "wagmi";
import { DepositStep } from "./DepositStep";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";

const AMOUNTS = [
  { label: "0.1", value: "100000" },
  { label: "0.5", value: "500000" },
  { label: "1", value: "1000000" },
];

type Tab = "deposit" | "swap";
type Step = "idle" | "committing" | "quoting" | "attesting" | "settling" | "done" | "error";

export function TransactionUI({
  onAttestation,
  activeStep,
  onStepChange,
}: {
  onAttestation: (report: AttestationReport & { vc_hash?: string }) => void;
  activeStep: Step;
  onStepChange: (step: Step) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const [tab, setTab] = useState<Tab>("swap");
  const [amount, setAmount] = useState("500000");
  const [maxSlippage, setMaxSlippage] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [depositReady, setDepositReady] = useState(false);

  const isProcessing = activeStep !== "idle" && activeStep !== "done" && activeStep !== "error";
  const onBaseSepolia = chainId === 84532;
  const canSubmit = isConnected && onBaseSepolia && depositReady && Boolean(address);

  async function submitIntent() {
    if (!address) return;
    setError(null);
    onStepChange("committing");
    try {
      onStepChange("quoting");
      const res = await fetch(`${ORCHESTRATOR}/intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          tokenIn: "USDC",
          tokenOut: "WETH",
          amount,
          maxSlippageBps: maxSlippage,
        }),
      });
      onStepChange("attesting");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "failed");
      onStepChange("settling");
      onAttestation(data);
      onStepChange("done");
    } catch (err) {
      onStepChange("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
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
          <DepositStep requiredAmount={amount} onReadyChange={setDepositReady} />
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs text-umbra-muted">token</label>
              <div className="input-field flex items-center justify-between text-umbra-muted">
                <span>USDC → WETH</span>
                <span className="text-umbra-muted">▾</span>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-xs text-umbra-muted">amount</label>
              <div className="relative px-2">
                <div className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-umbra-border" />
                <div className="relative flex justify-between">
                  {AMOUNTS.map((preset) => {
                    const active = amount === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setAmount(preset.value)}
                        disabled={isProcessing}
                        className="flex flex-col items-center gap-2"
                      >
                        <span
                          className={`h-3 w-3 rounded-full border transition-all ${
                            active
                              ? "border-umbra-accent bg-umbra-accent shadow-glow"
                              : "border-umbra-muted bg-black"
                          }`}
                        />
                        <span className={`text-xs ${active ? "text-umbra-accent" : "text-umbra-muted"}`}>
                          {preset.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
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

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
