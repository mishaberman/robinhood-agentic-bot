# Current Catalyst Map - 2026-07-01

Purpose: durable context for the Robinhood Agentic monitor. Use this as background for alerts, not as automatic buy/sell instructions.

## Core Market Clusters

### 1. Memory / HBM / NAND Tightness

Primary tickers: `MU`, `WDC`, `STX`

Thesis:
- The strongest current cluster is memory and storage scarcity tied to AI infrastructure buildouts.
- `MU` has the most direct HBM/DRAM/NAND leverage and the strongest local SEC trend acceleration.
- `WDC` and `STX` are storage-capacity beneficiaries, especially where AI/data-center workloads need cheap capacity at scale.

Evidence:
- Micron IR lists a June 24, 2026 record fiscal Q3 release and a June 22, 2026 strategic agreement with Anthropic. Source: https://investors.micron.com/
- Local SEC summary for `MU` shows fiscal Q3 revenue of $41.46B, gross profit of $35.06B, operating income of $33.32B, and inventory roughly flat year over year despite the revenue jump. Source: `research/db/companies/MU/trend_summary.md`.
- Local SEC search found Micron describing strong long-term customer demand, structurally constrained supply growth, and Strategic Customer Agreements. Source: `research/research.sqlite`, query `HBM supply demand strategic customer agreements`.
- Western Digital IR says it is building storage for hyperscalers, enterprises, cloud providers, and next-generation AI-driven data workloads; it lists Q3 FY2026 as the latest quarterly result. Source: https://investor.wdc.com/
- Seagate Q2 FY2026 release cited revenue of $2.83B, GAAP gross margin of 41.6%, non-GAAP EPS of $3.11, durability of data-center demand, and HAMR/Mozaic ramp. Source: https://investors.seagate.com/Q2FY26PR/

Monitor implications:
- `MU` gets priority when the catalyst is HBM, DRAM pricing, NAND pricing, Strategic Customer Agreements, AI memory shortages, or Nvidia/AMD supply-chain sympathy.
- `WDC`/`STX` get priority when the catalyst is HDD capacity, hyperscaler storage, exabyte demand, cloud/data-center storage, or a sympathy move from memory tightness.
- Avoid chasing if the stock gaps hard and immediately loses VWAP. Prefer pullback/reclaim setups.

Bear checks:
- Memory/storage stocks are extended after sharp 2026 moves; a good catalyst still needs a clean intraday base.
- Reversal risk is high when headlines are already known before market open.
- If `MU` reverses, expect sympathy pressure on `WDC`, `STX`, and sometimes `SMH`.

## 2. AI Networking / Custom Silicon / Optical

Primary tickers: `AVGO`, `MRVL`, `NVDA`, `AMD`

Thesis:
- AI infrastructure is shifting from only accelerators to full systems: networking, custom ASICs, optical interconnect, switches, Ethernet/InfiniBand, and memory-attached architectures.
- `NVDA` remains the broad AI infrastructure benchmark; `AVGO` and `MRVL` are high-beta ways to express custom silicon and networking demand.

Evidence:
- Nvidia Q1 FY2027 transcript reported data center revenue of $75B, up 92% year over year and 21% sequentially, driven by Blackwell; networking revenue nearly tripled year over year. Source: https://s201.q4cdn.com/141608511/files/doc_financials/2027/q1/NVDA-Q1-2027-Earnings-Call-20-May-2026-5_00-PM-ET.pdf
- AMD Q1 2026 release reported revenue of $10.3B, gross margin of 53%, and data center segment revenue of $5.8B, up 57% year over year, driven by EPYC and Instinct GPU shipments. Source: https://ir.amd.com/news-events/press-releases/detail/1284/amd-reports-first-quarter-2026-financial-results
- AMD management referenced inferencing/agentic AI demand and strengthening MI450/Helios customer engagement. Source: same AMD Q1 2026 release.
- Broadcom Q1 FY2026 release reported AI revenue of $8.4B, up 106% year over year, driven by custom AI accelerators and AI networking. Source: https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-announces-first-quarter-fiscal-year-2026-financial
- Marvell press releases list availability of a 102.4 Tbps switch for AI/cloud data-center infrastructure, Q1 FY2027 results, and a COMPUTEX keynote focused on AI scaling and connectivity. Source: https://investor.marvell.com/news-events/press-releases

Monitor implications:
- `AVGO` is best for custom ASIC/networking catalysts, but should require confirmation because it can reverse hard after expectation-heavy news.
- `MRVL` is a cleaner networking/optical beta candidate when news is about AI switch, optical DSP, interconnect, cloud capex, or custom silicon.
- `NVDA` is the index signal: if `NVDA` is below VWAP with failed bounces, reduce confidence on most AI infra longs.
- `AMD` works best on product/customer/supply-ramp catalysts and relative strength versus `NVDA`.

Bear checks:
- Broad AI headlines can be stale. Require either stock-specific news, visible relative strength, or a clean sector-wide move.
- `MRVL` and `AVGO` can be expectation-sensitive; avoid buying if a headline causes an opening spike followed by lower highs.

## 3. AI Servers / Enterprise Infrastructure / Edge AI

Primary tickers: `DELL`, `HPE`, `HPQ`

Thesis:
- AI server demand is real, but profit quality differs by vendor. The alert system should distinguish revenue/backlog strength from margin dilution.
- `DELL` is the highest-beta AI-server watchlist name; `HPE` is infrastructure/networking/hybrid cloud; `HPQ` is mostly lower-beta edge AI/PC refresh.

