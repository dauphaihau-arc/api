const runTemplateDatabase = require('./int-template-database.cjs');

module.exports = async function setupIntegrationDatabase() {
  delete process.env.ARC_INT_TEMPLATE_DATABASE;
  const template = await runTemplateDatabase('create');
  globalThis.arcIntegrationTemplateDatabase = template;
  process.env.ARC_INT_TEMPLATE_DATABASE = JSON.stringify(template);
};
