const runTemplateDatabase = require('./int-template-database.cjs');

module.exports = async function teardownIntegrationDatabase() {
  const template = globalThis.arcIntegrationTemplateDatabase;
  if (!template) return;

  await runTemplateDatabase('drop', template);
  delete globalThis.arcIntegrationTemplateDatabase;
  delete process.env.ARC_INT_TEMPLATE_DATABASE;
};
