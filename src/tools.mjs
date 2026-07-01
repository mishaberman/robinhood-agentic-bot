import { config } from "./config.mjs";

const accountAndPortfolioTools = [
  "get_accounts",
  "get_portfolio",
  "get_realized_pnl",
  "search"
];

const watchlistReadTools = [
  "get_watchlists",
  "get_watchlist_items",
  "get_option_watchlist",
  "get_popular_watchlists"
];

const marketDataTools = [
  "get_equity_historicals",
  "get_equity_fundamentals",
  "get_equity_technical_indicators",
  "get_earnings_results",
  "get_earnings_calendar",
  "get_indexes",
  "get_index_quotes"
];

const equityReadAndReviewTools = [
  "get_equity_positions",
  "get_equity_quotes",
  "get_equity_orders",
  "get_equity_tradability",
  "review_equity_order"
];

const scannerTools = [
  "get_scans",
  "run_scan"
];

const equityOrderTools = [
  "place_equity_order",
  "cancel_equity_order"
];

const optionsReadAndReviewTools = [
  "get_option_level_upgrade_info",
  "get_option_chains",
  "get_option_instruments",
  "get_option_quotes",
  "get_option_positions",
  "get_option_orders",
  "review_option_order"
];

const optionsOrderTools = [
  "place_option_order",
  "cancel_option_order"
];

export function allowedTools() {
  const tools = [
    ...accountAndPortfolioTools,
    ...watchlistReadTools,
    ...marketDataTools,
    ...equityReadAndReviewTools,
    ...scannerTools
  ];

  if (config.enableRealOrderTools) {
    tools.push(...equityOrderTools);
  }

  if (config.enableOptionsTools) {
    tools.push(...optionsReadAndReviewTools);
    if (config.enableRealOrderTools) {
      tools.push(...optionsOrderTools);
    }
  }

  return tools;
}

export function approvalFreeTools() {
  const tools = [
    ...accountAndPortfolioTools,
    ...watchlistReadTools,
    ...marketDataTools,
    ...equityReadAndReviewTools,
    ...scannerTools
  ];

  if (config.enableOptionsTools) {
    tools.push(...optionsReadAndReviewTools);
  }

  return tools;
}

export function mcpToolConfig() {
  const tool = {
    type: "mcp",
    server_label: "robinhood_trading",
    server_description:
      "Robinhood Trading MCP for Agentic accounts. Read account, portfolio, positions, market data, review orders, and place trades only when enabled and approved.",
    server_url: config.robinhoodMcpUrl,
    allowed_tools: allowedTools(),
    require_approval: {
      never: {
        tool_names: approvalFreeTools()
      }
    }
  };

  if (config.robinhoodOAuthAccessToken) {
    tool.authorization = config.robinhoodOAuthAccessToken;
  }

  return tool;
}
