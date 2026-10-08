import { ArgumentsHost, Catch } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';

/**
 * Base class for the per-domain exception filters.
 *
 * A filter translates the domain errors its owning mapper understands and hands
 * the mapped exception to `GlobalExceptionFilter`, so status codes, response
 * bodies, request-context logging and error reporting stay exactly as they were
 * when a controller threw the mapped exception itself. Anything the domain does
 * not own falls through untouched.
 */
@Catch()
export abstract class DomainExceptionFilter extends GlobalExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(this.mapDomainError(exception) ?? exception, host);
  }

  /**
   * Returns the HTTP exception for a domain error of this filter's domain, or
   * `null` when the exception belongs to another layer.
   */
  protected abstract mapDomainError(exception: unknown): Error | null;
}
