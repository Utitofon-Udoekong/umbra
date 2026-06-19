"use client";

const BASESCAN = "https://sepolia.basescan.org/tx/";

export type ActionNoticePayload = {
  kind: "success" | "error";
  message: string;
  txHash?: string;
};

function truncateHash(hash: string) {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function ActionNotice({
  notice,
  onDismiss,
}: {
  notice: ActionNoticePayload | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;

  const tone = notice.kind === "success" ? "status-ok" : "status-error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 left-1/2 z-50 flex w-[min(100%-2.5rem,28rem)] -translate-x-1/2 items-start justify-between gap-3 border bg-umbra-bg px-4 py-3 text-xs shadow-lg ${tone}`}
    >
      <div className="min-w-0 flex-1">
        <p>{notice.message}</p>
        {notice.txHash && (
          <a
            href={`${BASESCAN}${notice.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-umbra-accent hover:underline"
          >
            {truncateHash(notice.txHash)}
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-umbra-muted hover:text-umbra-text"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
