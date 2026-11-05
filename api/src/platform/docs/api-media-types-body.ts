import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Carries the per-media-type request body schemas from the decorator to the
 * document post-processing in `createApiDocument`.
 *
 * `@nestjs/swagger` applies a single `@ApiBody` schema to every media type
 * declared with `@ApiConsumes`, so a body that differs between media types
 * (JSON without the binary upload, multipart with it) cannot be expressed with
 * the built-in decorator alone. The schemas are kept on the request body as an
 * `x-` extension and expanded into the final `content` map there.
 */
export const MEDIA_TYPE_SCHEMAS_EXTENSION = 'x-request-body-schemas';

type MediaTypeSchema = Record<string, unknown>;
type MediaTypeSchemas = Record<string, MediaTypeSchema>;

/**
 * Documents a request body that accepts more than one media type, with the
 * schema each media type really carries.
 *
 * The first entry also seeds the `@ApiBody` schema so the explorer recognises
 * the operation as having a body; `expandMediaTypeRequestBodies` replaces the
 * resulting `content` with one entry per declared media type.
 */
export function ApiMediaTypesBody(schemas: MediaTypeSchemas): MethodDecorator {
  const mediaTypes = Object.keys(schemas);
  const [primaryMediaType] = mediaTypes;

  return (target, propertyKey, descriptor) => {
    ApiConsumes(...mediaTypes)(target, propertyKey, descriptor);
    ApiBody({
      schema: schemas[primaryMediaType],
      [MEDIA_TYPE_SCHEMAS_EXTENSION]: schemas,
    } as Parameters<typeof ApiBody>[0])(target, propertyKey, descriptor);
  };
}

type RequestBodyWithSchemas = {
  content?: Record<string, { schema?: unknown }>;
  [MEDIA_TYPE_SCHEMAS_EXTENSION]?: MediaTypeSchemas;
};

/**
 * Replaces the request body content emitted by `@ApiMediaTypesBody` with one
 * entry per declared media type, in declaration order.
 *
 * A request body without the extension is left untouched.
 */
export function expandMediaTypeRequestBodies(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem ?? {})) {
      if (!operation || typeof operation !== 'object' || !('requestBody' in operation)) {
        continue;
      }

      const requestBody = operation.requestBody as RequestBodyWithSchemas | undefined;
      const schemas = requestBody?.[MEDIA_TYPE_SCHEMAS_EXTENSION];

      if (!requestBody || !schemas || typeof schemas !== 'object') {
        continue;
      }

      delete requestBody[MEDIA_TYPE_SCHEMAS_EXTENSION];
      requestBody.content = Object.fromEntries(
        Object.entries(schemas).map(([mediaType, schema]) => [mediaType, { schema }]),
      );
    }
  }
}

export type { MediaTypeSchemas };
