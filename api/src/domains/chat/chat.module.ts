import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { StorageModule } from '~/integrations/storage/storage.module';
import { WsModule } from '~/platform/ws/ws.module';
import { UserEntity } from '~/domains/user/infra/persistence/entities/user.entity';
import { ProductEntity } from '~/domains/product/infra/persistence/mikro-orm/entities/product.entity';
import { ProductModule } from '~/domains/product/product.module';
import { ShopModule } from '../shop/shop.module';
import { ShopEntity } from '../shop/infra/persistence/entities/shop.entity';
import { MeChatController } from './api/rest/me-chat.controller';
import { ShopChatController } from './api/rest/shop-chat.controller';
import { ChatCommandRepository } from './app/ports/chat-command.repository';
import { ChatQueryRepository } from './app/ports/chat-query.repository';
import { CreateOrGetMyChatConversationUseCase } from './app/use-cases/create-or-get-my-chat-conversation/create-or-get-my-chat-conversation.use-case';
import { GetMyChatUnreadCountUseCase } from './app/use-cases/get-my-chat-unread-count/get-my-chat-unread-count.use-case';
import { GetMyChatMessagesUseCase } from './app/use-cases/get-my-chat-messages/get-my-chat-messages.use-case';
import { GetShopChatUnreadCountUseCase } from './app/use-cases/get-shop-chat-unread-count/get-shop-chat-unread-count.use-case';
import { GetShopChatMessagesUseCase } from './app/use-cases/get-shop-chat-messages/get-shop-chat-messages.use-case';
import { ListMyChatConversationsUseCase } from './app/use-cases/list-my-chat-conversations/list-my-chat-conversations.use-case';
import { ListShopChatConversationsUseCase } from './app/use-cases/list-shop-chat-conversations/list-shop-chat-conversations.use-case';
import { MarkMyChatConversationReadUseCase } from './app/use-cases/mark-my-chat-conversation-read/mark-my-chat-conversation-read.use-case';
import { MarkShopChatConversationReadUseCase } from './app/use-cases/mark-shop-chat-conversation-read/mark-shop-chat-conversation-read.use-case';
import { SendMyChatMessageUseCase } from './app/use-cases/send-my-chat-message/send-my-chat-message.use-case';
import { SendShopChatMessageUseCase } from './app/use-cases/send-shop-chat-message/send-shop-chat-message.use-case';
import { ChatConversationEntity } from './infra/persistence/entities/chat-conversation.entity';
import { ChatMessageEntity } from './infra/persistence/entities/chat-message.entity';
import { MikroOrmChatCommandRepository } from './infra/persistence/repositories/mikro-orm-chat-command.repository';
import { MikroOrmChatQueryRepository } from './infra/persistence/repositories/mikro-orm-chat-query.repository';
import { ForwardChatMessageToWsListener } from './listeners/forward-chat-message-to-ws.listener';

@Module({
  imports: [
    WsModule,
    StorageModule,
    ShopModule,
    ProductModule,
    MikroOrmModule.forFeature([
      ChatConversationEntity,
      ChatMessageEntity,
      UserEntity,
      ShopEntity,
      ProductEntity,
    ]),
  ],
  controllers: [MeChatController, ShopChatController],
  providers: [
    {
      provide: ChatCommandRepository,
      useExisting: MikroOrmChatCommandRepository,
    },
    {
      provide: ChatQueryRepository,
      useExisting: MikroOrmChatQueryRepository,
    },
    MikroOrmChatCommandRepository,
    MikroOrmChatQueryRepository,
    CreateOrGetMyChatConversationUseCase,
    ListMyChatConversationsUseCase,
    ListShopChatConversationsUseCase,
    GetMyChatUnreadCountUseCase,
    GetShopChatUnreadCountUseCase,
    GetMyChatMessagesUseCase,
    GetShopChatMessagesUseCase,
    MarkMyChatConversationReadUseCase,
    MarkShopChatConversationReadUseCase,
    SendMyChatMessageUseCase,
    SendShopChatMessageUseCase,
    ForwardChatMessageToWsListener,
  ],
})
export class ChatModule {}
