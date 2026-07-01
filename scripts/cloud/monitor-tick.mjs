import { createHash, randomUUID } from "node:crypto";
import { runAgent } from "../../src/agent.mjs";
import { config } from "../../src/config.mjs";
import { applyTursoSchema, createTursoClient, logActivity } from "./turso-common.mjs";

function alertKind(outputText) {
  if (/\bEXIT REVIEW\b/i.test(outputText)) return "EXIT REVIEW";
  if (/\bTRADE REVIEW\b/i.test(outputText)) return "TRADE REVIEW";
  return null;
}

function extractTicker(outputText) {
  const labeled = outputText.match(/\b(?:symbol|ticker)\s*[:=-]\s*\$?([A-Z][A-Z0-9.-]{0,8})\b/i);
  if (labeled) return labeled[1].toUpperCase();

  const headed = outputText.match(/\b(?:TRADE REVIEW|EXIT REVIEW)\b\s*[:=-]?\s*\$?([A-Z][A-Z0-9.-]{0,8})\b/i);
  return headed ? headed[1].toUpperCase() : null;
}

function extractScore(outputText) {
  const match = outputText.match(/\bscore\s*[:=-]\s*(\d{1,3})\b/i);
  if (!match) return null;
  const score = Number(match[1]);
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
}

function titleFor(kind, ticker, outputText) {
  const firstLine = outputText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (ticker) return `${kind}: ${ticker}`;
  return firstLine ? firstLine.slice(0, 160) : kind;
}

function dedupeKey(kind, ticker, outputText) {
  const window = new Date();
  window.setUTCMinutes(Math.floor(window.getUTCMinutes() / 5) * 5, 0, 0);
  const digest = createHash("sha256").update(outputText.slice(0, 2000)).digest("hex").slice(0, 16);
  return [kind, ticker || "UNKNOWN", window.toISOString(), digest].join(":");
}

async function notifyWebhook(alert) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(alert)
  });

  if (!response.ok) {
    throw new Error(`Alert webhook failed: ${response.status} ${response.statusText}`);
  }
}

async function insertRun(client, run) {
  await client.execute({
    sql: `INSERT INTO monitor_runs (id, started_at, finished_at, status, model, prompt, output_text, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        finished_at = excluded.finished_at,
        status = excluded.status,
        output_text = excluded.output_text,
        error = excluded.error`,
    args: [
      run.id,
      run.startedAt,
      run.finishedAt || null,
      run.status,
      config.model,
      run.prompt,
      run.outputText || null,
      run.error || null
    ]
  });
}

async function insertAlert(client, alert) {
  await client.execute({
    sql: `INSERT OR IGNORE INTO alerts (
      id, created_at, kind, ticker, score, title, body, status, dedupe_key, source_run_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    args: [
      alert.id,
      alert.created_at,
      alert.kind,
      alert.ticker,
      alert.score,
      alert.title,
      alert.body,
      alert.dedupe_key,
      alert.source_run_id
    ]
  });
}

const prompt = `
Run one cloud monitor tick for the Robinhood Agentic account.

Use only the Agentic account with agentic_allowed=true. Do not place orders or cancel orders.

Check portfolio value, buying power, open equity positions, open equity orders, today's realized P/L, and current quotes for ${config.watchlist.join(", ")}.

Focus on semiconductors, memory/storage, AI infrastructure, and SpaceX/Starlink/launch/satellite-supply-chain-adjacent movers: aerospace components, avionics, sensors, power semiconductors, satellite data, optical/networking, storage, AI cloud, and ground infrastructure.

If no setup meets a high bar, start the response with "NO TRADE ALERT".
If an entry is worth attention, start with "TRADE REVIEW" and include symbol, score, current/as-of price, catalyst/source summary, entry trigger/zone, invalidation/stop area, take-profit zone, suggested max notional, and estimated dollar risk.
If an existing position needs attention, start with "EXIT REVIEW" and include symbol, reason, stop/profit-taking area, and risk notes.

This is analysis and alerting only, not a guarantee or personalized financial/tax advice.
`.trim();

async function main() {
  const client = createTursoClient();
  const run = {
    id: randomUUID(),
    startedAt: new Date().toISOString(),
    status: "running",
    prompt
  };

  try {
    await applyTursoSchema(client);
    await insertRun(client, run);

    const response = await runAgent(prompt);
    const outputText = response.output_text || JSON.stringify(response.output || [], null, 2);
    const finishedAt = new Date().toISOString();

    await insertRun(client, {
      ...run,
      finishedAt,
      status: "ok",
      outputText
    });

    const kind = alertKind(outputText);
    if (kind) {
      const ticker = extractTicker(outputText);
      const alert = {
        id: randomUUID(),
        created_at: finishedAt,
        kind,
        ticker,
        score: extractScore(outputText),
        title: titleFor(kind, ticker, outputText),
        body: outputText,
        dedupe_key: dedupeKey(kind, ticker, outputText),
        source_run_id: run.id
      };
      await insertAlert(client, alert);
      await logActivity(client, {
        id: randomUUID(),
        createdAt: finishedAt,
        category: "monitor",
        action: "alert_created",
        summary: `${kind}${ticker ? ` for ${ticker}` : ""}${alert.score !== null ? `, score ${alert.score}` : ""}.`,
        details: {
          alert_id: alert.id,
          kind,
          ticker,
          score: alert.score,
          source_run_id: run.id
        },
        source: "scripts/cloud/monitor-tick.mjs"
      });
      await notifyWebhook(alert);
      console.log(`${kind}${ticker ? ` ${ticker}` : ""} stored in Turso.`);
    } else {
      await logActivity(client, {
        id: randomUUID(),
        createdAt: finishedAt,
        category: "monitor",
        action: "no_trade_alert",
        summary: "Monitor run completed without a trade or exit alert.",
        details: { source_run_id: run.id },
        source: "scripts/cloud/monitor-tick.mjs"
      });
      console.log("No trade alert stored; monitor run logged in Turso.");
    }
  } catch (error) {
    await insertRun(client, {
      ...run,
      finishedAt: new Date().toISOString(),
      status: "error",
      error: error.message
    }).catch(() => {});
    await logActivity(client, {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      category: "monitor",
      action: "monitor_error",
      summary: `Monitor run failed: ${error.message}`,
      details: { source_run_id: run.id },
      source: "scripts/cloud/monitor-tick.mjs"
    }).catch(() => {});
    throw error;
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
