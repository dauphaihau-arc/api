import { defineConfig } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from './src/config/database.config';

export default defineConfig(
  buildDatabaseConfig(process.env, { includeEntityGlobs: true }),
);
