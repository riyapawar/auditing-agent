import fs from "fs";
import path from "path";
import type { AuditLogEntry } from "./types.js";

// Append-only audit log — entries are never modified or deleted.
// Written as newline-delimited JSON for easy streaming and grep.
export class AuditLog {
  readonly path: string;
  private buffer: AuditLogEntry[] = [];
  private index = new Map<string, AuditLogEntry>(); // "runId|txId|ruleId" → last entry

  constructor(logPath: string) {
    this.path = logPath;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    // Load existing entries into the index for dependency checking
    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry: AuditLogEntry = JSON.parse(line);
          this.index.set(this._key(entry), entry);
        } catch {
          // Skip malformed lines
        }
      }
    }
  }

  append(entry: AuditLogEntry): void {
    this.buffer.push(entry);
    this.index.set(this._key(entry), entry);
  }

  lastEntryFor(runId: string, txId: string, ruleId: string): AuditLogEntry | undefined {
    return this.index.get(`${runId}|${txId}|${ruleId}`);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const lines = this.buffer.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fs.promises.appendFile(this.path, lines, "utf-8");
    this.buffer = [];
  }

  // Read all entries for a specific run
  entriesForRun(runId: string): AuditLogEntry[] {
    if (!fs.existsSync(this.path)) return [];
    const lines = fs.readFileSync(this.path, "utf-8").split("\n").filter(Boolean);
    const entries: AuditLogEntry[] = [];
    for (const line of lines) {
      try {
        const entry: AuditLogEntry = JSON.parse(line);
        if (entry.run_id === runId) entries.push(entry);
      } catch {
        // Skip
      }
    }
    return entries;
  }

  violations(runId: string): AuditLogEntry[] {
    return this.entriesForRun(runId).filter((e) => e.result === "fail");
  }

  private _key(entry: AuditLogEntry): string {
    return `${entry.run_id}|${entry.transaction_id}|${entry.rule_id}`;
  }
}
