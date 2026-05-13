import { Field, ObjectType } from '@nestjs/graphql';
import { PaginationMetaType } from './pagination-meta.type';
import { UserType } from './user.type';

@ObjectType()
export class UserPageType {
  @Field(() => [UserType])
  items!: UserType[];

  @Field(() => PaginationMetaType)
  meta!: PaginationMetaType;
}
