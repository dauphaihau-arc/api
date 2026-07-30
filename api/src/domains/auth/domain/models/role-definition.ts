import type { RoleKey } from '../value-objects/role-key';

export interface RoleDefinition {
  key: RoleKey;
  name: string;
  description?: string;
}
