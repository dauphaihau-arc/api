import { SetMetadata } from '@nestjs/common';

export const AUTH_REQUIRED_PERMISSIONS_KEY = 'auth:required-permissions';

export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(AUTH_REQUIRED_PERMISSIONS_KEY, permissions);
