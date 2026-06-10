import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AUTH_CONFIG, buildAuthConfig } from '~/config/auth.config';
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
import { CreateMyAddressUseCase } from './app/use-cases/create-my-address/create-my-address.use-case';
import { DeleteMyAddressUseCase } from './app/use-cases/delete-my-address/delete-my-address.use-case';
import { GetMyAddressUseCase } from './app/use-cases/get-my-address/get-my-address.use-case';
import { ListMyAddressesUseCase } from './app/use-cases/list-my-addresses/list-my-addresses.use-case';
import { UpdateMyAddressUseCase } from './app/use-cases/update-my-address/update-my-address.use-case';
import { UserResolver } from './api/graphql/user.resolver';
import { MeAddressesController } from './api/rest/me-addresses.controller';
import { UserController } from './api/rest/user.controller';
import { UserAddressCommandRepository } from './app/ports/user-address-command.repository';
import { UserAddressQueryRepository } from './app/ports/user-address-query.repository';
import { UserAddressRepository } from './app/ports/user-address.repository';
import { DelegatingUserAddressRepository } from './infra/user-address.repository';
import { MikroOrmUserAddressCommandRepository } from './infra/mikro-orm-user-address-command.repository';
import { MikroOrmUserAddressQueryRepository } from './infra/mikro-orm-user-address-query.repository';
import { MikroOrmUserRepository } from './infra/mikro-orm-user.repository';
import { UserAddressEntity } from './infra/persistence/entities/user-address.entity';

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
      UserAddressEntity,
    ]),
  ],
  controllers: [UserController, MeAddressesController],
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
    {
      provide: UserAddressCommandRepository,
      useExisting: MikroOrmUserAddressCommandRepository,
    },
    {
      provide: UserAddressQueryRepository,
      useExisting: MikroOrmUserAddressQueryRepository,
    },
    {
      provide: UserAddressRepository,
      useExisting: DelegatingUserAddressRepository,
    },
    DelegatingUserAddressRepository,
    MikroOrmUserAddressCommandRepository,
    MikroOrmUserAddressQueryRepository,
    CreateUserUseCase,
    GetUserByIdUseCase,
    ListUsersUseCase,
    UpdateUserUseCase,
    ListMyAddressesUseCase,
    CreateMyAddressUseCase,
    GetMyAddressUseCase,
    UpdateMyAddressUseCase,
    DeleteMyAddressUseCase,
    UserResolver,
  ],
  exports: [GetMyAddressUseCase],
})
export class UserModule {}
