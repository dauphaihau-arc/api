import type { ArgumentMetadata } from '@nestjs/common';
import { ListPublicProductsQueryPipe } from './list-public-products-query.pipe';
import { ListPublicProductsQueryDto } from './dto/list-public-products.query.dto';

describe('ListPublicProductsQueryPipe', () => {
  const pipe = new ListPublicProductsQueryPipe();
  const metadata: ArgumentMetadata = {
    type: 'query',
    metatype: ListPublicProductsQueryDto,
    data: '',
  };

  it('maps public snake_case query fields into the DTO shape', async () => {
    await expect(pipe.transform({
      category_id: 'fb2c943d-9091-4496-bcbc-d599a95bdd34',
      page: '1',
      limit: '16',
      is_digital: 'true',
      who_made: 'i_did',
      min_price: '20000',
      max_price: '50000',
      // Public API uses `s` as the search query parameter.
      // eslint-disable-next-line id-length
      s: 'bag',
    }, metadata)).resolves.toMatchObject({
      categoryId: 'fb2c943d-9091-4496-bcbc-d599a95bdd34',
      page: 1,
      limit: 16,
      isDigital: true,
      whoMade: 'i_did',
      minPrice: 20000,
      maxPrice: 50000,
      search: 'bag',
    });
  });

  it('maps attr_* query params into attributeFilters', async () => {
    await expect(pipe.transform({
      category_id: 'fb2c943d-9091-4496-bcbc-d599a95bdd34',
      attr_material: 'cotton,nylon',
      attr_color: 'blue',
    }, metadata)).resolves.toMatchObject({
      categoryId: 'fb2c943d-9091-4496-bcbc-d599a95bdd34',
      attributeFilters: [
        {
          attribute_id: 'material',
          selected_option_keys: ['cotton', 'nylon'],
          selected_option_values: ['cotton', 'nylon'],
        },
        {
          attribute_id: 'color',
          selected_option_keys: ['blue'],
          selected_option_values: ['blue'],
        },
      ],
    });
  });
});
