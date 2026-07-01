import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runAgent } from "./agent.mjs";

const rl = readline.createInterface({ input, output });

console.log("Robinhood Agentic Bot chat. Type 'exit' to quit.");
console.log("Live order tools are disabled unless ENABLE_REAL_ORDER_TOOLS=true.\n");

try {
  while (true) {
    const line = await rl.question("you> ");
    const prompt = line.trim();
    if (!prompt || ["exit", "quit"].includes(prompt.toLowerCase())) break;
    const response = await runAgent(prompt);
    console.log(`\nbot> ${response.output_text || JSON.stringify(response.output, null, 2)}\n`);
  }
} finally {
  rl.close();
}