Evidence:
- Dell Q1 FY2027 transcript reported AI server orders of $24.4B, AI server revenue of $16.1B, and ending backlog of $51.3B; traditional server/networking revenue was $8.5B and demand continued to outpace supply. Source: https://investors.delltechnologies.com/static-files/b63ffff9-b729-403b-a231-c6af05667759
- Local SEC summary for `DELL` shows Q1 FY2027 revenue of $43.84B, operating income of $3.66B, and inventory up 103% year over year, so execution and working-capital quality matter. Source: `research/db/companies/DELL/trend_summary.md`.
- HPE investor materials show Q2 FY2026 total segment net revenue of $10.678B, with Cloud & AI at $7.707B and Networking at $2.690B; Cloud & AI operating profit margin was 12.4%, up year over year. Source: https://investors.hpe.com/
- HP Q2 FY2026 release reported net revenue of $14.4B, up 9%, and described intelligent devices, edge AI, connected experiences, AI PCs, workstations, and AI-powered print. Source: https://www.hp.com/us-en/newsroom/press-releases/2026/hp-inc-reports-fiscal-2026-second-quarter-results.html

Monitor implications:
- `DELL` alert threshold should require both price strength and either AI server/backlog news or positive sector sympathy from `NVDA`, `AVGO`, or `MRVL`.
- `HPE` can be considered when networking/cloud/AI infrastructure headlines are broad and `DELL` is too extended.
- `HPQ` should usually be a secondary/defensive watch, not a primary day-trade target, unless there is a very specific AI PC/PC refresh catalyst plus unusual volume.

Bear checks:
- AI server revenue can be low-margin; avoid buying only on backlog if market reaction is focused on profitability.
- Inventory spikes matter for `DELL` and `HPQ`.

## 4. Semiconductor Equipment / Foundry Capacity / Export Controls

Primary tickers: `ASML`, `SMH`

Thesis:
- ASML is a high-quality long-term AI/chip-capacity lever, but intraday setups are often driven by macro, Europe, export controls, order bookings, and China policy rather than direct AI headlines.

Evidence:
- ASML Q1 2026 release reported total net sales of €8.8B, gross margin of 53.0%, net income of €2.8B, and 2026 sales guidance of €36B-€40B with gross margin of 51%-53%. Source: https://www.asml.com/news/press-releases/2026/q1-2026-financial-results
- Local SEC summary for `ASML` shows 2025 revenue of $32.67B, operating income of $11.30B, and inventory of $11.43B. Source: `research/db/companies/ASML/trend_summary.md`.

Monitor implications:
- `ASML` should not be traded merely because AI chips are up. Require a catalyst involving bookings, EUV/High-NA, guidance, China/export restrictions, or Europe semi equipment strength.
- `SMH` is useful when single-stock conviction is weak but semiconductor breadth is strong.

Bear checks:
- Export restrictions can create headline gaps that fade quickly.
- Currency/European-market action can lead U.S. ADRs before the U.S. open.

## 5. Space / Satellite / Aerospace Supply Chain

Primary tickers: `HON`, `STM`, `MRVL`, `STX`, `WDC`, `NBIS`

Thesis:
- SpaceX is private. Treat SpaceX/Starlink/launch/satellite headlines as inferred context only unless a source directly names a public supplier.
- The tradable public-market angle is component demand, avionics/sensors, power semiconductors, satellite data/ground networking, storage, and AI/cloud workloads.

Evidence:
- Honeywell IR lists June 29, 2026 news around Honeywell Technologies completing the Honeywell Aerospace spin-off and launching as an independent automation company. Source: https://investor.honeywell.com/investor-relations
- STMicroelectronics Q1 2026 release reported net revenue of $3.10B, gross margin of 33.8%, improving demand with strong bookings and normalized distribution inventory, plus datacenter revenue expectations above $500M for 2026 and above $1B for 2027. Source: https://newsroom.st.com/media-center/press-item.html/c3392.html
- Nebius Q1 2026 announcement described the company as an AI cloud company and said it secured up to 1.2 GW of power and land for a Pennsylvania AI factory. Source: https://nebius.com/newsroom/nebius-reports-first-quarter-2026-financial-results

Monitor implications:
- `HON` is event/corporate-action driven right now; trade only on fresh spin-off/aerospace/automation news plus clean liquidity.
- `STM` needs evidence that the market is rewarding Q1 recovery/AI datacenter upside, not just broad semi sympathy.
- `NBIS` is high beta and infrastructure-heavy; require unusually strong volume and avoid oversized notional.
- Do not state a direct SpaceX relationship unless the source explicitly supports it.

Bear checks:
- Space-related headlines are often exciting but not necessarily material to public tickers.
- `NBIS` has large capex/buildout risk; strength can reverse if funding, power, or profitability concerns surface.

## Priority Ranking For Tomorrow's Monitor

Primary candidates if live action aligns:
1. `MU` - best current thesis strength, high beta, direct HBM/memory scarcity.
2. `WDC` / `STX` - storage scarcity and AI data workload sympathy.
3. `DELL` - AI server backlog and high liquidity, but watch margins.
4. `AVGO` / `MRVL` - custom silicon/networking catalysts.
5. `NVDA` / `AMD` - sector anchors and product-cycle confirmation.

Secondary candidates:
6. `ASML` - equipment/export-control/bookings setup only.
7. `HPE` - infrastructure/networking setup only.
8. `STM` - recovery/datacenter setup only.
9. `NBIS` - high-beta AI cloud setup only with strong risk controls.
10. `HON` - corporate-action/aerospace setup only.
11. `HPQ` - lower priority unless AI PC/edge AI news has unusual volume.

Default stance:
- No trade unless a ticker has a fresh catalyst, relative strength, and a clean technical trigger.
- The system should be willing to produce many `NO TRADE ALERT` outputs.
