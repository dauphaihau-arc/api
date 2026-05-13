import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const graphqlRequest = gqlContext.getContext<{ req?: unknown }>()?.req;

    if (graphqlRequest) {
      return graphqlRequest;
    }

    return context.switchToHttp().getRequest();
  }
}
