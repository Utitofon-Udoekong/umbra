export function formatT3Error(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes("InsufficientCredit") || raw.includes("HTTP 403")) {
    return "T3N credits exhausted — claim more at terminal3.io/claim-page and retry";
  }

  if (raw.includes("HTTP 500") && raw.includes("internal_error")) {
    const idMatch = raw.match(/request_id":"([^"]+)"/);
    const id = idMatch?.[1];
    return id
      ? `T3 platform error (request_id: ${id}) — often caused by low T3N credits or a TEE outage; claim tokens and retry`
      : "T3 platform error — claim T3N credits at terminal3.io/claim-page and retry";
  }

  const line = raw.split("\n")[0]?.trim() || raw;
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}
