import type {
  RegisterWebPushSubscriptionInput,
  WebPushSubscriptionSummary,
} from '../notification.types';

export abstract class WebPushSubscriptionRepository {
  abstract upsert(
    input: RegisterWebPushSubscriptionInput
  ): Promise<WebPushSubscriptionSummary>;

  abstract deactivateOwnedByEndpoint(
    userId: string,
    endpoint: string
  ): Promise<boolean>;

  abstract findActiveOwnedByUserId(
    userId: string
  ): Promise<WebPushSubscriptionSummary[]>;

  abstract markUsedById(id: string): Promise<void>;

  abstract deactivateById(id: string): Promise<void>;
}
