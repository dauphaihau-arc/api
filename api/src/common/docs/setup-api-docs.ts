import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const DOCS_PATH = '/docs';
const OPENAPI_JSON_PATH = `${DOCS_PATH}/openapi.json`;

function renderScalarDocument(openApiUrl: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Arc API Reference</title>
    <style>
      body {
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '${openApiUrl}',
      })
    </script>
  </body>
</html>`;
}

export function setupApiDocs(app: INestApplication): void {
  const accessCookieName = process.env.AUTH_COOKIE_ACCESS_NAME ?? 'accessToken';
  const refreshCookieName = process.env.AUTH_COOKIE_REFRESH_NAME ?? 'refreshToken';
  const httpAdapter = app.getHttpAdapter().getInstance();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Arc API')
      .setDescription('REST API reference for the Arc backend.')
      .setVersion('1.0.0')
      .addSecurity('accessCookie', {
        type: 'apiKey',
        in: 'cookie',
        name: accessCookieName,
        description: `Session access token cookie (${accessCookieName}).`,
      })
      .addSecurity('refreshCookie', {
        type: 'apiKey',
        in: 'cookie',
        name: refreshCookieName,
        description: `Session refresh token cookie (${refreshCookieName}).`,
      })
      .build(),
    {
      deepScanRoutes: true,
      operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
    }
  );

  SwaggerModule.setup(DOCS_PATH, app, document, {
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: OPENAPI_JSON_PATH,
  });

  httpAdapter.get(DOCS_PATH, (_request: Request, response: Response) => {
    response
      .type('html')
      .send(renderScalarDocument(OPENAPI_JSON_PATH));
  });
}
