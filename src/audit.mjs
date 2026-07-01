import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

const logDir = new URL("../logs/", import.meta.url);

export async function audit(event, payload = {}) {
  await mkdir(logDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = join(logDir.pathname, `${date}.jsonl`);
  const record = {
    ts: new Date().toISOString(),
    event,
    payload
  };
  await appendFile(file, `${JSON.stringify(record)}\n`);
}
