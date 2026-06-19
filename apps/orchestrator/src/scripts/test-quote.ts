import { quoteExactInputSingle, BASE_SEPOLIA } from "../uniswap-client.js";

const amounts = [10_000n, 100_000n, 300_000n, 500_000n];

for (const amount of amounts) {
  try {
    const quote = await quoteExactInputSingle(BASE_SEPOLIA.usdc, BASE_SEPOLIA.weth, amount);
    console.log(
      `${amount} -> ${quote.buyAmount.toString()} wei WETH (fee ${quote.feeTier})`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${amount} FAIL: ${msg.slice(0, 200)}`);
  }
}
