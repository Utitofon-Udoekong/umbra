import { runShadowFlow } from "../enclave-client.js";

try {
  const result = await runShadowFlow({
    userAddress: process.env.TEST_USER_ADDRESS ?? "0x0000000000000000000000000000000000000001",
    tokenIn: "USDC",
    tokenOut: "WETH",
    amount: "500000",
    maxSlippageBps: 50,
  });
  console.log(
    JSON.stringify(
      { commit: result.commit, quote: result.quote, uniswapQuote: result.uniswapQuote, dualKey: result.dualKey },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("FAILED:", err);
  process.exit(1);
}
