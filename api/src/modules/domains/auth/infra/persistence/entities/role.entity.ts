import {
  Collection,
  Entity,
  OneToMany,
  Property,
  Unique
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { RolePermissionEntity } from './role-permission.entity';
import { UserRoleEntity } from './user-role.entity';

@Entity({ tableName: 'roles' })
export class RoleEntity extends AbstractAuthEntity {
  @Property({ fieldName: 'key' })
  @Unique()
  key!: string;

  @Property({ fieldName: 'name' })
  name!: string;

  @Property({ fieldName: 'description', nullable: true })
  description?: string;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.role)
  userRoles = new Collection<UserRoleEntity>(this);

  @OneToMany(
    () => RolePermissionEntity,
    (rolePermission) => rolePermission.role
  )
  rolePermissions = new Collection<RolePermissionEntity>(this);
}
