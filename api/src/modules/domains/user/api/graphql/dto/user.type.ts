import { Field, ID, ObjectType } from '@nestjs/graphql';
import { UserStatus } from './user-status.enum';

@ObjectType()
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field()
  version!: number;

  @Field()
  email!: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field({ nullable: true })
  avatar?: string;

  @Field(() => UserStatus)
  status!: UserStatus;
}
