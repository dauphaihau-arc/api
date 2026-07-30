import {
  Collection,
  Entity,
  OneToMany,
  Property,
  Unique,
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { RolePermissionEntity } from './role-permission.entity';

@Entity({ tableName: 'permissions' })
export class PermissionEntity extends AbstractAuthEntity {
  @Property({ fieldName: 'key' })
  @Unique()
  key!: string;

  @Property({ fieldName: 'name' })
  name!: string;

  @Property({ fieldName: 'description', nullable: true })
  description?: string;

  @OneToMany(
    () => RolePermissionEntity,
    (rolePermission) => rolePermission.permission,
  )
  rolePermissions = new Collection<RolePermissionEntity>(this);
}
