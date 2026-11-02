import { Logger } from '@nestjs/common';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { MockCarrierParcelGateway } from './mock-carrier-parcel.gateway';

type CapturedRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type Stub = {
  baseUrl: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
};

async function startStub(
  respond: (response: ServerResponse) => void = (response) => {
    response.writeHead(202, { 'content-type': 'application/json' });
    response.end('{"parcel":{}}');
  },
): Promise<Stub> {
  const requests: CapturedRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];

    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      respond(response);
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    close: () => server[Symbol.asyncDispose](),
  };
}

describe('MockCarrierParcelGateway', () => {
  let stub: Stub | undefined;

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
    jest.restoreAllMocks();
  });

  it('registers a parcel on POST /parcels', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await gateway.registerParcel({
      carrier: 'usps',
      trackingNumber: '9400111899223197428490',
    });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/parcels');
    expect(stub.requests[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      carrier: 'usps',
      tracking_number: '9400111899223197428490',
    });
  });

  it('signals handover on POST /parcels/:tracking_number/handover', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await gateway.signalHandover({
      carrier: 'vnpost',
      trackingNumber: 'AB123456789VN',
    });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/parcels/AB123456789VN/handover');
    expect(JSON.parse(stub.requests[0].body)).toEqual({ carrier: 'vnpost' });
  });

  it('skips every call when no base URL is configured', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway();

    await expect(
      gateway.registerParcel({ carrier: 'dhl', trackingNumber: '1234567890' }),
    ).resolves.toBeUndefined();
    await expect(
      gateway.signalHandover({ carrier: 'dhl', trackingNumber: '1234567890' }),
    ).resolves.toBeUndefined();

    expect(stub.requests).toHaveLength(0);
  });

  it('logs and swallows an unsuccessful carrier response', async () => {
    stub = await startStub((response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"code":"BOOM"}');
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(
      gateway.registerParcel({ carrier: 'usps', trackingNumber: '9400111899223197428490' }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('status 500'),
    );
  });

  it('logs and swallows a network failure', async () => {
    stub = await startStub((response) => {
      response.destroy();
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(
      gateway.signalHandover({ carrier: 'dhl', trackingNumber: '1234567890' }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('/parcels/1234567890/handover'),
    );
  });
});
