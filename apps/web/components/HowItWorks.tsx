export function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Connect MetaMask on Base Sepolia",
      body: "Fund your wallet with free test ETH and USDC from public faucets — no operator pre-funding required.",
    },
    {
      n: "2",
      title: "Approve + deposit USDC into the pool",
      body: "You sign approve/deposit in the browser. Credits are tracked per-user inside InstitutionalPool.",
    },
    {
      n: "3",
      title: "Submit unsigned intent with your address",
      body: "Web POSTs token pair, amount, slippage, and userAddress. TEE commits get-dark-quote → execute-fill before any swap.",
    },
    {
      n: "4",
      title: "Router relay settles — WETH to your wallet",
      body: "ROUTER_PRIVATE_KEY calls executeWithAttestation. Pool swaps USDC → WETH via Uniswap V3; recipient is your address.",
    },
  ];

  return (
    <section className="panel mt-8 p-6">
      <h2 className="font-display text-base font-semibold text-umbra-text">How it works</h2>
      <p className="mt-1 text-sm text-umbra-text-dim">
        Retail private swaps: you fund your own USDC. Intent and quote binding stay in the TEE; settlement is a
        router relay (not a mixer — your address appears in calldata and receives WETH). Server keys stay in
        orchestrator <code className="text-umbra-text">.env</code> only.
      </p>

      <ol className="mt-5 grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.n} className="flex gap-3 rounded-lg bg-umbra-bg/50 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-umbra-elevated text-xs font-bold text-emerald-400">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-medium text-umbra-text">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-umbra-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <details className="mt-5 border-t border-umbra-border pt-4">
        <summary className="cursor-pointer text-xs font-medium text-umbra-text-dim">Policy test: SHADOW_VIOLATION</summary>
        <p className="mt-2 text-xs text-umbra-muted">
          After a successful intent, expand attestation and trigger a mempool leak demo — the enclave rejects
          off-plan steps with SHADOW_VIOLATION.
        </p>
      </details>
    </section>
  );
}
