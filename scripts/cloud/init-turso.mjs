import { applyTursoSchema, createTursoClient } from "./turso-common.mjs";

async function main() {
  const client = createTursoClient();
  await applyTursoSchema(client);
  client.close();
  console.log("Turso schema is ready.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
