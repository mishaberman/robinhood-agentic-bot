# Strategy Research Pack

This folder is the monitor's slow-thinking layer.

It is not a promise of profit and it is not a live order system. It exists to make intraday alerts more selective by combining:

- current company and sector catalysts,
- local SEC-derived trend summaries,
- clear entry/exit/re-entry rules,
- watchlist-specific priorities and disqualifiers.

Files:

- `current-catalyst-map-2026-07-01.md` - current thesis/catalyst map for the active watchlist.
- `intraday-action-playbook.md` - rules for deciding when to alert, sell, wait, or consider a re-entry.
- `watchlist-scorecard.json` - compact machine-readable priorities and triggers.

The monitor should prefer these files over vague memory when it is deciding whether a fresh headline or price move is worth user attention.
