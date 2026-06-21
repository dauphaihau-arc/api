import {
  ArgumentMetadata,
  Injectable,
  type PipeTransform,
  ValidationPipe,
} from '@nestjs/common';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';

type NormalizedAttributeFilter = {
  attribute_id: string;
  selected_option_ids?: string[];
  selected_option_keys: string[];
  attribute_name: string;
  selected_option_values: string[];
};

@Injectable()
export class ListPublicProductsQueryPipe
implements PipeTransform<Record<string, unknown>, Promise<ListPublicProductsQueryDto>> {
  private readonly validationPipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  });

  async transform(
    value: Record<string, unknown>,
    metadata: ArgumentMetadata,
  ): Promise<ListPublicProductsQueryDto> {
    const normalizedValue = {
      ...value,
      ...(value.s !== undefined ? { search: value.s } : {}),
      ...(this.parseAttributeFilters(value)
        ? { attributeFilters: this.parseAttributeFilters(value) }
        : {}),
    };

    Object.keys(normalizedValue)
      .filter((key) => /^attr_.+$/i.test(key))
      .forEach((key) => {
        delete normalizedValue[key];
      });

    return this.validationPipe.transform(normalizedValue, {
      ...metadata,
      metatype: ListPublicProductsQueryDto,
      type: 'query',
    });
  }

  private parseAttributeFilters(
    source: Record<string, unknown>,
  ): NormalizedAttributeFilter[] | undefined {
    const filters = new Map<string, NormalizedAttributeFilter>();

    Object.entries(source).forEach(([key, rawValue]) => {
      const match = /^attr_(.+)$/.exec(key);

      if (!match?.[1]) {
        return;
      }

      const attributeId = match[1].trim();

      if (!attributeId) {
        return;
      }

      const values = Array.isArray(rawValue)
        ? rawValue
        : typeof rawValue === 'string'
          ? [rawValue]
          : [];
      const selectedOptionValues = values
        .flatMap((entry) => entry.split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (selectedOptionValues.length === 0) {
        return;
      }

      const existing = filters.get(attributeId);
      filters.set(attributeId, {
        attribute_id: attributeId,
        attribute_name: attributeId,
        selected_option_keys: Array.from(new Set([
          ...(existing?.selected_option_keys ?? []),
          ...selectedOptionValues,
        ])),
        selected_option_values: Array.from(new Set([
          ...(existing?.selected_option_values ?? []),
          ...selectedOptionValues,
        ])),
      });
    });

    return filters.size > 0
      ? Array.from(filters.values())
      : undefined;
  }
}
