import { defineInventoryLifecycleSuite } from '../support/inventory-lifecycle-suite';

// Requires the Go toolchain, PostgreSQL, and RabbitMQ. Enable with
// INVENTORY_REMOTE_E2E=1 so the default suite stays hermetic.
defineInventoryLifecycleSuite('remote', {
  remoteEnabled: process.env.INVENTORY_REMOTE_E2E === '1',
});
