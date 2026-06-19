export function resolveBaseUrl(override?: string): string {
  const raw =
    override ??
    process.env.ORCHESTRATOR_URL ??
    process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ??
    "http://localhost:3001";
  return raw.replace(/\/$/, "");
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export async function apiRequest<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; data: T }> {
  const timeoutMs = init?.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
    const data = (await res.json()) as T;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new CliError(`request timed out after ${timeoutMs}ms — is the orchestrator running?`);
    }
    throw new CliError(
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

export function failFromResponse(data: unknown, status: number): never {
  const error =
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
      ? (data as { error: string }).error
      : `HTTP ${status}`;
  throw new CliError(error);
}
