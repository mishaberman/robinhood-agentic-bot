import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const scorecardPath = join(root, "research", "strategy", "watchlist-scorecard.json");
const companiesRoot = join(root, "research", "db", "companies");
const noteHeader = "## Overnight Strategy Notes - 2026-07-01";

async function readTextOrDefault(path, fallback) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return fallback;
  }
}

function bulletList(values) {
  if (!values?.length) return "- n/a";
  return values.map((value) => `- ${value}`).join("\n");
}

function buildNote(ticker, entry) {
  return `${noteHeader}

Role: ${entry.role}
Priority: ${entry.priority}
Theme: ${entry.theme}
Notional bias: ${entry.notional_bias}

Bull triggers:
${bulletList(entry.bull_triggers)}

Confirmation required:
${bulletList(entry.confirmation)}

Disqualifiers:
${bulletList(entry.disqualifiers)}

Source/context notes:
${bulletList(entry.source_notes)}

Monitor instruction:
- Use this note as ticker-specific context only. Do not treat it as a standing order. Require fresh catalyst, clean price action, liquidity, and risk/reward before raising TRADE REVIEW for ${ticker}.
`;
}

async function main() {
  const scorecard = JSON.parse(await readFile(scorecardPath, "utf8"));
  let updated = 0;

  for (const [ticker, entry] of Object.entries(scorecard.symbols || {})) {
    const companyDir = join(companiesRoot, ticker);
    const notesPath = join(companyDir, "management_notes.md");
    await mkdir(companyDir, { recursive: true });

    const fallback = `# ${ticker} Management Notes

Purpose: accumulate original short notes from earnings calls, earnings releases, investor presentations, and material company updates. Do not paste full transcripts or long copyrighted passages.
`;
    const existing = await readTextOrDefault(notesPath, fallback);
    if (existing.includes(noteHeader)) continue;

    const next = `${existing.trim()}

${buildNote(ticker, entry)}
`;
    await writeFile(notesPath, next);
    updated += 1;
  }

  console.log(`Updated ${updated} management note files with strategy notes.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
