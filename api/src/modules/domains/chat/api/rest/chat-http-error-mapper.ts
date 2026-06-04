import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import {
  ChatAppError,
  ChatConversationAccessDeniedError,
  ChatConversationNotFoundError,
  ChatProductNotFoundError,
  ChatProductShopMismatchError,
  ChatShopNotFoundError
} from '../../app/errors/chat-app.error';

export function isChatAppError(error: unknown): error is ChatAppError {
  return error instanceof ChatAppError;
}

export function mapChatAppErrorToHttpException(error: ChatAppError): Error {
  if (error instanceof ChatConversationNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ChatShopNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ChatProductNotFoundError) {
    return new NotFoundException(error.message);
  }

  if (error instanceof ChatConversationAccessDeniedError) {
    return new ForbiddenException(error.message);
  }

  if (error instanceof ChatProductShopMismatchError) {
    return new BadRequestException(error.message);
  }

  return new BadRequestException(error.message);
}
