import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AUTH_REQUIRED_PERMISSIONS_KEY } from '~/common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../app/auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(
        AUTH_REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = this.getRequest(context);
    const currentUser = request.user;

    if (!currentUser) {
      return false;
    }

    const hasAllPermissions = requiredPermissions.every((permission) =>
      currentUser.permissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Missing required permissions');
    }

    return true;
  }

  private getRequest(context: ExecutionContext) {
    const gqlContext = GqlExecutionContext.create(context);
    const graphqlRequest = gqlContext.getContext<{
      req?: { user?: AuthenticatedUser };
    }>()?.req;

    if (graphqlRequest) {
      return graphqlRequest;
    }

    return context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
  }
}
