# Intraday Action Playbook

Purpose: make the monitor more selective about `TRADE REVIEW`, `EXIT REVIEW`, and re-entry alerts for a roughly $2,000 Agentic account.

This is analysis infrastructure, not a guarantee of profit and not personalized financial/tax advice.

## Operating Principles

1. No catalyst + no technical trigger = no alert.
2. Big theme + bad entry = wait.
3. First loss is cheapest. Do not average down a failed intraday setup.
4. Re-entry requires a new trigger, not regret.
5. The account is small; survival matters more than catching every move.

## Morning Preparation

Before market open:

1. Read `research/strategy/current-catalyst-map-2026-07-01.md`.
2. Check if the day has scheduled earnings, investor events, Fed/macro events, major geopolitical headlines, or sector-specific policy news.
3. Build a short focus list of 3-5 symbols only.
4. Sort candidates into:
   - `Primary`: fresh catalyst + high liquidity + thesis alignment.
   - `Watch only`: good company/theme, but no clean entry.
   - `Avoid today`: extended, no catalyst, wide spread, or weak sector tape.

## Intraday Score Gate

Only raise `TRADE REVIEW` if total score is at least 80/100:

- Catalyst quality/freshness: 25
- Catalyst corroboration/materiality: 15
- Alignment with local research thesis: 15
- Relative strength vs `SMH`, `QQQ`, and closest peers: 10
- Technical setup around VWAP/support/resistance: 15
- Liquidity/spread quality: 10
- Risk/reward clarity: 10

Automatic disqualifiers:

- Spread is too wide for a small account.
- Stock is already more than 2 ATR-style intraday pushes above VWAP with no pullback.
- Entry would require a stop so wide that dollar risk exceeds normal limit.
- The move is only from an already-known headline and volume is fading.
- User already has a position that needs exit monitoring.

## Entry Setups Worth Alerting

### VWAP Reclaim After Catalyst

Use when:
- Fresh catalyst is confirmed.
- Stock opened strong, pulled back, held above the first major low, then reclaims VWAP.
- Sector anchor (`SMH`, `NVDA`, or relevant peer group) is not breaking down.

Alert structure:
- Entry trigger: reclaim/hold above VWAP or break above lower high.
- Stop: below reclaim failure or pullback low.
- Take profit: first prior high, then measured extension.
- Best for: `MU`, `WDC`, `STX`, `MRVL`, `DELL`, `AVGO`.

### Opening Range Breakout With Confirmation

Use when:
- First 5-15 minute range forms after high-volume catalyst.
- Breakout occurs with volume expansion, not thin drift.
- Market/sector tape supports the move.

Avoid when:
- Opening candle is huge and stop would be too far.
- Stock breaks out while `SMH` or `QQQ` is rolling over.

Best for:
- `MU`, `NVDA`, `AVGO`, `DELL`, `NBIS`.

### Pullback To Prior Resistance / Support

Use when:
- Stock has already proven direction.
- Pullback holds a prior breakout level, premarket high, previous day high, or obvious support.
- Volume contracts on pullback and expands on bounce.

Best for:
- Re-entry setups after a profitable sell.
- Avoids chasing vertical candles.

### Sector Sympathy Confirmation

Use when:
- One leader breaks on a strong source-backed catalyst, and peers confirm.
- Example: `MU` strength plus `WDC`/`STX` strength on memory/storage scarcity.
- Example: `NVDA` strength plus `AVGO`/`MRVL` strength on AI networking/custom silicon.

Require:
- The sympathy ticker must have its own relative volume and clean technical trigger.
- Do not alert just because peers are green.

## Selling / Exit Rules

Raise `EXIT REVIEW` when any of these occurs:

### Profit-Taking

- Price reaches first target or prior high and momentum starts slowing.
- Gain is meaningful relative to account size and setup quality.
- Stock goes vertical into resistance after the entry.
- Sector leader starts fading.

Suggested behavior:
- For a small account, prefer realized wins over hoping for a full trend day.
- If user wants to stay involved, suggest partial exits only if Robinhood/account mechanics and position size make that sensible.

### Stop / Invalidation

- Entry trigger fails.
- VWAP reclaim fails and price closes below the pullback low.
- Stock loses relative strength while sector remains strong.
- Catalyst is contradicted or repriced by new information.
- Position risk exceeds intended dollar risk.

Suggested behavior:
- Do not propose averaging down.
- Do not widen stop because the thesis still sounds good.

