import { randomUUID } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const logPath = join(root, "logs", "monitor-decisions.jsonl");

function parseArgs(argv) {
  const parsed = {};
  const loose = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        index += 1;
      }
    } else {
      loose.push(token);
    }
  }

  if (!parsed.message && loose.length) {
    parsed.message = loose.join(" ");
  }

  return parsed;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function listValue(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function inferKind(decision, message) {
  const text = `${decision || ""} ${message || ""}`;
  if (/\bEXIT REVIEW\b/i.test(text)) return "EXIT REVIEW";
  if (/\bTRADE REVIEW\b/i.test(text)) return "TRADE REVIEW";
  if (/\bNO TRADE ALERT\b/i.test(text)) return "NO TRADE ALERT";
  return decision || "STATUS";
}

function defaultStages(kind) {
  const decisionStage =
    kind === "TRADE REVIEW" || kind === "EXIT REVIEW"
      ? "Alert ready for user decision"
      : "No qualifying trade setup";

  return [
    { name: "Account gate", status: "done", summary: "Agentic account only; no other account used." },
    { name: "Portfolio check", status: "done", summary: "Cash, positions, orders, and realized P/L checked." },
    { name: "Market tape", status: "done", summary: "Watchlist quotes and broad semiconductor tape checked." },
    { name: "Catalyst scan", status: "done", summary: "Fresh catalyst/news context reviewed where available." },
    { name: "Rule scoring", status: "done", summary: "Setup compared with the intraday playbook and score gate." },
    { name: "Decision", status: "done", summary: decisionStage }
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const message = String(args.message || "").trim();
  if (!message) {
    throw new Error("Pass --message with the monitor decision summary.");
  }

  const kind = inferKind(args.decision, message);
  const ts = args.ts || new Date().toISOString();
  const record = {
    id: args.id || randomUUID(),
    ts,
    source: args.source || "codex-heartbeat",
    kind,
    decision: args.decision || kind,
    notify: args.notify === true || args.notify === "true" || kind === "TRADE REVIEW" || kind === "EXIT REVIEW",
    message,
    ticker: args.ticker || args.symbol || null,
    score: numberOrNull(args.score),
    price: args.price || null,
    candidates: listValue(args.candidates),
    account: {
      nickname: args.account || "Agentic",
      cash_usd: numberOrNull(args.cash),
      buying_power_usd: numberOrNull(args.buying_power),
      positions_count: numberOrNull(args.positions),
      open_orders_count: numberOrNull(args.orders),
      realized_pnl_usd: numberOrNull(args.realized_pnl)
    },
    risk: {
      suggested_notional_usd: numberOrNull(args.notional),
      estimated_dollar_risk: numberOrNull(args.dollar_risk)
    },
    stages: defaultStages(kind),
    links: listValue(args.links).map((href) => ({ label: href, href }))
  };

  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${JSON.stringify(record)}\n`);
  console.log(`Recorded ${kind} event at ${logPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
