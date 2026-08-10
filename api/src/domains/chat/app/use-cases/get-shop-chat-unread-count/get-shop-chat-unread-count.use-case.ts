import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetShopChatUnreadCountUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(shopId: string): Promise<number> {
    const rows = await this.entityManager.fork().getConnection().execute<{ total: string }[]>(
      `
        select count(*)::text as total
        from "chat_conversations"
        where "shop_id" = ?
          and "seller_unread_count" > 0
      `,
      [shopId],
    );

    return Number(rows[0]?.total ?? '0');
  }
}
