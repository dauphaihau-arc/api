import type { Namespace, Server } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

export type WsMessage = {
  id?: string;
  type: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class WsPublisher {
  private readonly logger = new Logger(WsPublisher.name);
  private server: Server | Namespace | null = null;

  attachServer(server: Server | Namespace): void {
    this.server = server;
  }

  publish(channelKey: string, message: WsMessage): void {
    if (!this.server) {
      this.logger.warn(`Skipping WS publish before server attach for channel ${channelKey}`);
      return;
    }

    this.server.to(channelKey).emit(message.type, message.payload);
  }

  publishToChannels(channelKeys: string[], message: WsMessage): void {
    if (!channelKeys.length) {
      return;
    }

    if (!this.server) {
      this.logger.warn('Skipping WS publish before server attach for multiple channels');
      return;
    }

    this.server.to(channelKeys).emit(message.type, message.payload);
  }
}
