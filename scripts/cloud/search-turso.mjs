import { createTursoClient } from "./turso-common.mjs";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.error('Usage: npm run cloud:search -- "HBM inventory margin"');
  process.exit(2);
}

async function main() {
  const client = createTursoClient();
  try {
    const result = await client.execute({
      sql: `SELECT ticker, kind, title, path, url, snippet(documents_fts, 4, '[', ']', ' ... ', 24) AS snippet
        FROM documents_fts
        WHERE documents_fts MATCH ?
        ORDER BY rank
        LIMIT 12`,
      args: [query]
    });

    for (const row of result.rows) {
      console.log(`\n${row.ticker} | ${row.kind} | ${row.title}`);
      console.log(String(row.snippet || "").replace(/\s+/g, " ").trim());
      if (row.path) console.log(row.path);
      if (row.url) console.log(row.url);
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
