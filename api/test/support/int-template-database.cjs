const { fork } = require('node:child_process');

// Keep MikroORM's process-global metadata and ts-node hooks out of Jest's VM.
module.exports = function runTemplateDatabase(action, template) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [action], {
      env: {
        ...process.env,
        ARC_INT_TEMPLATE_DATABASE: template ? JSON.stringify(template) : '',
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    let result;
    child.once('message', (message) => {
      result = message;
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve(result);
      else reject(new Error(`Integration database ${action} failed (${signal ?? code})`));
    });
  });
};

async function execute(action) {
  require('ts-node/register/transpile-only');
  require('tsconfig-paths/register');
  const { Client } = require('pg');
  const { createTestDatabase, dropTestDatabase } = require('./test-postgres');

  if (action === 'drop') {
    await dropTestDatabase(JSON.parse(process.env.ARC_INT_TEMPLATE_DATABASE));
    return;
  }

  const template = await createTestDatabase('template', { fresh: true });
  const admin = new Client({ ...template.rootConfig, database: 'postgres' });
  try {
    await admin.connect();
    // No suite may connect to or mutate the shared source while it is cloned.
    await admin.query(`ALTER DATABASE "${template.dbName}" ALLOW_CONNECTIONS false`);
  }
  catch (error) {
    await dropTestDatabase(template);
    throw error;
  }
  finally {
    await admin.end();
  }
  process.send(template);
}

if (require.main === module) {
  execute(process.argv[2])
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => process.disconnect());
}
