import { readFileSync } from "node:fs";
import { AttestationReportSchema } from "@umbra/shared";

const samplePath = process.argv[2];
if (!samplePath) {
  console.error("Usage: verify-attestation <path-to-attestation.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(samplePath, "utf8"));
const parsed = AttestationReportSchema.safeParse(raw);

if (!parsed.success) {
  console.error("Invalid attestation:", parsed.error.flatten());
  process.exit(1);
}

const report = parsed.data;
const cred = report.delegation_credential as { functions?: string[] };
if (!Array.isArray(cred.functions) || cred.functions.length === 0) {
  console.warn("Warning: delegation_credential.functions missing or empty");
}

console.log("Attestation valid.");
console.log("  shadow_intent_id:", report.shadow_intent_id);
console.log("  mrenclave:", report.mrenclave);
console.log("  status:", report.status);
console.log("  route:", report.dark_quote.route_id);
