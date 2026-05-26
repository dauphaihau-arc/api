import { Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable, Subject, interval } from 'rxjs';
import type { UserSseMessage } from '../app/sse.types';

type UserStream = Subject<MessageEvent>;

const HEARTBEAT_INTERVAL_MS = 25_000;
const RETRY_INTERVAL_MS = 5_000;

@Injectable()
export class SsePublisher {
  private readonly streamsByUserId = new Map<string, Set<UserStream>>();

  createUserStream(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const stream = new Subject<MessageEvent>();
      this.addStream(userId, stream);

      subscriber.next({
        type: 'connected',
        data: {
          connected: true,
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
        this.removeStream(userId, stream);
      };
    });
  }

  publishToUser(userId: string, message: UserSseMessage): void {
    const streams = this.streamsByUserId.get(userId);

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

  private addStream(userId: string, stream: UserStream): void {
    const existingStreams = this.streamsByUserId.get(userId);

    if (existingStreams) {
      existingStreams.add(stream);
      return;
    }

    this.streamsByUserId.set(userId, new Set([stream]));
  }

  private removeStream(userId: string, stream: UserStream): void {
    const streams = this.streamsByUserId.get(userId);

    if (!streams) {
      return;
    }

    streams.delete(stream);

    if (streams.size === 0) {
      this.streamsByUserId.delete(userId);
    }
  }
}
