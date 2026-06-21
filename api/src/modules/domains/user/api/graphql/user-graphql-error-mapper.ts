import { GraphQLError } from 'graphql';
import type { UserAppError } from '../../app/errors/user-app.error';
import {
  ActorNotAllowedToCreateUsersError,
  UserEmailAlreadyRegisteredError,
} from '../../app/errors/user-app.error';

export function mapUserAppErrorToGraphQLError(
  error: UserAppError,
): GraphQLError {
  if (error instanceof ActorNotAllowedToCreateUsersError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'FORBIDDEN',
      },
    });
  }

  if (error instanceof UserEmailAlreadyRegisteredError) {
    return new GraphQLError(error.message, {
      extensions: {
        code: 'EMAIL_ALREADY_REGISTERED',
      },
    });
  }

  return new GraphQLError(error.message, {
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}
