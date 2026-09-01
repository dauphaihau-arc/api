import {
  Entity,
  Index,
  ManyToOne,
  Property,
} from '@mikro-orm/core';
import { AbstractBaseEntity } from '~/platform/database/abstract-base.entity';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ChatConversationEntity } from './chat-conversation.entity';

@Entity({ tableName: 'chat_messages' })
@Index({ properties: ['conversation', 'createdAt'] })
@Index({ properties: ['senderUser'] })
@Index({ properties: ['messageType'] })
export class ChatMessageEntity extends AbstractBaseEntity {
  @ManyToOne(() => ChatConversationEntity, {
    fieldName: 'conversation_id',
    deleteRule: 'cascade',
  })
  conversation!: ChatConversationEntity;

  @ManyToOne(() => UserEntity, {
    fieldName: 'sender_user_id',
    deleteRule: 'restrict',
  })
  senderUser!: UserEntity;

  @Property({ fieldName: 'message_type', length: 20, default: 'text' })
  messageType = 'text';

  @Property({ fieldName: 'body', type: 'text' })
  body!: string;

  @Property({ fieldName: 'metadata', type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Property({ fieldName: 'edited_at', nullable: true })
  editedAt?: Date;
}
