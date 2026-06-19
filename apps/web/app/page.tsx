"use client";

import { useState } from "react";
import type { AttestationReport } from "@umbra/shared";
import { AttestationLog } from "../components/AttestationLog";
import { Header } from "../components/Header";
import { TransactionUI } from "../components/TransactionUI";

type Step = "idle" | "committing" | "quoting" | "attesting" | "settling" | "done" | "error";

export default function Home() {
  const [attestation, setAttestation] = useState<
    (AttestationReport & { vc_hash?: string }) | null
  >(null);
  const [pipelineStep, setPipelineStep] = useState<Step>("idle");

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 pb-20 pt-8">
      <Header />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <TransactionUI
          onAttestation={setAttestation}
          onClearAttestation={() => setAttestation(null)}
          activeStep={pipelineStep}
          onStepChange={setPipelineStep}
        />
        <AttestationLog report={attestation} pipelineStep={pipelineStep} />
      </div>
    </main>
  );
}
