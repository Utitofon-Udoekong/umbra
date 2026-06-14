"use client";

import { CheckCircleIcon, CpuIcon, LockIcon, ShieldIcon } from "./Icons";

export type PipelineStage = "commit" | "quote" | "attest" | "settle";

const STAGES: { id: PipelineStage; label: string; desc: string }[] = [
  { id: "commit", label: "Commit", desc: "Intent sealed in TEE" },
  { id: "quote", label: "Dark Quote", desc: "Private route pricing" },
  { id: "attest", label: "Attest", desc: "VC + mrenclave proof" },
  { id: "settle", label: "Settle", desc: "Base Sepolia execution" },
];

const STEP_MAP: Record<string, PipelineStage> = {
  committing: "commit",
  quoting: "quote",
  attesting: "attest",
  settling: "settle",
  done: "settle",
};

function stageIndex(stage: PipelineStage | null): number {
  if (!stage) return -1;
  return STAGES.findIndex((s) => s.id === stage);
}

export function Pipeline({
  activeStep,
  completed = false,
  compact = false,
}: {
  activeStep: string | null;
  completed?: boolean;
  compact?: boolean;
}) {
  const current = activeStep ? STEP_MAP[activeStep] ?? null : null;
  const currentIdx = stageIndex(current);
  const allDone = completed || activeStep === "done";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-umbra-text-dim">
            Execution Pipeline
          </span>
          <span className="text-xs text-umbra-muted">
            {allDone ? "Complete" : activeStep ? "Processing…" : "Idle"}
          </span>
        </div>
      )}

      <div className="relative flex items-start justify-between gap-1">
        {/* connector line */}
        <div className="absolute left-[10%] right-[10%] top-5 h-px bg-umbra-border" />
        <div
          className="absolute left-[10%] top-5 h-px bg-emerald-600/70 transition-all duration-500"
          style={{
            width: allDone
              ? "80%"
              : currentIdx >= 0
                ? `${((currentIdx + 0.5) / STAGES.length) * 80}%`
                : "0%",
          }}
        />

        {STAGES.map((stage, i) => {
          const isActive = current === stage.id && !allDone;
          const isComplete = allDone || (currentIdx >= 0 && i < currentIdx);
          const isPending = !isActive && !isComplete;

          return (
            <div key={stage.id} className="relative z-10 flex flex-1 flex-col items-center text-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                  isComplete
                    ? "border-emerald-600/50 bg-emerald-950/30 text-emerald-400"
                    : isActive
                      ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                      : "border-umbra-border bg-umbra-elevated text-umbra-muted"
                }`}
              >
                {isComplete ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : stage.id === "commit" ? (
                  <LockIcon className="h-5 w-5" />
                ) : stage.id === "quote" ? (
                  <ShieldIcon className="h-5 w-5" />
                ) : stage.id === "attest" ? (
                  <CpuIcon className="h-5 w-5" />
                ) : (
                  <CheckCircleIcon className="h-5 w-5" />
                )}
              </div>
              <span
                className={`mt-2 text-xs font-semibold ${
                  isPending ? "text-umbra-muted" : "text-umbra-text"
                }`}
              >
                {stage.label}
              </span>
              {!compact && (
                <span className="mt-0.5 hidden text-[10px] leading-tight text-umbra-text-dim sm:block">
                  {stage.desc}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
