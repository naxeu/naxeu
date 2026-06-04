import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp();
  const { host, port } = app.env;
  await app.listen({ host, port });
  app.log.info(`Naxeu API listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error("Failed to start Naxeu API", err);
  process.exit(1);
});
