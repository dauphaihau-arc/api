import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class GraphqlThrottlerGuard extends ThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const graphqlRequest = gqlContext.getContext<{ req?: Record<string, any> }>()?.req;

    if (graphqlRequest) {
      return {
        req: graphqlRequest,
        res: graphqlRequest.res ?? graphqlRequest.raw?.res ?? graphqlRequest,
      };
    }

    return super.getRequestResponse(context);
  }
}
