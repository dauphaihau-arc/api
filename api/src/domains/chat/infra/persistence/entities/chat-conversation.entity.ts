import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ShopEntity } from '~/domains/shop/infra/persistence/entities/shop.entity';
import { ChatMessageEntity } from './chat-message.entity';

@Entity({ tableName: 'chat_conversations' })
@Index({ properties: ['buyerUser'] })
@Index({ properties: ['shop'] })
@Index({ properties: ['status'] })
@Index({ properties: ['lastMessageAt'] })
export class ChatConversationEntity extends AbstractBaseEntity {
  @ManyToOne(() => UserEntity, {
    fieldName: 'buyer_user_id',
    deleteRule: 'cascade',
  })
  buyerUser!: UserEntity;

  @ManyToOne(() => ShopEntity, {
    fieldName: 'shop_id',
    deleteRule: 'restrict',
  })
  shop!: ShopEntity;

  @Property({ fieldName: 'status', length: 20, default: 'open' })
  status = 'open';

  @Property({ fieldName: 'last_message_at', nullable: true })
  lastMessageAt?: Date;

  @ManyToOne(() => UserEntity, {
    fieldName: 'last_message_sender_user_id',
    nullable: true,
    deleteRule: 'set null',
  })
  lastMessageSenderUser?: UserEntity;

  @ManyToOne(() => ChatMessageEntity, {
    fieldName: 'last_message_id',
    nullable: true,
    deleteRule: 'set null',
  })
  lastMessage?: ChatMessageEntity;

  @Property({ fieldName: 'last_message_body_preview', length: 160, nullable: true })
  lastMessageBodyPreview?: string;

  @Property({ fieldName: 'last_message_type', length: 20, nullable: true })
  lastMessageType?: string;

  @Property({ fieldName: 'buyer_last_read_at', nullable: true })
  buyerLastReadAt?: Date;

  @Property({ fieldName: 'seller_last_read_at', nullable: true })
  sellerLastReadAt?: Date;

  @Property({ fieldName: 'buyer_unread_count', default: 0 })
  buyerUnreadCount = 0;

  @Property({ fieldName: 'seller_unread_count', default: 0 })
  sellerUnreadCount = 0;

  @OneToMany(() => ChatMessageEntity, (message) => message.conversation)
  messages = new Collection<ChatMessageEntity>(this);
}
