import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  isAuthAppError,
  mapAuthAppErrorToHttpException
} from './auth-error-mapper';

@Catch()
export class AuthHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, _host: ArgumentsHost) {
    if (isAuthAppError(exception)) {
      throw mapAuthAppErrorToHttpException(exception);
    }

    throw exception;
  }
}
