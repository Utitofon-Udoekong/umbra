# Umbra

**Shield trade intent in the TEE until execution.**

Umbra is a Terminal 3 (T3N) hackathon submission: users commit trade plans inside a TEE WASM contract before Uniswap V3 settlement on Base Sepolia. Deviations return `SHADOW_VIOLATION`.

## Monorepo

| Package | Role |
|---------|------|
| `packages/t3-contract` | Rust WASM enclave (real TEE) |
| `apps/orchestrator` | Express API + `@terminal3/t3n-sdk` |
| `apps/web` | MetaMask swap UI (wagmi) |
| `packages/evm-contracts` | `InstitutionalPool.sol` on Base Sepolia |
| `packages/shared` | Attestation Zod schemas |

## Zero-cost setup (operator)

1. Claim T3N sandbox key at [terminal3.io/claim-page](https://www.terminal3.io/claim-page)
2. Copy `.env.example` → `.env` and set `T3N_API_KEY`
3. Generate `ROUTER_PRIVATE_KEY`; fund with free ETH from [faucet.base.org](https://faucet.base.org)
4. `pnpm install`
5. `pnpm build:contract`
6. `pnpm setup:umbra` — register WASM + KV maps (`CONTRACT_VERSION=0.2.4`)
7. `pnpm skill:deploy-pool` — deploy pool to Base Sepolia (breaking change vs pre-retail pool)
8. Set `INSTITUTIONAL_POOL_ADDRESS` in `.env`
9. `pnpm dev` — web `:3000` + orchestrator `:3001`

## User flow (retail private swaps)

1. Connect MetaMask on Base Sepolia (chain 84532)
2. Faucet ETH + Circle test USDC to **your wallet**
3. Approve + deposit USDC in the web UI (credits your per-user pool balance)
4. Submit swap intent (includes `userAddress`)
5. TEE commits plan and binds Uniswap quote before settlement
6. Router relay settles on-chain — **WETH arrives in your wallet**

Privacy: intent + quote binding in TEE; settlement tx is a router relay (your address is in calldata — not mixer-style unlinkability).

## How swaps work

- Users deposit their own test USDC into `InstitutionalPool` (per-user credits)
- Web submits unsigned intent JSON with `userAddress` (no server keys in browser)
- TEE enclave: `commit-trade` → bind Uniswap quote → `execute-fill`
- Orchestrator pre-checks pool credit, then router calls `executeWithAttestation(user, …)`
- Uniswap V3 swap on Base Sepolia — WETH recipient is the user wallet

## SDK surfaces used

- `T3nClient` handshake / authenticate (self-grant or dual-key)
- `TenantClient` claim, register, maps, execute
- `agent-auth-update` on committed steps
- `buildDelegationCredential` for VC payload
- `getAuditEvents` in attestation response
- Rust WASM with `kv-store`, `tenant-context`, step verification

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm smoke` | SDK handshake test |
| `pnpm build:contract` | Compile WASM |
| `pnpm setup:umbra` | Register contract + KV maps |
| `pnpm dev` | Start web + orchestrator |
| `pnpm skill:deploy-pool` | Deploy pool to Base Sepolia |
| `pnpm skill:fund-pool` | Operator deposit (dev/testing only) |
| `pnpm skill:pool-balance` | Read aggregate pool USDC/WETH |
| `pnpm skill:user-credit` | Read per-user pool credit |
| `pnpm skill:verify-enclave` | Validate attestation JSON |

## Identity

**Single-key default:** only `T3N_API_KEY` required (self-grant). Optional `AGENT_KEY` for separate routing agent DID.

## Architecture

Intent flows: Web (MetaMask deposit) → Orchestrator → T3 WASM (commit → bind quote → fill) → VC → Base Sepolia pool → Uniswap V3 → user wallet.
