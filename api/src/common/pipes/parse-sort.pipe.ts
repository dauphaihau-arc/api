import {
  ArgumentMetadata,
  Injectable,
  PipeTransform
} from '@nestjs/common';
import { parseSortValue } from '../application/sort';
import type { SortOption } from '../application/sort';

@Injectable()
export class ParseSortPipe<TField extends string> implements PipeTransform<unknown, SortOption<TField>> {
  constructor(
    private readonly allowedFields: readonly TField[],
    private readonly defaultSort: SortOption<TField>
  ) {}

  transform(value: unknown, _metadata: ArgumentMetadata): SortOption<TField> {
    return parseSortValue(value, this.allowedFields, this.defaultSort);
  }
}
