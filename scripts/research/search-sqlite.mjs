import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sqlitePath = join(root, "research", "research.sqlite");
const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.error('Usage: npm run research:search -- "HBM inventory margin"');
  process.exit(2);
}

const db = new DatabaseSync(sqlitePath, { readOnly: true });
const rows = db
  .prepare(`
    SELECT ticker, kind, title, path, url, snippet(documents_fts, 3, '[', ']', ' ... ', 24) AS snippet
    FROM documents_fts
    WHERE documents_fts MATCH ?
    ORDER BY rank
    LIMIT 12
  `)
  .all(query);
db.close();

for (const row of rows) {
  console.log(`\n${row.ticker} | ${row.kind} | ${row.title}`);
  console.log(row.snippet.replace(/\s+/g, " ").trim());
  console.log(row.path);
  if (row.url) console.log(row.url);
}
