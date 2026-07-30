import { DomainError } from '~/platform/errors/domain.error';

export abstract class ChatAppError extends DomainError {
  protected constructor(message: string) {
    super(message);
  }
}

export class ChatConversationNotFoundError extends ChatAppError {
  constructor() {
    super('Chat conversation was not found');
  }
}

export class ChatConversationAccessDeniedError extends ChatAppError {
  constructor() {
    super('You do not have access to this conversation');
  }
}

export class ChatShopNotFoundError extends ChatAppError {
  constructor() {
    super('Shop was not found');
  }
}

export class ChatProductNotFoundError extends ChatAppError {
  constructor() {
    super('Product was not found');
  }
}

export class ChatProductShopMismatchError extends ChatAppError {
  constructor() {
    super('Product does not belong to the selected shop');
  }
}
