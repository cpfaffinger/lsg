import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { buildServer } from './server.ts';
import { DailyLogStream } from './services/log-files.ts';

const config = loadConfig();
const db = openDatabase(config.databaseFile);
const logStream = new DailyLogStream(config.logDir);
const { app } = await buildServer({ config, db, scheduleBackups: true, logStream });

const shutdown = async (signal: string): Promise<void> => {
  app.log.info(`Received ${signal}, shutting down.`);
  await app.close();
  db.close();
  await logStream.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`LSG API ${config.version} listening on ${config.host}:${config.port}`);
