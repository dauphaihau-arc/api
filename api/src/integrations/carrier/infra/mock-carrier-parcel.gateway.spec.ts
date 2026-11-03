import { Logger } from '@nestjs/common';
import { once } from 'node:events';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { MockCarrierParcelGateway } from './mock-carrier-parcel.gateway';
import {
  CarrierLabelAlreadyUsedError,
  CarrierLabelNotFoundError,
  CarrierLabelPurchaseUnavailableError,
  CarrierLabelQuoteRejectedError,
  CarrierLabelRefundUnavailableError,
  CarrierRateQuoteUnavailableError,
} from '../app/ports/carrier-parcel.gateway';

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

  it('quotes rates on POST /rates and maps the response', async () => {
    stub = await startStub((response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        rates: [
          {
            quote_id: 'rq_1',
            carrier: 'usps',
            service: 'standard',
            price_minor: 1234,
            currency: 'USD',
            estimated_days: { min: 3, max: 5 },
            expires_at: '2026-11-02T12:15:00.000Z',
          },
        ],
      }));
    });
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    const rates = await gateway.quoteRates({
      weightGrams: 500,
      lengthCm: 10,
      widthCm: 20,
      heightCm: 30,
      currency: 'USD',
    });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/rates');
    expect(JSON.parse(stub.requests[0].body)).toEqual({
      weight_grams: 500,
      length_cm: 10,
      width_cm: 20,
      height_cm: 30,
      currency: 'USD',
    });
    expect(rates).toEqual([
      {
        quoteId: 'rq_1',
        carrier: 'usps',
        service: 'standard',
        priceMinor: 1234,
        currency: 'USD',
        estimatedDays: { min: 3, max: 5 },
        expiresAt: '2026-11-02T12:15:00.000Z',
      },
    ]);
  });

  it('rejects a rate quote when the integration is disabled', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway();

    await expect(
      gateway.quoteRates({
        weightGrams: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(CarrierRateQuoteUnavailableError);

    expect(stub.requests).toHaveLength(0);
  });

  it('rejects a rate quote rejected by the carrier', async () => {
    stub = await startStub((response) => {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end('{"code":"INVALID_PACKAGE"}');
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(
      gateway.quoteRates({
        weightGrams: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(CarrierRateQuoteUnavailableError);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status 400'));
  });

  it('rejects a rate quote when the carrier is unreachable', async () => {
    stub = await startStub((response) => {
      response.destroy();
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(
      gateway.quoteRates({
        weightGrams: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(CarrierRateQuoteUnavailableError);
  });

  it('rejects a rate quote whose payload breaks the shared contract', async () => {
    stub = await startStub((response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"rates":[{"quote_id":"rq_1"}]}');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(
      gateway.quoteRates({
        weightGrams: 500,
        lengthCm: 10,
        widthCm: 10,
        heightCm: 10,
        currency: 'USD',
      }),
    ).rejects.toBeInstanceOf(CarrierRateQuoteUnavailableError);
  });

  it('purchases a label on POST /labels and decodes the PDF', async () => {
    const pdfBase64 = Buffer.from('%PDF-1.4\nlabel\n').toString('base64');
    stub = await startStub((response) => {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        label: {
          label_id: 'lbl_1',
          quote_id: 'rq_1',
          carrier: 'usps',
          service: 'standard',
          tracking_number: '9400111899223197428490',
          price_minor: 980,
          currency: 'USD',
          pdf_base64: pdfBase64,
        },
      }));
    });
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    const label = await gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' });

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/labels');
    expect(JSON.parse(stub.requests[0].body)).toEqual({ quote_id: 'rq_1', currency: 'USD' });
    expect(label).toEqual({
      labelId: 'lbl_1',
      quoteId: 'rq_1',
      carrier: 'usps',
      service: 'standard',
      trackingNumber: '9400111899223197428490',
      priceMinor: 980,
      currency: 'USD',
      pdf: Buffer.from('%PDF-1.4\nlabel\n'),
    });
  });

  it.each([404, 409, 410])(
    'maps a %i label refusal to a quote that must be re-quoted',
    async (status) => {
      stub = await startStub((response) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end('{"error":"QUOTE_INVALID"}');
      });
      jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

      await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
        .rejects.toBeInstanceOf(CarrierLabelQuoteRejectedError);
    },
  );

  it('rejects a label purchase when the integration is disabled', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway();

    await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
      .rejects.toBeInstanceOf(CarrierLabelPurchaseUnavailableError);

    expect(stub.requests).toHaveLength(0);
  });

  it('rejects a label purchase the carrier otherwise fails', async () => {
    stub = await startStub((response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"code":"BOOM"}');
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
      .rejects.toBeInstanceOf(CarrierLabelPurchaseUnavailableError);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status 500'));
  });

  it('rejects a label purchase when the carrier is unreachable', async () => {
    stub = await startStub((response) => {
      response.destroy();
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
      .rejects.toBeInstanceOf(CarrierLabelPurchaseUnavailableError);
  });

  it('rejects a label purchase whose payload breaks the shared contract', async () => {
    stub = await startStub((response) => {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end('{"label":{"label_id":"lbl_1"}}');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
      .rejects.toBeInstanceOf(CarrierLabelPurchaseUnavailableError);
  });

  it('rejects a label purchase whose payload is not a PDF', async () => {
    stub = await startStub((response) => {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        label: {
          label_id: 'lbl_1',
          quote_id: 'rq_1',
          carrier: 'usps',
          service: 'standard',
          tracking_number: '9400111899223197428490',
          price_minor: 980,
          currency: 'USD',
          pdf_base64: Buffer.from('not a pdf').toString('base64'),
        },
      }));
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.purchaseLabel({ quoteId: 'rq_1', currency: 'USD' }))
      .rejects.toBeInstanceOf(CarrierLabelPurchaseUnavailableError);
  });

  it('refunds a label on POST /labels/:label_id/refund', async () => {
    stub = await startStub((response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"label":{"label_id":"lbl_1","status":"voided"}}');
    });
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.refundLabel({ labelId: 'lbl_1' })).resolves.toBeUndefined();

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0].method).toBe('POST');
    expect(stub.requests[0].url).toBe('/labels/lbl_1/refund');
    expect(stub.requests[0].headers['content-type']).toBe('application/json');
    expect(JSON.parse(stub.requests[0].body)).toEqual({});
  });

  it('maps a missing label to CarrierLabelNotFoundError', async () => {
    stub = await startStub((response) => {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end('{"error":"LABEL_NOT_FOUND"}');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.refundLabel({ labelId: 'lbl_missing' }))
      .rejects.toBeInstanceOf(CarrierLabelNotFoundError);
  });

  it('maps a used label to CarrierLabelAlreadyUsedError', async () => {
    stub = await startStub((response) => {
      response.writeHead(409, { 'content-type': 'application/json' });
      response.end('{"error":"LABEL_ALREADY_USED"}');
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.refundLabel({ labelId: 'lbl_1' }))
      .rejects.toBeInstanceOf(CarrierLabelAlreadyUsedError);
  });

  it('rejects a label refund when the integration is disabled', async () => {
    stub = await startStub();
    const gateway = new MockCarrierParcelGateway();

    await expect(gateway.refundLabel({ labelId: 'lbl_1' }))
      .rejects.toBeInstanceOf(CarrierLabelRefundUnavailableError);

    expect(stub.requests).toHaveLength(0);
  });

  it('rejects a label refund the carrier otherwise fails', async () => {
    stub = await startStub((response) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end('{"code":"BOOM"}');
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.refundLabel({ labelId: 'lbl_1' }))
      .rejects.toBeInstanceOf(CarrierLabelRefundUnavailableError);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status 500'));
  });

  it('rejects a label refund when the carrier is unreachable', async () => {
    stub = await startStub((response) => {
      response.destroy();
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gateway = new MockCarrierParcelGateway({ baseUrl: stub.baseUrl });

    await expect(gateway.refundLabel({ labelId: 'lbl_1' }))
      .rejects.toBeInstanceOf(CarrierLabelRefundUnavailableError);
  });
});
