import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/common/database/abstract-base.entity';
import { CurrentUserEntity } from '~/modules/domains/auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '~/modules/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ShopEntity } from '~/modules/domains/shop/infra/persistence/entities/shop.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity({ tableName: 'chat_conversations' })
@Index({ properties: ['buyerUser'] })
@Index({ properties: ['shop'] })
@Index({ properties: ['product'] })
@Index({ properties: ['status'] })
@Index({ properties: ['lastMessageAt'] })
export class ChatConversationEntity extends AbstractBaseEntity {
  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'buyer_user_id',
    deleteRule: 'cascade',
  })
  buyerUser!: CurrentUserEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @ManyToOne(() => ProductEntity, {
    fieldName: 'product_id',
    nullable: true,
    deleteRule: 'set null',
  })
  product?: ProductEntity;

  @Property({ fieldName: 'status', length: 20, default: 'open' })
  status = 'open';

  @Property({ fieldName: 'last_message_at', nullable: true })
  lastMessageAt?: Date;

  @ManyToOne(() => CurrentUserEntity, {
    fieldName: 'last_message_sender_user_id',
    nullable: true,
    deleteRule: 'set null',
  })
  lastMessageSenderUser?: CurrentUserEntity;

  @Property({ fieldName: 'buyer_last_read_at', nullable: true })
  buyerLastReadAt?: Date;

  @Property({ fieldName: 'seller_last_read_at', nullable: true })
  sellerLastReadAt?: Date;

  @OneToMany(() => ChatMessageEntity, (message) => message.conversation)
  messages = new Collection<ChatMessageEntity>(this);
}
