import { defineConfig } from '@mikro-orm/postgresql';
import { buildDatabaseConfig } from '~/platform/config/database.config';

export default defineConfig(
  buildDatabaseConfig(process.env, { includeEntityGlobs: true }),
);
