import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import type { SseMessage } from '../app/sse.types';

type SseStream = Subject<MessageEvent>;

const HEARTBEAT_INTERVAL_MS = 25_000;
const RETRY_INTERVAL_MS = 5_000;

@Injectable()
export class SsePublisher {
  private readonly streamsByChannelKey = new Map<string, Set<SseStream>>();

  createChannelStream(
    channelKey: string,
    connectedData?: Record<string, unknown>
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const stream = new Subject<MessageEvent>();
      this.addStream(channelKey, stream);

      subscriber.next({
        type: 'connected',
        data: {
          connected: true,
          ...(connectedData ?? {}),
        },
        retry: RETRY_INTERVAL_MS,
      });

      const streamSubscription = stream.subscribe(subscriber);
      const heartbeatSubscription = interval(HEARTBEAT_INTERVAL_MS).subscribe(() => {
        subscriber.next({
          type: 'heartbeat',
          data: {
            at: new Date().toISOString(),
          },
        });
      });

      return () => {
        heartbeatSubscription.unsubscribe();
        streamSubscription.unsubscribe();
        stream.complete();
        this.removeStream(channelKey, stream);
      };
    });
  }

  publish(channelKey: string, message: SseMessage): void {
    const streams = this.streamsByChannelKey.get(channelKey);

    this.publishToStreams(streams, message);
  }

  private publishToStreams(
    streams: Set<SseStream> | undefined,
    message: SseMessage
  ): void {

    if (!streams || streams.size === 0) {
      return;
    }

    const event: MessageEvent = {
      id: message.id,
      type: message.type,
      data: message.data,
      retry: message.retry,
    };

    for (const stream of streams) {
      stream.next(event);
    }
  }

  private addStream(channelKey: string, stream: SseStream): void {
    const existingStreams = this.streamsByChannelKey.get(channelKey);

    if (existingStreams) {
      existingStreams.add(stream);
      return;
    }

    this.streamsByChannelKey.set(channelKey, new Set([stream]));
  }

  private removeStream(channelKey: string, stream: SseStream): void {
    const streams = this.streamsByChannelKey.get(channelKey);

    if (!streams) {
      return;
    }

    streams.delete(stream);

    if (streams.size === 0) {
      this.streamsByChannelKey.delete(channelKey);
    }
  }
}
