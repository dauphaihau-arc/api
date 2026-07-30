import { WsPublisher } from './ws.publisher';

describe('WsPublisher', () => {
  it('publishes a message to a single Socket.IO room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const publisher = new WsPublisher();

    publisher.attachServer({ to } as never);
    publisher.publish('user:user-1', {
      type: 'message',
      payload: { eventType: 'chat.message.created' },
    });

    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith('message', {
      eventType: 'chat.message.created',
    });
  });

  it('publishes a message to multiple Socket.IO rooms in one broadcast', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const publisher = new WsPublisher();

    publisher.attachServer({ to } as never);
    publisher.publishToChannels(
      ['conversation:conversation-1', 'user:user-1'],
      {
        type: 'message',
        payload: { eventType: 'chat.message.created' },
      },
    );

    expect(to).toHaveBeenCalledWith(['conversation:conversation-1', 'user:user-1']);
    expect(emit).toHaveBeenCalledWith('message', {
      eventType: 'chat.message.created',
    });
  });
});
