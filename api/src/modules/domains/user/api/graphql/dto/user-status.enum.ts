import { registerEnumType } from '@nestjs/graphql';
import { UserStatus } from '../../../../auth/domain/enums/user-status.enum';

registerEnumType(UserStatus, {
  name: 'UserStatus',
});

export { UserStatus };
