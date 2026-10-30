import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { buildServer } from './server.ts';

const config = loadConfig();
const db = openDatabase(config.databaseFile);
const app = await buildServer({ config, db });

const shutdown = async (signal: string): Promise<void> => {
  console.info(`Received ${signal}, shutting down.`);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
console.info(`LSG API ${config.version} listening on ${config.host}:${config.port}`);
