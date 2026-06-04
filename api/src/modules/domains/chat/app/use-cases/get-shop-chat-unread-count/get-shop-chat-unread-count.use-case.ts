import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetShopChatUnreadCountUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(shopId: string, ownerUserId: string): Promise<number> {
    const rows = await this.entityManager.fork().getConnection().execute<{ total: string }[]>(
      `
        select count(*)::text as total
        from "chat_conversations"
        where "shop_id" = ?
          and "last_message_at" is not null
          and "last_message_sender_user_id" <> ?
          and (
            "seller_last_read_at" is null
            or "seller_last_read_at" < "last_message_at"
          )
      `,
      [shopId, ownerUserId]
    );

    return Number(rows[0]?.total ?? '0');
  }
}
