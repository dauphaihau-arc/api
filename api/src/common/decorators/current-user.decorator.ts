import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { AuthenticatedUser } from '../../modules/domains/auth/app/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const gqlContext = GqlExecutionContext.create(context);
    const graphqlRequest = gqlContext.getContext<{
      req?: { user?: AuthenticatedUser };
    }>()?.req;
    if (graphqlRequest) {
      return graphqlRequest.user as AuthenticatedUser;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  }
);
