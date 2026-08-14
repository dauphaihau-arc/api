import {
  Inject, Injectable, OnApplicationShutdown,
} from '@nestjs/common';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
} from 'amqplib';
import {
  RABBITMQ_CONFIG,
  type RabbitMqConfig,
} from '~/platform/config/rabbitmq.config';
import {
  ORDER_CREATED_INVENTORY_ROUTING_KEY,
  type OrderCreatedInventoryEvent,
} from '../../app/events/order-created-inventory.event';
import { OrderInventoryEventPublisher } from '../../app/ports/order-inventory-event.publisher';

type AmqpConnect = typeof connect;

export const AMQP_CONNECT = Symbol('AMQP_CONNECT');

@Injectable()
export class RabbitMqOrderInventoryEventPublisher
implements OrderInventoryEventPublisher, OnApplicationShutdown {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  constructor(
    @Inject(RABBITMQ_CONFIG)
    private readonly rabbitMqConfig: RabbitMqConfig,
    @Inject(AMQP_CONNECT)
    private readonly connectFn: AmqpConnect = connect,
  ) {}

  async publish(event: OrderCreatedInventoryEvent): Promise<void> {
    const channel = await this.getChannel();

    channel.publish(
      this.rabbitMqConfig.domainEventsExchange,
      ORDER_CREATED_INVENTORY_ROUTING_KEY,
      Buffer.from(JSON.stringify(event)),
      {
        contentType: 'application/json',
        deliveryMode: 2,
        messageId: event.eventId,
        persistent: true,
        timestamp: Math.floor(Date.parse(event.occurredAt) / 1000),
        type: event.eventType,
      },
    );
    await channel.waitForConfirms();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
    this.channel = undefined;
    this.connection = undefined;
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    this.connection = await this.connectFn(this.rabbitMqConfig.url);
    this.channel = await this.connection.createConfirmChannel();

    await this.channel.assertExchange(
      this.rabbitMqConfig.domainEventsExchange,
      'topic',
      { durable: true },
    );
    await this.channel.assertQueue(
      this.rabbitMqConfig.inventoryOrderEventsQueue,
      { durable: true },
    );
    await this.channel.bindQueue(
      this.rabbitMqConfig.inventoryOrderEventsQueue,
      this.rabbitMqConfig.domainEventsExchange,
      ORDER_CREATED_INVENTORY_ROUTING_KEY,
    );

    return this.channel;
  }
}
