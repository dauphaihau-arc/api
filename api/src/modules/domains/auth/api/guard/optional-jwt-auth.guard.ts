import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const graphqlRequest = gqlContext.getContext<{ req?: unknown }>()?.req;

    if (graphqlRequest) {
      return graphqlRequest;
    }

    return context.switchToHttp().getRequest();
  }

  handleRequest<TUser = unknown>(err: unknown, user: TUser) {
    if (err || !user) {
      return null;
    }

    return user;
  }
}
