import type { ActivityEntry } from "@umbra/shared";
import type { Address } from "viem";
import type { StoredDeposit } from "./deposit-ledger.js";
import type { StoredAttestation } from "./ledger.js";
import { getUserSwapEvents } from "./pool-events.js";
import { createSepoliaClient } from "./uniswap-client.js";

const BASESCAN_TX = "https://sepolia.basescan.org/tx/";

export async function buildUserActivity(
  user: Address,
  pool: Address,
  attestations: StoredAttestation[],
  deposits: StoredDeposit[],
): Promise<ActivityEntry[]> {
  const [swapEvents, client] = await Promise.all([
    getUserSwapEvents(user, pool).catch(() => [] as Awaited<ReturnType<typeof getUserSwapEvents>>),
    createSepoliaClient(),
  ]);

  const blockNumbers = [...new Set(swapEvents.map((event) => event.blockNumber))];
  const timestampByBlock = new Map<bigint, number>();
  if (blockNumbers.length > 0) {
    await Promise.all(
      blockNumbers.map(async (blockNumber) => {
        const block = await client.getBlock({ blockNumber });
        timestampByBlock.set(blockNumber, Number(block.timestamp));
      }),
    );
  }

  const attestationByTx = new Map<string, StoredAttestation>();
  const attestationByVc = new Map<string, StoredAttestation>();
  for (const attestation of attestations) {
    if (attestation.settlement_tx_hash) {
      attestationByTx.set(attestation.settlement_tx_hash.toLowerCase(), attestation);
    }
    if (attestation.vc_hash) {
      attestationByVc.set(attestation.vc_hash.toLowerCase(), attestation);
    }
  }

  const entries: ActivityEntry[] = [];
  const coveredTxHashes = new Set<string>();
  const coveredIntentIds = new Set<string>();

  for (const deposit of deposits) {
    coveredTxHashes.add(deposit.tx_hash.toLowerCase());
    entries.push({
      id: deposit.id,
      type: "deposit",
      tx_hash: deposit.tx_hash,
      timestamp: deposit.saved_at,
      token_in: deposit.token,
      amount_in: deposit.amount,
      basescan_url: `${BASESCAN_TX}${deposit.tx_hash}`,
    });
  }

  for (const event of swapEvents) {
    const id = `${event.transactionHash}-${event.logIndex}`;
    const timestamp = timestampByBlock.get(event.blockNumber);

    const attestation =
      attestationByTx.get(event.transactionHash.toLowerCase()) ??
      attestationByVc.get(event.vcHash.toLowerCase());

    if (attestation?.shadow_intent_id) {
      coveredIntentIds.add(attestation.shadow_intent_id);
    }

    entries.push({
      id,
      type: attestation?.status === "violation" ? "violation" : "swap",
      status: attestation?.status === "violation" ? "violation" : "settled",
      tx_hash: event.transactionHash,
      block_number: Number(event.blockNumber),
      timestamp,
      token_in: event.tokenIn,
      token_out: event.tokenOut,
      amount_in: event.amountIn.toString(),
      amount_out: event.amountOut.toString(),
      shadow_intent_id: attestation?.shadow_intent_id,
      mrenclave: attestation?.mrenclave,
      basescan_url: `${BASESCAN_TX}${event.transactionHash}`,
    });
  }

  for (const attestation of attestations) {
    if (attestation.status === "violation") {
      const tx = attestation.settlement_tx_hash?.toLowerCase();
      const alreadyListed = tx && entries.some((entry) => entry.tx_hash?.toLowerCase() === tx);
      if (alreadyListed) continue;

      entries.push({
        id: attestation.shadow_intent_id,
        type: "violation",
        status: "violation",
        tx_hash: attestation.settlement_tx_hash,
        timestamp: attestation.saved_at,
        token_in: attestation.dark_quote.token_in,
        token_out: attestation.dark_quote.token_out,
        amount_in: attestation.dark_quote.sell_amount,
        amount_out: attestation.dark_quote.buy_amount,
        shadow_intent_id: attestation.shadow_intent_id,
        mrenclave: attestation.mrenclave,
        basescan_url: attestation.settlement_tx_hash
          ? `${BASESCAN_TX}${attestation.settlement_tx_hash}`
          : undefined,
      });
      coveredIntentIds.add(attestation.shadow_intent_id);
      continue;
    }

    if (attestation.status === "settled" && !coveredIntentIds.has(attestation.shadow_intent_id)) {
      entries.push({
        id: attestation.shadow_intent_id,
        type: "swap",
        status: "settled",
        tx_hash: attestation.settlement_tx_hash,
        timestamp: attestation.saved_at,
        token_in: attestation.dark_quote.token_in,
        token_out: attestation.dark_quote.token_out,
        amount_in: attestation.dark_quote.sell_amount,
        amount_out: attestation.dark_quote.buy_amount,
        shadow_intent_id: attestation.shadow_intent_id,
        mrenclave: attestation.mrenclave,
        basescan_url: attestation.settlement_tx_hash
          ? `${BASESCAN_TX}${attestation.settlement_tx_hash}`
          : undefined,
      });
      coveredIntentIds.add(attestation.shadow_intent_id);
    }
  }

  entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return entries;
}
