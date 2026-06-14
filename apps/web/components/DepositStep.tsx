"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { BASE_SEPOLIA, ERC20_ABI, POOL_ABI, formatUnits } from "../lib/chain";

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:3001";
const BASESCAN = "https://sepolia.basescan.org/tx/";
const USDC_DECIMALS = 6;

type TxPhase = "idle" | "awaiting_wallet" | "pending" | "confirming" | "success" | "error";
type TxAction = "approve" | "deposit" | null;

function truncateHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function logDeposit(event: string, detail?: unknown) {
  if (detail !== undefined) {
    console.log(`[umbra/deposit] ${event}`, detail);
  } else {
    console.log(`[umbra/deposit] ${event}`);
  }
}

function logDepositError(event: string, err: unknown) {
  console.error(`[umbra/deposit] ${event}`, err);
}

function getErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "shortMessage" in err &&
    typeof (err as { shortMessage: unknown }).shortMessage === "string"
  ) {
    return (err as { shortMessage: string }).shortMessage;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function DepositStep({
  requiredAmount,
  onReadyChange,
}: {
  requiredAmount: string;
  onReadyChange: (ready: boolean) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const [poolAddress, setPoolAddress] = useState<`0x${string}` | null>(null);
  const [poolCredit, setPoolCredit] = useState<bigint | null>(null);
  const [depositAmount, setDepositAmount] = useState(requiredAmount);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [action, setAction] = useState<TxAction>(null);
  const [phase, setPhase] = useState<TxPhase>("idle");

  const {
    writeContract,
    data: txHash,
    isPending,
    isError: writeError,
    error: writeErr,
    reset,
  } = useWriteContract();

  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptError,
    error: receiptErr,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const { data: walletBalance, refetch: refetchBalance, isLoading: balanceLoading } =
    useReadContract({
      address: BASE_SEPOLIA.usdc,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: address ? [address] : undefined,
      query: { enabled: Boolean(address) },
    });

  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: allowanceLoading,
  } = useReadContract({
    address: BASE_SEPOLIA.usdc,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && poolAddress ? [address, poolAddress] : undefined,
    query: { enabled: Boolean(address && poolAddress) },
  });

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch(`${ORCHESTRATOR}/health`);
      const data = await res.json();
      if (data.pool && data.pool !== "not_deployed") {
        setPoolAddress(data.pool as `0x${string}`);
      }
    } catch (err) {
      logDepositError("pool health fetch failed", err);
    }
  }, []);

  const loadCredit = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${ORCHESTRATOR}/user/${address}/credit`);
      const data = await res.json();
      if (res.ok) setPoolCredit(BigInt(data.credit));
    } catch (err) {
      logDepositError("credit fetch failed", err);
    }
  }, [address]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  useEffect(() => {
    loadCredit();
    const interval = setInterval(loadCredit, 8000);
    return () => clearInterval(interval);
  }, [loadCredit]);

  useEffect(() => {
    setDepositAmount(requiredAmount);
  }, [requiredAmount]);

  const required = BigInt(requiredAmount || "0");
  const credit = poolCredit ?? BigInt(0);
  const hasCredit = credit >= required && required > BigInt(0);
  const onBaseSepolia = chainId === BASE_SEPOLIA.chainId;

  useEffect(() => {
    onReadyChange(Boolean(isConnected && onBaseSepolia && hasCredit));
  }, [isConnected, onBaseSepolia, hasCredit, onReadyChange]);

  // wagmi write errors (reject, RPC, etc.)
  useEffect(() => {
    if (!writeError || !writeErr) return;
    const msg = getErrorMessage(writeErr);
    logDepositError(`${action ?? "tx"} write failed`, writeErr);
    setPhase("error");
    setStatusMsg(msg);
    setAction(null);
  }, [writeError, writeErr, action]);

  // receipt errors
  useEffect(() => {
    if (!receiptError || !receiptErr) return;
    const msg = receiptErr.message;
    logDepositError(`${action ?? "tx"} receipt failed`, receiptErr);
    setPhase("error");
    setStatusMsg(msg);
    setAction(null);
  }, [receiptError, receiptErr, action]);

  // phase transitions from wagmi state
  useEffect(() => {
    if (phase === "error" || phase === "success") return;
    if (isPending) {
      setPhase("pending");
      setStatusMsg("broadcasting…");
    } else if (confirming && txHash) {
      setPhase("confirming");
      setStatusMsg("waiting for confirmation…");
    }
  }, [isPending, confirming, txHash, phase]);

  useEffect(() => {
    if (!isSuccess || !txHash) return;

    const label = action === "approve" ? "approve confirmed" : "deposit confirmed";
    logDeposit(label, { hash: txHash });
    setPhase("success");
    setStatusMsg(label);

    refetchBalance();
    refetchAllowance();
    loadCredit();
    reset();

    const timer = setTimeout(() => {
      setPhase("idle");
      setStatusMsg(null);
      setAction(null);
    }, 4000);

    return () => clearTimeout(timer);
  }, [isSuccess, txHash, action, refetchBalance, refetchAllowance, loadCredit, reset]);

  async function handleApprove() {
    if (!poolAddress || !address) return;
    setPhase("awaiting_wallet");
    setAction("approve");
    setStatusMsg("confirm in metamask");
    logDeposit("approve requested", { spender: poolAddress, amount: depositAmount });

    try {
      writeContract({
        address: BASE_SEPOLIA.usdc,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [poolAddress, BigInt(depositAmount)],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logDepositError("approve threw", err);
      setPhase("error");
      setStatusMsg(msg);
      setAction(null);
    }
  }

  async function handleDeposit() {
    if (!poolAddress) return;
    setPhase("awaiting_wallet");
    setAction("deposit");
    setStatusMsg("confirm in metamask");
    logDeposit("deposit requested", { pool: poolAddress, amount: depositAmount });

    try {
      writeContract({
        address: poolAddress,
        abi: POOL_ABI,
        functionName: "deposit",
        args: [BASE_SEPOLIA.usdc, BigInt(depositAmount)],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logDepositError("deposit threw", err);
      setPhase("error");
      setStatusMsg(msg);
      setAction(null);
    }
  }

  let depositBn = BigInt(0);
  try {
    depositBn = BigInt(depositAmount || "0");
  } catch {
    depositBn = BigInt(0);
  }

  const allowanceReady = allowance !== undefined;
  const needsApprove = allowanceReady && allowance < depositBn;
  const busy = phase === "awaiting_wallet" || isPending || confirming;
  const insufficientBalance =
    walletBalance !== undefined && walletBalance < depositBn && depositBn > BigInt(0);

  if (!isConnected) {
    return <p className="text-umbra-muted">connect wallet</p>;
  }

  if (!onBaseSepolia) {
    return <p className="text-amber-400">switch to base sepolia</p>;
  }

  if (!poolAddress) {
    return <p className="text-umbra-muted">pool offline</p>;
  }

  const statusTone =
    phase === "error"
      ? "status-error"
      : phase === "success"
        ? "status-ok"
        : phase === "awaiting_wallet"
          ? "status-warn"
          : busy
            ? "status-pending"
            : "status-idle";

  return (
    <div className="space-y-5">
      <div className="flex justify-between text-xs">
        <span className="text-umbra-muted">wallet</span>
        <span className="text-umbra-text">
          {balanceLoading ? "…" : walletBalance !== undefined ? formatUnits(walletBalance, USDC_DECIMALS) : "—"}{" "}
          USDC
        </span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-umbra-muted">credit</span>
        <span className={hasCredit ? "text-umbra-accent" : "text-umbra-text"}>
          {formatUnits(credit, USDC_DECIMALS)} USDC
        </span>
      </div>

      {allowanceLoading && (
        <p className="text-xs text-umbra-muted">reading allowance…</p>
      )}

      {insufficientBalance && !hasCredit && (
        <p className="text-xs text-amber-400">
          insufficient USDC — get test tokens from circle faucet
        </p>
      )}

      {!hasCredit && (
        <>
          <div>
            <label className="mb-2 block text-xs text-umbra-muted">amount (base units)</label>
            <input
              className="input-field"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              disabled={busy}
            />
          </div>

          {statusMsg && (
            <div className={`status-banner ${statusTone}`}>
              <span>{statusMsg}</span>
              {txHash && (phase === "pending" || phase === "confirming" || phase === "success") && (
                <a
                  href={`${BASESCAN}${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-umbra-accent hover:underline"
                >
                  {truncateHash(txHash)}
                </a>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {(needsApprove || !allowanceReady) && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy || depositBn === BigInt(0) || allowanceLoading}
                className="btn-ghost flex-1 py-2.5 disabled:opacity-40"
              >
                {action === "approve" && busy ? "approving…" : "approve"}
              </button>
            )}
            <button
              type="button"
              onClick={handleDeposit}
              disabled={
                busy ||
                depositBn === BigInt(0) ||
                needsApprove ||
                !allowanceReady ||
                insufficientBalance
              }
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {action === "deposit" && busy ? "depositing…" : "deposit"}
            </button>
          </div>
        </>
      )}

      {hasCredit && <p className="text-xs text-umbra-accent">funded — switch to swap</p>}
    </div>
  );
}
