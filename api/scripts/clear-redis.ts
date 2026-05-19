import 'reflect-metadata';
import { createClient } from 'redis';

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const client = createClient({ url: redisUrl });

  client.on('error', (error) => {
    console.error('Redis client error:', error);
  });

  await client.connect();

  try {
    await client.flushDb();
    console.log(`Redis database cleared (${redisUrl})`);
  } finally {
    await client.quit();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
