import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';

type Runtime = 'api' | 'worker';

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}

export function buildPinoLoggerParams(runtime: Runtime): Params {
  const level = process.env.LOG_LEVEL?.trim() || 'info';
  const pretty = parseBoolean(process.env.LOG_PRETTY, false);

  return {
    pinoHttp: {
      autoLogging: false,
      level,
      messageKey: 'message',
      quietReqLogger: true,
      quietResLogger: true,
      serializers: {
        err: pino.stdSerializers.err,
        req: serializeRequest,
        res: serializeResponse,
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        bindings: ({ hostname, pid }) => ({
          hostname,
          pid,
          runtime,
          service: 'arc-api',
        }),
        level: (label) => ({
          level: label,
        }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'headers.authorization',
          'headers.cookie',
        ],
        remove: true,
      },
      ...(pretty
        ? {
          transport: {
            options: {
              colorize: true,
              singleLine: true,
            },
            target: 'pino-pretty',
          },
        }
        : {}),
    },
  };
}

function serializeRequest(request: IncomingMessage & {
  id?: string | number;
  method?: string;
  originalUrl?: string;
  url?: string;
  route?: {
    path?: string | RegExp;
  };
}): Record<string, string | number | undefined> {
  return {
    id: request.id,
    method: request.method,
    route: resolveRoutePath(request.route?.path),
    url: request.originalUrl ?? request.url,
  };
}

function serializeResponse(
  response: ServerResponse & {
    statusCode?: number;
  }
): Record<string, number | undefined> {
  return {
    statusCode: response.statusCode,
  };
}

function resolveRoutePath(path?: string | RegExp): string | undefined {
  if (typeof path === 'string') {
    return path;
  }

  if (path instanceof RegExp) {
    return path.toString();
  }

  return undefined;
}
