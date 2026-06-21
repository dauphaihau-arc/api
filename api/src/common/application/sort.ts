import { BadRequestException } from '@nestjs/common';

export type SortDirection = 'asc' | 'desc';

export interface SortOption<TField extends string> {
  field: TField;
  direction: SortDirection;
}

export function parseSortValue<TField extends string>(
  value: unknown,
  allowedFields: readonly TField[],
  defaultSort: SortOption<TField>,
): SortOption<TField> {
  if (value === undefined || value === null || value === '') {
    return defaultSort;
  }

  if (typeof value !== 'string') {
    throw new BadRequestException('sort must be a string');
  }

  const [rawField, rawDirection = 'asc', ...rest] = value.split(':');

  if (!rawField || rest.length > 0) {
    throw new BadRequestException('sort must use the format field:direction');
  }

  if (!allowedFields.includes(rawField as TField)) {
    throw new BadRequestException(
      `sort field must be one of: ${allowedFields.join(', ')}`,
    );
  }

  if (rawDirection !== 'asc' && rawDirection !== 'desc') {
    throw new BadRequestException('sort direction must be asc or desc');
  }

  return {
    field: rawField as TField,
    direction: rawDirection,
  };
}
