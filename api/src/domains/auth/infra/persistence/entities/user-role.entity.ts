import {
  Entity, ManyToOne, Property, Unique, 
} from '@mikro-orm/core';
import { AbstractAuthEntity } from './abstract-auth.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { RoleEntity } from './role.entity';

@Entity({ tableName: 'user_roles' })
@Unique({ properties: ['user', 'role'] })
export class UserRoleEntity extends AbstractAuthEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
  })
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, {
    fieldName: 'role_id',
    deleteRule: 'cascade',
  })
  role!: RoleEntity;

  @Property({ fieldName: 'assigned_at' })
  assignedAt = new Date();
}
