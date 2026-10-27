import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/platform/decorators/require-permissions.decorator';
import { AdminAuditLogController } from './admin-audit-log.controller';

describe('AdminAuditLogController authorization metadata', () => {
  it('requires the audit read permission for the audit trail', () => {
    expect(
      Reflect.getMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, AdminAuditLogController),
    ).toEqual(['audit.read']);
  });

  it('exposes the CSV export route', () => {
    const handler = AdminAuditLogController.prototype.export;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('export');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
  });
});
