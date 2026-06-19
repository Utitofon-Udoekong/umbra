import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StoredDeposit {
  id: string;
  user_address: string;
  tx_hash: string;
  token: string;
  amount: string;
  saved_at: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEPOSITS_PATH = path.resolve(__dirname, "../../../data/deposits.json");

export class DepositLedger {
  private deposits: StoredDeposit[] = [];

  async load(): Promise<void> {
    try {
      const raw = await readFile(DEPOSITS_PATH, "utf8");
      this.deposits = JSON.parse(raw) as StoredDeposit[];
    } catch {
      this.deposits = [];
    }
  }

  getByUser(userAddress: string): StoredDeposit[] {
    const lower = userAddress.toLowerCase();
    return this.deposits.filter((entry) => entry.user_address.toLowerCase() === lower);
  }

  async save(deposit: StoredDeposit): Promise<void> {
    const existing = this.deposits.findIndex((entry) => entry.id === deposit.id);
    if (existing >= 0) {
      this.deposits[existing] = deposit;
    } else {
      this.deposits.push(deposit);
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(DEPOSITS_PATH), { recursive: true });
    await writeFile(DEPOSITS_PATH, JSON.stringify(this.deposits, null, 2), "utf8");
  }
}
