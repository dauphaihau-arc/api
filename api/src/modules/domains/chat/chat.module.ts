import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { WsModule } from '../../shared/ws/ws.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { ProductEntity } from '../product/infra/persistence/entities/product.entity';
import { ShopModule } from '../shop/shop.module';
import { ShopEntity } from '../shop/infra/persistence/entities/shop.entity';
import { MeChatController } from './api/rest/me-chat.controller';
import { ShopChatController } from './api/rest/shop-chat.controller';
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
import { ForwardChatMessageToWsListener } from './listeners/forward-chat-message-to-ws.listener';

@Module({
  imports: [
    WsModule,
    ShopModule,
    MikroOrmModule.forFeature([
      ChatConversationEntity,
      ChatMessageEntity,
      CurrentUserEntity,
      ShopEntity,
      ProductEntity,
    ]),
  ],
  controllers: [MeChatController, ShopChatController],
  providers: [
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
