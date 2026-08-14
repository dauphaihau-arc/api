import type { ConfigService } from '@nestjs/config';

export interface RabbitMqConfig {
  url: string;
  domainEventsExchange: string;
  inventoryOrderEventsQueue: string;
}

export const RABBITMQ_CONFIG = Symbol('RABBITMQ_CONFIG');

export function buildRabbitMqConfig(
  configService: Pick<ConfigService, 'get'>,
): RabbitMqConfig {
  return {
    url: configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@127.0.0.1:5672',
    ),
    domainEventsExchange: configService.get<string>(
      'RABBITMQ_DOMAIN_EVENTS_EXCHANGE',
      'arc.domain-events',
    ),
    inventoryOrderEventsQueue: configService.get<string>(
      'RABBITMQ_INVENTORY_ORDER_EVENTS_QUEUE',
      'inventory.order-events',
    ),
  };
}
