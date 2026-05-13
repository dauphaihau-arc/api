import {
  Entity, ManyToOne, Property, Unique 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { PermissionEntity } from './permission.entity';
import { RoleEntity } from './role.entity';

@Entity({ tableName: 'role_permissions' })
@Unique({ properties: ['role', 'permission'] })
export class RolePermissionEntity extends AbstractAuthEntity {
  @ManyToOne(() => RoleEntity, {
    fieldName: 'role_id',
    deleteRule: 'cascade',
  })
  role!: RoleEntity;

  @ManyToOne(() => PermissionEntity, {
    fieldName: 'permission_id',
    deleteRule: 'cascade',
  })
  permission!: PermissionEntity;

  @Property({ fieldName: 'granted_at' })
  grantedAt = new Date();
}
