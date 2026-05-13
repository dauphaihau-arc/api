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
  }

  setAuthenticatedUser(user: AuthenticatedUser): void {
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.actorId, user.userId);
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.actorEmail, user.email);
    this.clsService.set(REQUEST_CONTEXT_CLS_KEYS.sessionId, user.sessionId);
  }
}
