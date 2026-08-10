import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '~/domains/auth/app/auth.types';

@Injectable()
export class GetMyChatUnreadCountUseCase {
  constructor(private readonly entityManager: EntityManager) {}

  async execute(actor: AuthenticatedUser): Promise<number> {
    const rows = await this.entityManager.fork().getConnection().execute<{ total: string }[]>(
      `
        select count(*)::text as total
        from "chat_conversations"
        where "buyer_user_id" = ?
          and "buyer_unread_count" > 0
      `,
      [actor.userId],
    );

    return Number(rows[0]?.total ?? '0');
  }
}
