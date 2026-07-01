import OpenAI from "openai";
import { config, assertRuntimeConfig } from "./config.mjs";
import { mcpToolConfig } from "./tools.mjs";
import { buildSystemInstructions } from "./safety.mjs";
import { decideApproval } from "./approval.mjs";
import { audit } from "./audit.mjs";

export async function runAgent(userInput) {
  assertRuntimeConfig();
  const client = new OpenAI({ apiKey: config.openaiApiKey });
  const tools = [mcpToolConfig()];

  let response = await client.responses.create({
    model: config.model,
    instructions: buildSystemInstructions(),
    tools,
    input: userInput
  });

  await audit("response_created", summarizeResponse(response));

  while (true) {
    const approvals = (response.output || []).filter((item) => item.type === "mcp_approval_request");
    if (approvals.length === 0) {
      return response;
    }

    const approvalInputs = [];
    for (const approval of approvals) {
      const approve = await decideApproval(approval);
      approvalInputs.push({
        type: "mcp_approval_response",
        approval_request_id: approval.id,
        approve
      });
    }

    response = await client.responses.create({
      model: config.model,
      instructions: buildSystemInstructions(),
      tools,
      previous_response_id: response.id,
      input: approvalInputs
    });

    await audit("response_after_approval", summarizeResponse(response));
  }
}

export function summarizeResponse(response) {
  return {
    id: response.id,
    status: response.status,
    outputTypes: (response.output || []).map((item) => item.type),
    text: response.output_text || ""
  };
}

function defaultPrompt() {
  return `
Scan the current watchlist (${config.watchlist.join(", ")}) for intraday equity setups.

Use Robinhood tools to check the Agentic account, buying power, current positions, open orders, today's realized P/L, quotes, recent intraday historicals, and technical indicators where useful.

Do not place orders. Return:
1. account/risk status,
2. top 3 watch candidates,
3. no-trade reasons,
4. any specific setup that is worth watching, with entry zone, invalidation, target, and estimated notional below risk limits.
`.trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prompt = process.argv.slice(2).join(" ").trim() || defaultPrompt();
  runAgent(prompt)
    .then((response) => {
      console.log(response.output_text || JSON.stringify(response.output, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
