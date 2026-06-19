import { http } from "viem";

const baseRpcUrls = [
  process.env.BASE_SEPOLIA_RPC_URL,
  process.env.BASE_SEPOLIA_RPC_URL_2,
  process.env.BASE_SEPOLIA_RPC_URL_3,
].filter(Boolean) as string[];

const fallbackRpcUrls = [...baseRpcUrls, "https://sepolia.base.org"];

function isRateLimitText(text: string): boolean {
  return /Request exceeds defined limit|rate limit/i.test(text);
}

export function createRpcFallbackFetch(urls: string[]) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown;

    for (const url of urls) {
      try {
        const response = await globalThis.fetch(url.toString(), init);
        const text = await response.clone().text();
        const rateLimited = response.status === 429 || isRateLimitText(text);

        if (rateLimited) {
          lastError = new Error(`RPC rate limited on ${url}`);
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

export function createRpcTransport() {
  return http(fallbackRpcUrls[0], {
    fetchFn: createRpcFallbackFetch(fallbackRpcUrls),
    fetchOptions: { cache: "no-store" },
  });
}

export const BASE_SEPOLIA_RPC_URLS = fallbackRpcUrls;
