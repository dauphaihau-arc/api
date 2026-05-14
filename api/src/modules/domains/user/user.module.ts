import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AUTH_CONFIG, buildAuthConfig } from '../../../config/auth.config';
import { CacheModule } from '../../shared/cache/cache.module';
import { StorageModule } from '../../shared/storage/storage.module';
import { CurrentUserEntity } from '../auth/infra/persistence/entities/current-user.entity';
import { CurrentUserCredentialEntity } from '../auth/infra/persistence/entities/current-user-credential.entity';
import { PermissionEntity } from '../auth/infra/persistence/entities/permission.entity';
import { RoleEntity } from '../auth/infra/persistence/entities/role.entity';
import { RolePermissionEntity } from '../auth/infra/persistence/entities/role-permission.entity';
import { UserRoleEntity } from '../auth/infra/persistence/entities/user-role.entity';
import { AuthUserRepository } from '../auth/app/ports/auth-user.repository';
import { PasswordHasher } from '../auth/app/ports/password-hasher';
import { MikroOrmAuthUserRepository } from '../auth/infra/persistence/mikro-orm-auth-user.repository';
import { BcryptPasswordHasher } from '../auth/infra/security/bcrypt-password-hasher';
import { UserRepository } from './app/ports/user.repository';
import { CreateUserUseCase } from './app/use-cases/create-user/create-user.use-case';
import { GetUserByIdUseCase } from './app/use-cases/get-user-by-id/get-user-by-id.use-case';
import { ListUsersUseCase } from './app/use-cases/list-users/list-users.use-case';
import { UpdateUserUseCase } from './app/use-cases/update-user/update-user.use-case';
import { UserResolver } from './api/graphql/user.resolver';
import { UserController } from './api/rest/user.controller';
import { MikroOrmUserRepository } from './infra/mikro-orm-user.repository';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    StorageModule,
    MikroOrmModule.forFeature([
      CurrentUserEntity,
      CurrentUserCredentialEntity,
      RoleEntity,
      PermissionEntity,
      UserRoleEntity,
      RolePermissionEntity,
    ]),
  ],
  controllers: [UserController],
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
      provide: PasswordHasher,
      useClass: BcryptPasswordHasher,
    },
    {
      provide: UserRepository,
      useClass: MikroOrmUserRepository,
    },
    CreateUserUseCase,
    GetUserByIdUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    UserResolver,
  ],
})
export class UserModule {}
