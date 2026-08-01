# Chat WebSocket Flow

This document explains the API-side websocket contract for chat clients that connect to the chat gateway and subscribe to conversation rooms.

It covers:

- how a chat client connects to the websocket gateway
- how the API authenticates the socket connection
- how the API authorizes `conversation.subscribe`
- how the socket joins a conversation room
- how new chat messages are pushed back to subscribed clients in realtime

## Overview

The websocket flow has two distinct authorization steps:

1. Socket connection authentication
2. Conversation room authorization

The first step proves who the user is. The second step proves that this user is allowed to join a specific chat conversation room.

At a high level:

1. A chat client starts a Socket.IO connection against `/ws`.
2. API authenticates the socket from the access cookie in the websocket handshake.
3. API joins the socket to the user-scoped room `user:{userId}`.
4. A chat client emits `conversation.subscribe` with a `conversation_id`.
5. API verifies that the authenticated user may access that conversation as the buyer, seller, or admin.
6. API joins the socket to `conversation:{conversationId}`.
7. When a new message is created, the API publishes a websocket event to that room.

```text
+----------------------------------------------------------------------------------+
| Chat client opens websocket connection                                           |
| - Socket.IO namespace: /ws                                                       |
| - auth comes from the access cookie in the handshake                             |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| API WsGateway.handleConnection()                                                 |
| - reads access cookie from handshake headers                                     |
| - verifies JWT via AuthTokenService                                              |
| - loads authenticated session via LoadAuthenticatedUserUseCase                   |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| Connection result                                                                |
| - if auth fails: emit system.error(UNAUTHORIZED) and disconnect                  |
| - if auth succeeds: store client.data.authenticatedUser                          |
| - join room: user:{userId}                                                       |
| - emit system.connected                                                          |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| Chat client emits conversation.subscribe                                         |
| payload: { conversation_id }                                                     |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| API subscribeConversation()                                                      |
| - requires authenticated socket                                                  |
| - loads ChatConversationEntity                                                   |
| - checks actor is buyer, shop owner, or admin                                   |
| - if allowed: join room conversation:{conversationId}                            |
| - returns { ok: true, conversation_id }                                          |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| Later: REST message send creates chat message                                    |
| POST /me/chat/conversations/:conversation_id/messages                            |
| - SendMyChatMessageUseCase persists message                                      |
| - emits CHAT_MESSAGE_CREATED_EVENT                                               |
+----------------------------------------------------------------------------------+
                                      |
                                      v
+----------------------------------------------------------------------------------+
| ForwardChatMessageToWsListener                                                   |
| - publishes websocket message event to:                                          |
|   - conversation:{conversationId}                                                |
|   - user:{senderUserId}                                                          |
|   - user:{recipientUserId}                                                       |
|   - shop:{shopId}                                                                |
+----------------------------------------------------------------------------------+
```

## Client Example

One concrete client implementation lives in storefront:

- `apps/web/apps/storefront/src/app/components/chat/chat-conversation-panel.vue`
- `apps/web/apps/storefront/src/shared/realtime/chat-events.client.ts`

Relevant behavior:

- `onMounted()` starts the websocket client
- a watcher subscribes to the active conversation when `conversationId` is present
- `onBeforeUnmount()` unsubscribes and stops the client

The socket URL is derived from the public API base URL and always targets `/ws`.

## API Gateway

The API entry point is:

- `apps/api/api/src/modules/shared/ws/api/ws.gateway.ts`

This gateway is declared as:

- Socket.IO namespace: `/ws`
- CORS enabled with credentials

That means chat clients connect to the API websocket namespace using the same cookie-based auth model as the REST API.

## Connection Authentication

When the socket connects, Nest runs `handleConnection()`.

`handleConnection()` does the following:

1. Calls `authenticate(client)`.
2. Reads the access cookie from `client.handshake.headers.cookie`.
3. Verifies the access token through `AuthTokenService`.
4. Loads the authenticated session and user through `LoadAuthenticatedUserUseCase`.
5. Rejects the socket if the token is missing, invalid, or tied to an inactive session.

If authentication fails:

- API emits:
  - event: `system.error`
  - payload: `{ code: 'UNAUTHORIZED', message: 'Authentication is required' }`
- API then disconnects the socket

If authentication succeeds:

- API stores the authenticated user on `client.data.authenticatedUser`
- API joins the socket to `user:{userId}`
- API emits `system.connected`

The user room matters because later chat events are broadcast not only to conversation rooms but also to per-user rooms.

## Conversation Subscription

After the socket is connected, a chat client subscribes to an active conversation by emitting:

- event: `conversation.subscribe`
- payload: `{ conversation_id: string }`

The API handles this with `@SubscribeMessage('conversation.subscribe')`.

That handler does the following:

1. Verifies the socket still has `authenticatedUser`.
2. Calls `canAccessConversation(authenticatedUser, conversation_id)`.
3. Loads the conversation from the database.
4. Populates `buyerUser` and `shop.ownerUser`.
5. Checks whether the actor is:
   - the buyer in the conversation
   - the seller who owns the shop for the conversation
   - an admin
6. Rejects the subscription if none of those conditions match.
7. Joins the socket to `conversation:{conversationId}` if allowed.

Success response:

```json
{
  "ok": true,
  "conversation_id": "..."
}
```

