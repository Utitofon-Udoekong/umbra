import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const rpcUrls = [
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL,
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL_2,
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL_3,
].filter(Boolean) as string[];

const defaultRpcUrls = [
  ...rpcUrls,
  "https://base-sepolia-rpc.publicnode.com",
  "https://sepolia.base.org",
];

function createRpcFallbackFetch(urls: string[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown;

    for (const url of urls) {
      try {
        const response = await globalThis.fetch(url.toString(), init);
        const text = await response.clone().text();
        const rateLimited =
          response.status === 429 ||
          /Request exceeds defined limit|rate limit/i.test(text);

        if (rateLimited) {
          lastError = new Error(`RPC rate limited at ${url}`);
          continue;
        }

        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError ?? new Error("All RPC endpoints failed");
  };
}

const rpcUrl = defaultRpcUrls[0];

export const customBaseSepolia = {
  ...baseSepolia,
  rpcUrls: {
    ...baseSepolia.rpcUrls,
    default: {
      http: defaultRpcUrls,
    },
    public: {
      http: defaultRpcUrls,
    },
  },
};

export const wagmiConfig = createConfig({
  chains: [customBaseSepolia],
  connectors: [injected()],
  transports: {
    [customBaseSepolia.id]: http(rpcUrl, {
      fetch: createRpcFallbackFetch(defaultRpcUrls),
      fetchOptions: { cache: "no-store" },
    }),
  },
  ssr: true,
});
