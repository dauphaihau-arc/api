import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';

@Entity({ tableName: 'user_addresses' })
@Index({ properties: ['user', 'isPrimary'] })
export class UserAddressEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'user_id',
    deleteRule: 'cascade',
    updateRule: 'cascade',
  })
  user!: CurrentUserEntity;

  @Property({ fieldName: 'full_name', length: 255 })
  fullName!: string;

  @Property({ fieldName: 'address1', length: 255 })
  address1!: string;

  @Property({ fieldName: 'address2', length: 255, nullable: true })
  address2?: string;

  @Property({ fieldName: 'city', length: 255 })
  city!: string;

  @Property({ fieldName: 'state', length: 255 })
  state!: string;

  @Property({ fieldName: 'zip', length: 50 })
  zip!: string;

  @Property({ fieldName: 'country', length: 255 })
  country!: string;

  @Property({ fieldName: 'phone', length: 50 })
  phone!: string;

  @Property({ fieldName: 'is_primary' })
  isPrimary = false;
}