Failure response:

```json
{
  "ok": false,
  "error": "FORBIDDEN"
}
```

This is the critical security boundary for room membership. A client cannot join an arbitrary conversation room just by knowing a conversation id. The socket user must be the buyer, the seller for that shop conversation, or an admin.

## Conversation Unsubscribe

When a client switches conversations or unmounts its chat surface, it emits:

- event: `conversation.unsubscribe`

The API handler removes the socket from:

- `conversation:{conversationId}`

No database access is required for unsubscribe. The gateway assumes that leaving a room is always safe.

## Message Creation Path

Once the socket has joined the conversation room, it can receive realtime events for that conversation.

The message creation path starts in the REST API, not the websocket gateway:

- `POST /me/chat/conversations/:conversation_id/messages`

That endpoint is implemented in:

- `apps/api/api/src/modules/domains/chat/api/rest/me-chat.controller.ts`
- `apps/api/api/src/modules/domains/chat/app/use-cases/send-my-chat-message/send-my-chat-message.use-case.ts`

The send-message use case:

1. Loads the conversation.
2. Verifies the authenticated user is the buyer for that conversation.
3. Creates a `chat_messages` row.
4. Updates the parent conversation summary fields:
   - `lastMessageAt`
   - `lastMessageSenderUser`
   - `buyerLastReadAt`
5. Emits the domain event `CHAT_MESSAGE_CREATED_EVENT`.

## WebSocket Fan-Out

Realtime delivery happens in:

- `apps/api/api/src/modules/domains/chat/listeners/forward-chat-message-to-ws.listener.ts`

That listener reacts to `CHAT_MESSAGE_CREATED_EVENT` and publishes a websocket `message` event to multiple channel keys:

- `conversation:{conversationId}`
- `user:{senderUserId}`
- `user:{recipientUserId}`
- `shop:{shopId}` when available

For conversation-scoped updates, the important room is:

- `conversation:{conversationId}`

That is why the earlier `conversation.subscribe` step matters: only subscribed sockets in that room receive the conversation-scoped event immediately.

## Redis-Backed Room Fan-Out

Room fan-out is backed by the Socket.IO Redis adapter, not only by in-memory room state inside one API process.

The Redis adapter is attached in:

- `apps/api/api/src/modules/shared/ws/infra/ws-redis-adapter.service.ts`

During gateway initialization:

1. `WsGateway.afterInit()` attaches the namespace to `WsPublisher`.
2. `WsGateway.afterInit()` also calls `WsRedisAdapterService.attach(namespace)`.
3. `WsRedisAdapterService` creates a Redis publish client and a duplicate subscribe client.
4. It installs `createAdapter(pubClient, subClient)` onto the Socket.IO server.

At that point, websocket room broadcasts are no longer limited to sockets connected to the same Node.js process that emitted the event.

This matters for horizontal scale:

- without the Redis adapter, `server.to(room).emit(...)` only reaches sockets connected to the local API instance
- with the Redis adapter, the emit is forwarded through Redis pub/sub so other API instances can deliver the event to their own local sockets in the same room

In practice, that means:

1. a REST request can create a chat message on API instance A
2. the domain event listener can publish the websocket event from instance A
3. a recipient connected to API instance B can still receive the event if that socket has joined `conversation:{conversationId}` or another targeted room

Redis is therefore the cross-instance transport for websocket delivery, while Socket.IO rooms remain the logical addressing model.

## Event Shape

The listener publishes a websocket event of type `message` with a payload shaped like:

```json
{
  "event_type": "chat.message.created",
  "conversation_id": "conversation-id",
  "shop_id": "shop-id",
  "message": {
    "id": "message-id",
    "body": "Hello",
    "sender_user_id": "user-id",
    "occurred_at": "2026-06-04T00:00:00.000Z",
    "metadata": null
  }
}
```

Storefront maps that payload into its local `MyChatMessage` shape and updates the Vue Query caches.

## Why Both REST and WebSocket Are Used

Chat clients typically use both:

- REST for authoritative fetch and mutation
- WebSocket for incremental realtime delivery

REST is still responsible for:

- loading message history
- sending a message
- marking a conversation as read

WebSocket is responsible for:

- pushing newly created messages without waiting for polling

Some clients may still keep periodic refetches as a fallback, but the websocket path is the low-latency update channel.

## Related Files

Example client:

- `apps/web/apps/storefront/src/app/components/chat/chat-conversation-panel.vue`
- `apps/web/apps/storefront/src/shared/realtime/chat-events.client.ts`

API:

- `apps/api/api/src/modules/shared/ws/api/ws.gateway.ts`
- `apps/api/api/src/modules/domains/chat/api/rest/me-chat.controller.ts`
- `apps/api/api/src/modules/domains/chat/app/use-cases/send-my-chat-message/send-my-chat-message.use-case.ts`
- `apps/api/api/src/modules/domains/chat/listeners/forward-chat-message-to-ws.listener.ts`

## Summary

The API websocket behavior is intentionally split:

- `handleConnection()` authenticates the socket once
- `conversation.subscribe` authorizes access to one specific room
- message creation happens in REST use cases
- a domain event listener fans the result out over websocket rooms

This keeps message writes inside the application layer while using the websocket gateway only for authenticated room membership and realtime delivery.
