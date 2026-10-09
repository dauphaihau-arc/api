import { Catch, Injectable } from '@nestjs/common';
import { DomainExceptionFilter } from '~/platform/filters/domain-exception.filter';
import { isChatAppError, mapChatAppErrorToHttpException } from './chat-http-error-mapper';

/** Maps Chat domain errors to their HTTP contract. */
@Injectable()
@Catch()
export class ChatExceptionsFilter extends DomainExceptionFilter {
  protected mapDomainError(exception: unknown): Error | null {
    return isChatAppError(exception)
      ? mapChatAppErrorToHttpException(exception)
      : null;
  }
}
