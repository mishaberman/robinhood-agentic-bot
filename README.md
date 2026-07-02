# Robinhood Agentic Bot

This is a cautious live-account scaffold for Robinhood Agentic Trading through the Robinhood MCP server:

`https://agent.robinhood.com/mcp/trading`

It is designed to move quickly on read-only analysis while requiring human confirmation before live orders. It will not try to autonomously turn $2,000 into $3,000. A 50% short-term target implies very high risk, and fast intraday trading can lose the whole account.

## What It Does

- Connects an OpenAI Responses agent to Robinhood's remote MCP server.
- Uses Robinhood market/account tools for quotes, historical bars, indicators, scans, positions, portfolio, tradability, and order review.
- Defaults to no live order placement tools.
- If live order tools are enabled, every `place_*` or `cancel_*` approval requires an exact typed confirmation.
- Instructs the agent to use only the Robinhood Agentic account and stop if account identity is ambiguous.
- Keeps an append-only audit log in `logs/`.

Robinhood says the MCP can read all connected Robinhood account data, while trade placement is limited to the Agentic account. Robinhood also says you remain responsible for AI-agent trades. See:

- [Robinhood Agentic Trading overview](https://robinhood.com/us/en/support/articles/agentic-trading-overview/)
- [Trading with your agent](https://robinhood.com/us/en/support/articles/trading-with-your-agent/)
- [OpenAI MCP and Connectors guide](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)

## Setup

```bash
cd /Users/mishaberman/Documents/Codex/2026-06-30/cre/outputs/robinhood-agentic-bot
npm install
cp .env.example .env
```

Fill in `OPENAI_API_KEY`.

For Robinhood auth, the easiest path is usually to add the MCP server to Codex or ChatGPT and authenticate there. For direct API use, set `ROBINHOOD_OAUTH_ACCESS_TOKEN` only if your MCP auth flow gives you a bearer token.

Codex CLI setup:

```bash
codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading
```

Codex app setup:

Settings -> MCP servers -> Streamable HTTP -> `https://agent.robinhood.com/mcp/trading`

## Run

One-shot scan:

```bash
npm run scan -- "Scan my watchlist for intraday setups. Do not place orders."
```

Interactive chat:

```bash
npm run chat
```

Live monitor loop:

```bash
npm run monitor
```

## Local Laptop Mode

If cloud deployment feels like too much, the practical setup is:

1. Leave this Mac awake, online, and plugged in.
2. Leave Codex open and authenticated to the Robinhood MCP server.
3. Let the Codex heartbeat automation run the 5-minute monitor during the market window.
4. Let the same heartbeat update `reports/daily/YYYY-MM-DD.md` after the close.

Start a timed keep-awake session:

```bash
npm run local:keep-awake
```

Stop it:

```bash
npm run local:stop-awake
```

This is simpler than the cloud path, but it depends on the laptop staying awake and connected.

## Research Database

The project includes a local research base under `research/db/` for the semiconductor, AI-hardware, storage, and SpaceX/space-supply-chain-adjacent watchlist.

Refresh SEC filings, company facts, and generated trend summaries:

```bash
npm run research:build
```

Search the local full-text index:

```bash
npm run research:search -- "HBM inventory margin"
```

Useful files:

- `research/db/README.md` links to each company summary.
- `research/research.sqlite` is a local SQLite/FTS search index over company summaries, notes, and stored SEC filing text.
- `research/db/companies/<TICKER>/trend_summary.md` is regenerated from SEC facts and recent filings.
- `research/db/companies/<TICKER>/management_notes.md` is persistent and intended for short original notes from calls, releases, and investor presentations.
- `research/db/companies/<TICKER>/earnings_sources.json` stores recent SEC earnings-release candidates and transcript/source metadata.
- `research/db/companies/<TICKER>/sec_filings/full_text_index.json` indexes locally stored SEC filing documents.
- `research/db/companies/<TICKER>/sec_filings/full_text/*.txt` stores extracted plain text from public SEC 10-K, 10-Q, 20-F, 6-K, and earnings-related 8-K primary documents.
- `research/db/companies/<TICKER>/sec_filings/raw_html/*.html` stores the corresponding raw SEC filing HTML.

The database intentionally does not copy full earnings-call transcripts or paywalled article text from third-party publishers. Store source links and short notes instead.

## Daily AI Intelligence Ledger

The project also keeps a public-safe daily intelligence ledger for watchlist companies. It turns SEC filings, trend summaries, management notes, and short logged source notes from news/transcript/research sources into:

- a daily company-level summary;
- an estimated stock-impact note;
- a falsifiable price/catalyst hypothesis with a review date;
- a later mechanical fact check against price movement once the review date arrives.

Generate today's ledger:

```bash
npm run research:ai-daily
```

Build the public dashboard export:

```bash
npm run dashboard:build
```

Useful files:

- `research/intelligence/daily/<YYYY-MM-DD>.json` stores the full daily source digest, summary, prediction, and same-day fact-check additions.
- `research/intelligence/predictions.jsonl` is the append-only hypothesis log.
- `research/intelligence/fact-checks.jsonl` is the append-only prediction review log.
- `research/intelligence/external-sources.jsonl` is the optional source-metadata input for third-party headlines, transcript links, Seeking Alpha metadata, TechCrunch links, investor-relations pages, and other non-SEC sources.
- `docs/data/intelligence.json` is the compact public dashboard export.

If `OPENAI_API_KEY` is present, `npm run research:ai-daily` uses the configured model for summaries. Without that key, it falls back to a deterministic summary so the ledger and dashboard still update, and marks the mode clearly.

## Strategy Pack

The monitor also has a slow-thinking strategy layer under `research/strategy/`:

- `current-catalyst-map-2026-07-01.md` maps current thesis clusters and source-backed catalyst logic.
- `intraday-action-playbook.md` defines alert, exit, and re-entry rules.
- `watchlist-scorecard.json` ranks the watchlist and gives compact trigger/disqualifier rules.

The active Codex heartbeat monitor is configured to consult this pack before raising `TRADE REVIEW` or `EXIT REVIEW`.

Each 5-minute monitor run also updates the public-safe dashboard snapshot when new account, quote, research, or decision data is available. It must call Robinhood `get_accounts` first, use only the Agentic account, and never place or cancel orders.

## Turso Cloud Database

Turso is used as the cloud copy of the research database plus monitor/alert history. Keep credentials in environment variables or your cloud host's secret manager:

```bash
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=...
```

Initialize the remote schema:

```bash
npm run cloud:init
```

Push the current local research index into Turso:

```bash
npm run cloud:push-research
```

Refresh SEC research locally and push the new snapshot:

```bash
npm run cloud:research-refresh
```

Search the Turso full-text index:

```bash
npm run cloud:search -- "ASML advanced-node capacity"
```

Run one cloud-shaped monitor tick and store the result in Turso:

```bash
npm run cloud:monitor-tick
```

The cloud tick exits after one scan so it can run under GitHub Actions, Render Cron, Supabase scheduling, or another scheduler. It writes every run to `monitor_runs`, writes `TRADE REVIEW` / `EXIT REVIEW` outputs to `alerts`, writes decision breadcrumbs to `activity_log`, and can POST those alerts to `ALERT_WEBHOOK_URL` as generic JSON.

## Daily Logs And Writeups

Best workflow:

1. Use Turso as the source of truth for structured records: monitor runs, alerts, research refreshes, errors, and report metadata.
2. Generate a Markdown daily report after market close.
3. Use a website/dashboard for browsing reports and stats over time.
4. Export or paste selected daily reports into Google Docs only when you want a polished narrative or shareable article draft.

Generate today's daily report:

```bash
npm run cloud:daily-report
```

Generate a specific date:

```bash
npm run cloud:daily-report -- 2026-07-01
```

Reports are saved locally under `reports/daily/<YYYY-MM-DD>.md` and upserted into Turso's `daily_reports` table. Each report includes an executive snapshot, activity log, trade/exit alerts, full monitor-run appendix, and review prompts for what worked, what was noisy, what was missed, and how to improve rules.

Google Docs is useful as an export target, but it requires Google OAuth scopes and is not ideal as the canonical audit trail. Keep the raw record in Turso so a website, Markdown report, Google Doc, or later notebook can all be regenerated from the same facts.

## Visual Dashboard And GitHub Pages

The project includes a static visual dashboard under `docs/` for GitHub Pages. It shows:

- latest monitor decision and run pipeline;
- no-trade / trade-review / exit-review timeline;
- watchlist candidate board;
- Robinhood read-only quote/fundamental snapshot for watchlist symbols;
- local SEC research summaries, financial fact snapshots, and all exported filing links;
- daily AI intelligence summaries, stock-impact hypotheses, and prediction fact checks;
- explicit coverage gaps for anything not yet automated;
- risk gates and score thresholds;
- links to daily reports, dashboard JSON, research JSON, and public-safe log exports.

The public site is static, so it does not stream authenticated Robinhood data directly to the browser. Instead, the local Codex monitor refreshes and publishes public-safe JSON snapshots every 5 minutes during the market window, and the browser checks the published JSON every 60 seconds. The browser also tries Yahoo Finance chart data through public CORS proxies for card-level price charts and range views (`1D`, `1W`, `1M`, `YTD`, `1Y`, `5Y`); if that public route is blocked, delayed, rate-limited, or changes format, the card falls back to the published Robinhood snapshot. This keeps the ticker cards useful without exposing Robinhood credentials, account identifiers, or raw private logs.

Build the dashboard data locally:

```bash
npm run dashboard:build
```

Preview it locally:

```bash
npm run dashboard:serve
```

Then open `http://localhost:4173`.

Record a local Codex heartbeat decision into the public-safe dashboard log:

```bash
npm run dashboard:record -- \
  --decision "NO TRADE ALERT" \
  --message "NO TRADE ALERT: sector tape is weak and no setup reached the 80+ score gate." \
  --cash 2000 \
  --buying_power 2000 \
  --positions 0 \
  --orders 0 \
  --realized_pnl 0
```

The dashboard builder also reads Turso monitor tables when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are present, so the hosted site can update from scheduled cloud monitor runs without committing private raw logs.

Market data note: `research/market-snapshot.json` is a manually refreshed read-only market snapshot. It is included in `docs/data/research.json` by `scripts/dashboard/build-research-export.mjs`. It is not a live stream; rebuild and push the dashboard after refreshing the snapshot.

Privacy boundary:

- Raw `logs/`, `.env`, Robinhood tokens, Turso tokens, and `research/db/` stay ignored and should not be published.
- The GitHub Pages site publishes redacted dashboard JSON, copied daily Markdown reports, and sanitized log exports only.
- The GitHub Pages site also publishes a public research export with SEC filing links, generated summaries, strategy notes, and compact market snapshots.
- Account numbers, long numeric identifiers, and token-like strings are redacted by `scripts/dashboard/build-dashboard.mjs`.

For a simple GitHub Pages setup, publish from the `main` branch and `/docs` folder. That serves the current committed dashboard without requiring workflow permissions.

An optional Pages workflow template lives at `deploy/github-actions/pages.yml`. Move it to `.github/workflows/pages.yml` only after your GitHub token/repo has workflow permissions. It builds `docs/` and deploys it through GitHub Pages. Add these GitHub secrets if you want live Turso-backed data on the hosted dashboard:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`

Example GitHub Actions workflow templates live in `deploy/github-actions/`. Move them into `.github/workflows/` only after setting these secrets in GitHub:

- `OPENAI_API_KEY`
- `ROBINHOOD_OAUTH_ACCESS_TOKEN`, if you have a valid remote MCP bearer token
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `ALERT_WEBHOOK_URL`, optional

Do not commit `.env`, Turso tokens, Robinhood tokens, local logs, or generated research files.

## Enabling Live Orders

Leave this off unless you are ready for real orders:

```bash
ENABLE_REAL_ORDER_TOOLS=true
```

Even then, the bot:

- must review an equity order before placing it;
- must use only the Agentic account;
- asks you to type an exact phrase for `place_equity_order` or `cancel_equity_order`;
- blocks options unless `ENABLE_OPTIONS_TOOLS=true`;
- blocks leveraged ETPs unless `ENABLE_LEVERAGED_ETPS=true`.

## Speed

This is not high-frequency trading. The practical mode is a 15-60 second polling loop plus MCP/API latency and your confirmation time. Read-only scans can be dynamic; confirmed order placement is deliberately slower.

## Risk Defaults

The defaults assume a $2,000 Agentic account:

- max position notional: `$250`
- max total exposure: `$1,500`
- max daily loss: `$60`
- max trades per day: `8`
- max planned loss on one trade: `$15`

Edit `.env` if you want different guardrails.
