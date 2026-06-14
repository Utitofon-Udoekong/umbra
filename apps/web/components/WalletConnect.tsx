"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { BASE_SEPOLIA } from "../lib/chain";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();

  const wrongChain = isConnected && chainId !== BASE_SEPOLIA.chainId;

  if (!isConnected) {
    const connector = connectors[0];
    return (
      <button
        type="button"
        onClick={() => connector && connect({ connector })}
        disabled={!connector || isPending}
        className="btn-ghost"
      >
        {isPending ? "…" : "connect"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {wrongChain && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: baseSepolia.id })}
          disabled={switching}
          className="border border-amber-600/50 px-2 py-1 text-xs text-amber-400"
        >
          switch network
        </button>
      )}
      <span className="border border-umbra-border px-2.5 py-1 font-mono text-xs text-umbra-muted">
        {truncateAddress(address!)}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="text-xs text-umbra-muted transition-colors hover:text-umbra-text"
      >
        ×
      </button>
    </div>
  );
}
