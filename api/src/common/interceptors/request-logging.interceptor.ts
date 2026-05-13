import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request | undefined>();
    const response = http.getResponse<Response | undefined>();
    const startedAt = Date.now();

    if (!request || !response) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log(
            `${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms`
          );
        },
        error: () => {
          this.logger.warn(
            `${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms`
          );
        },
      })
    );
  }
}
