import type { ValidationError } from '@nestjs/common';
import {
  flattenValidationFields,
  validationExceptionFactory,
} from './validation-exception.factory';

describe('validation-exception factory', () => {
  it('flattens class-validator errors into snake_case request paths with messages', () => {
    const errors: ValidationError[] = [
      {
        property: 'displayName',
        constraints: { isString: 'displayName must be a string' },
      },
      {
        property: 'preferences',
        children: [
          {
            property: 'region',
            constraints: { isIn: 'region must be a valid region' },
          },
        ],
      },
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'productPublicId',
                constraints: { isUuid: 'productPublicId must be a UUID' },
              },
            ],
          },
        ],
      },
    ];

    expect(flattenValidationFields(errors)).toEqual([
      { field: 'display_name', messages: ['displayName must be a string'] },
      { field: 'preferences.region', messages: ['region must be a valid region'] },
      { field: 'items.0.product_public_id', messages: ['productPublicId must be a UUID'] },
    ]);
  });

  it('builds a VALIDATION_FAILED exception with structured details.fields', () => {
    const exception = validationExceptionFactory([
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
      },
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: {
        fields: [{ field: 'email', messages: ['email must be an email'] }],
      },
    });
  });
});
