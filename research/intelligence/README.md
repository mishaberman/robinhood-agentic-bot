# Research Intelligence Ledger

This directory stores public-safe daily AI research summaries, stock-impact hypotheses, and later fact checks.

Files:

- `daily/<YYYY-MM-DD>.json` - full daily digest, generated assessment, prediction, and new fact checks.
- `predictions.jsonl` - append-only prediction records.
- `fact-checks.jsonl` - append-only outcome checks once prediction review dates pass.
- `external-sources.jsonl` - optional input log for non-SEC source metadata and short original notes.

Do not store full third-party articles, full paywalled content, or full earnings-call transcripts here. Store source, date, URL, title, ticker, and a short original note instead.
