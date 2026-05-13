import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AUTH_CONFIG, buildAuthConfig } from '../../../config/auth.config';
import { CacheModule } from '../../shared/cache/cache.module';
import { AuthSessionRepository } from './app/ports/auth-session.repository';
import { AuthTokenService } from './app/ports/auth-token.service';
import { AuthUserRepository } from './app/ports/auth-user.repository';
import { PasswordHasher } from './app/ports/password-hasher';
import { TokenHasher } from './app/ports/token-hasher';
import { UserPreferenceRepository } from './app/ports/user-preference.repository';
import { GetCurrentUserUseCase } from './app/use-cases/get-current-user.use-case';
import { LoadAuthenticatedUserUseCase } from './app/use-cases/load-authenticated-user.use-case';
import { LoginUseCase } from './app/use-cases/login.use-case';
import { LogoutUseCase } from './app/use-cases/logout.use-case';
import { RefreshSessionUseCase } from './app/use-cases/refresh-session.use-case';
import { RegisterUseCase } from './app/use-cases/register.use-case';
import { IssueSessionUseCase } from './app/use-cases/shared/issue-session.use-case';
import { AuthController } from './api/rest/auth.controller';
import { JwtAuthGuard } from './api/guard/jwt-auth.guard';
import { PermissionsGuard } from './api/guard/permissions.guard';
import { AuthHttpExceptionFilter } from './api/rest/auth-http-exception.filter';
import { JwtStrategy } from './infra/jwt.strategy';
import { AuthCookieService } from './api/rest/auth-cookie.utils';
import { CurrentUserEntity } from './infra/persistence/entities/current-user.entity';
import { CurrentUserCredentialEntity } from './infra/persistence/entities/current-user-credential.entity';
import { EmailVerificationTokenEntity } from './infra/persistence/entities/email-verification-token.entity';
import { MikroOrmAuthSessionRepository } from './infra/persistence/mikro-orm-auth-session.repository';
import { MikroOrmAuthUserRepository } from './infra/persistence/mikro-orm-auth-user.repository';
import { PermissionEntity } from './infra/persistence/entities/permission.entity';
import { PasswordResetTokenEntity } from './infra/persistence/entities/password-reset-token.entity';
import { RoleEntity } from './infra/persistence/entities/role.entity';
import { RolePermissionEntity } from './infra/persistence/entities/role-permission.entity';
import { UserPreferenceEntity } from './infra/persistence/entities/user-preference.entity';
import { MikroOrmUserPreferenceRepository } from './infra/persistence/mikro-orm-user-preference.repository';
import { BcryptPasswordHasher } from './infra/security/bcrypt-password-hasher';
import { JwtAuthTokenService } from './infra/security/jwt-auth-token.service';
import { Sha256TokenHasher } from './infra/security/sha256-token-hasher';
import { UserSessionEntity } from './infra/persistence/entities/user-session.entity';
import { UserRoleEntity } from './infra/persistence/entities/user-role.entity';
import { IdempotencyModule } from '../../shared/idempotency/idempotency.module';

const authEntities = [
  CurrentUserEntity,
  CurrentUserCredentialEntity,
  UserSessionEntity,
  PasswordResetTokenEntity,
  EmailVerificationTokenEntity,
  RoleEntity,
  PermissionEntity,
  UserRoleEntity,
  RolePermissionEntity,
  UserPreferenceEntity,
];

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    IdempotencyModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const authConfig = buildAuthConfig(configService);

        return {
          secret: authConfig.jwtAccessSecret,
          signOptions: {
            expiresIn: authConfig.jwtAccessTtlSeconds,
          },
        };
      },
    }),
    MikroOrmModule.forFeature(authEntities),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildAuthConfig(configService),
    },
    {
      provide: AuthUserRepository,
      useClass: MikroOrmAuthUserRepository,
    },
    {
      provide: AuthSessionRepository,
      useClass: MikroOrmAuthSessionRepository,
    },
    {
      provide: PasswordHasher,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: UserPreferenceRepository,
      useClass: MikroOrmUserPreferenceRepository,
    },
    {
      provide: TokenHasher,
      useClass: Sha256TokenHasher,
    },
    {
      provide: AuthTokenService,
      useClass: JwtAuthTokenService,
    },
    RegisterUseCase,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    LoadAuthenticatedUserUseCase,
    IssueSessionUseCase,
    AuthHttpExceptionFilter,
    AuthCookieService,
    JwtStrategy,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [JwtAuthGuard, PermissionsGuard],
})
export class AuthModule {}
