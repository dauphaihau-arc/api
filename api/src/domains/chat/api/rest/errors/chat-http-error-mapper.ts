import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatAppError,
  ChatConversationAccessDeniedError,
  ChatConversationNotFoundError,
  ChatProductNotFoundError,
  ChatProductShopMismatchError,
  ChatShopNotFoundError,
} from '../../../app/errors/chat-app.error';

export function isChatAppError(error: unknown): error is ChatAppError {
  return error instanceof ChatAppError;
}

export function mapChatAppErrorToHttpException(error: ChatAppError): Error {
  if (error instanceof ChatConversationNotFoundError) {
    return new NotFoundException({
      code: 'CHAT_CONVERSATION_NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ChatShopNotFoundError) {
    return new NotFoundException({
      code: 'CHAT_SHOP_NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ChatProductNotFoundError) {
    return new NotFoundException({
      code: 'CHAT_PRODUCT_NOT_FOUND',
      message: error.message,
    });
  }

  if (error instanceof ChatConversationAccessDeniedError) {
    return new ForbiddenException({
      code: 'CHAT_CONVERSATION_ACCESS_DENIED',
      message: error.message,
    });
  }

  if (error instanceof ChatProductShopMismatchError) {
    return new BadRequestException({
      code: 'CHAT_PRODUCT_SHOP_MISMATCH',
      message: error.message,
    });
  }

  return new BadRequestException({
    code: 'CHAT_REQUEST_INVALID',
    message: error.message,
  });
}
