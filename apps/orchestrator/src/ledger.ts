import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AttestationReport } from "@umbra/shared";

export interface StoredAttestation extends AttestationReport {
  vc_hash?: string;
  saved_at?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.resolve(__dirname, "../../../data/attestations.json");

export class AttestationLedger {
  private map = new Map<string, StoredAttestation>();

  async load(): Promise<void> {
    try {
      const raw = await readFile(LEDGER_PATH, "utf8");
      const entries = JSON.parse(raw) as StoredAttestation[];
      for (const entry of entries) {
        this.map.set(entry.shadow_intent_id, entry);
      }
    } catch {
      // start fresh when ledger file is missing
    }
  }

  get(intentId: string): StoredAttestation | undefined {
    return this.map.get(intentId);
  }

  getAll(): StoredAttestation[] {
    return [...this.map.values()];
  }

  getByUser(userAddress: string): StoredAttestation[] {
    const lower = userAddress.toLowerCase();
    return this.getAll().filter((entry) => entry.user_address?.toLowerCase() === lower);
  }

  async save(report: StoredAttestation): Promise<void> {
    this.map.set(report.shadow_intent_id, {
      ...report,
      saved_at: report.saved_at ?? Date.now(),
    });
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(LEDGER_PATH), { recursive: true });
    await writeFile(LEDGER_PATH, JSON.stringify(this.getAll(), null, 2), "utf8");
  }
}
