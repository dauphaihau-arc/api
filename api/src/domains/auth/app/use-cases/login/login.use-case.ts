import { Injectable } from '@nestjs/common';
import { err, Result } from '~/platform/application/result';
import { AuthResponse, LoginUserInput } from '../../auth.types';
import {
  AuthPortalAccessDeniedError,
  InactiveUserError,
  InvalidCredentialsError,
  UserNotFoundError,
} from '../../errors/auth-app.error';
import { canAccessAuthPortal } from '../../portal-access';
import { UserStatus } from '../../../domain/enums/user-status.enum';
import { Email } from '../../../domain/value-objects/email';
import { PasswordHasher } from '../../ports/password-hasher';
import { AuthUserRepository } from '../../ports/auth-user.repository';
import { IssueSessionUseCase } from '../issue-session/issue-session.use-case';

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly authUserRepository: AuthUserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly issueSessionUseCase: IssueSessionUseCase,
  ) {}

  async execute(input: LoginUserInput): Promise<
    Result<
      AuthResponse,
      | AuthPortalAccessDeniedError
      | InactiveUserError
      | InvalidCredentialsError
      | UserNotFoundError
    >
  > {
    const email = Email.create(input.email);
    const loginUser = await this.authUserRepository.findLoginByEmail(email);

    if (!loginUser?.passwordHash) {
      return err(new InvalidCredentialsError());
    }

    if (loginUser.status !== UserStatus.ACTIVE) {
      return err(new InactiveUserError());
    }

    const passwordMatches = await this.passwordHasher.matches(
      input.password,
      loginUser.passwordHash.toString(),
    );

    if (!passwordMatches) {
      return err(new InvalidCredentialsError());
    }

    const user = await this.authUserRepository.findById(loginUser.id);

    if (!user) {
      return err(new UserNotFoundError());
    }

    if (!canAccessAuthPortal(user.roles.map((role) => role.toString()), input.app)) {
      return err(new AuthPortalAccessDeniedError());
    }

    return this.issueSessionUseCase.execute(user.id, undefined, user);
  }
}