### Momentum Failure

- Lower high after failed breakout.
- Heavy red volume through VWAP.
- Leader rolls over (`NVDA` for AI infra, `MU` for memory/storage, `SMH` for broad semis).
- News-driven move fades after first 30-60 minutes.

## Re-Entry Rules

Re-entry can be considered only if:

1. The first trade was exited for profit or controlled loss.
2. A new base forms after the exit.
3. A new trigger appears: VWAP reclaim, higher low, second breakout, or new catalyst.
4. Risk/reward is at least as good as the first trade.
5. User has not exceeded max trades/day or daily loss limit.

Do not re-enter if:

- The only reason is “it might go back up.”
- The stock is below VWAP and making lower highs.
- The catalyst is stale and volume is fading.
- The day already has multiple failed alerts in the same symbol.

## Position Sizing For $2,000 Account

Default alert sizing:

- Normal conviction: $250-$500 notional.
- Strong but volatile: $250-$350 notional.
- Exceptional only: up to $750-$1,000, but only if stop is tight and liquidity is excellent.
- Never suggest more than $2,000 total exposure.

Dollar risk target:

- Typical planned loss per trade: $10-$20.
- Hard daily realized loss guide: $60 unless user changes it.
- Max 3 trades/day for now.

## Ticker-Specific Alert Bias

### `MU`

Alert when:
- Fresh HBM/DRAM/NAND/pricing/customer-agreement news.
- Strong relative strength versus `SMH`, `WDC`, `STX`.
- Clean VWAP reclaim or pullback base.

Exit faster when:
- It fails after a gap up.
- Memory peers roll over.
- It loses VWAP on heavy volume.

### `WDC` / `STX`

Alert when:
- Storage/HDD capacity, hyperscaler, cloud, exabyte, or AI data workload news.
- `MU` confirms memory/storage theme or both storage names move together.

Exit faster when:
- Move is sympathy-only and `MU` fades.
- HDD/storage news is old and volume is not confirming.

### `AVGO` / `MRVL`

Alert when:
- AI networking, optical, Ethernet, custom ASIC, switch, or cloud capex news.
- `NVDA` and `SMH` are stable or rising.

Exit faster when:
- Headline is already priced in.
- Stock fails a breakout on expectation-heavy news.

### `DELL` / `HPE`

Alert when:
- AI server/backlog/orders/cloud infrastructure news plus strong price action.
- Margins are not the negative focus of the market reaction.

Exit faster when:
- Backlog story is strong but profit/margin reaction is weak.
- Inventory/working-capital concerns dominate.

### `NVDA` / `AMD`

Use as:
- Leaders and confirmation tools.
- Trade candidates only when there is stock-specific news or unusually clean technicals.

### `ASML`

Alert only on:
- Bookings, EUV/High-NA, guidance, export-control, or Europe semi-equipment catalyst.

Avoid:
- Generic AI-chip sympathy without ASML-specific confirmation.

### `STM`

Alert only on:
- Recovery/booking/datacenter revenue evidence, power/sensor/industrial semi catalyst, or confirmed AI infrastructure angle.

### `NBIS`

Alert only on:
- AI cloud capacity, power/land, large customer, financing, GPU supply, or infrastructure expansion news with major volume.

Sizing:
- Keep notional smaller due to volatility/buildout risk.

### `HON`

Alert only on:
- Spin-off/corporate action, aerospace/avionics/sensors, automation, or direct source-supported supplier news.

Avoid:
- Generic SpaceX excitement without source-backed public-company relevance.

### `HPQ`

Usually watch-only.

Alert only on:
- AI PC/edge AI/Windows refresh catalyst plus unusual volume and clean technicals.

## Good Alert Template

Every `TRADE REVIEW` should include:

- Symbol:
- Score:
- As-of price/time:
- Catalyst:
- Source quality:
- Local research context:
- Entry trigger/zone:
- Stop/invalidation:
- Take-profit zone:
- Suggested max notional:
- Estimated dollar risk:
- Why waiting may be better:
- What would cancel the setup:

Every `EXIT REVIEW` should include:

- Symbol:
- Position context if available:
- Reason:
- Stop/profit-taking zone:
- Catalyst or technical change:
- Risk if user waits:
- Whether re-entry is allowed and what would trigger it:

## Default Answer When Unsure

Use:

`NO TRADE ALERT - setup does not meet catalyst + price-action + risk/reward threshold.`

This is a valid and preferred outcome.
