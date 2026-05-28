import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AuthenticatedUser } from '../../domains/auth/app/auth.types';
import {
  REQUEST_CONTEXT_CLS_KEYS,
  type RequestContext
} from './request-context.bootstrap';

export type RequestContextSnapshot = RequestContext & {
  actorId?: string;
  actorEmail?: string;
  sessionId?: string;
};

@Injectable()
export class RequestContextService {
  constructor(private readonly clsService: ClsService) {}

  get(): RequestContextSnapshot {
    return {
      requestId:
        this.clsService.getId() ??
        this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.requestId),
      ipAddress: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.ipAddress),
      userAgent: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.userAgent),
      marketCode: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.marketCode),
      currency: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.currency),
      locale: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.locale),
      channel: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.channel),
      actorId: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.actorId),
      actorEmail: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.actorEmail),
      sessionId: this.clsService.get(REQUEST_CONTEXT_CLS_KEYS.sessionId),
    };
  }

  setRequestContext(requestContext: RequestContext): void {
    if (requestContext.requestId) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.requestId, requestContext.requestId);
    }

    if (requestContext.ipAddress) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.ipAddress, requestContext.ipAddress);
    }

    if (requestContext.userAgent) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.userAgent, requestContext.userAgent);
    }

    if (requestContext.marketCode) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.marketCode, requestContext.marketCode);
    }

    if (requestContext.currency) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.currency, requestContext.currency);
    }

    if (requestContext.locale) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.locale, requestContext.locale);
    }

    if (requestContext.channel) {
      this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.channel, requestContext.channel);
    }
  }

  setAuthenticatedUser(user: AuthenticatedUser): void {
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.actorId, user.userId);
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.actorEmail, user.email);
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.sessionId, user.sessionId);
  }
}
