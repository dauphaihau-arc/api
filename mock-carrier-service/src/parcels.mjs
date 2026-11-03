import { randomUUID } from 'node:crypto';
import {
  ALLOWED_EVENT_CODES,
  AUTO_SCHEDULE,
  CARRIER_PATTERNS,
  DEFAULT_LOCATION,
  JOURNEY_EVENT_CODES,
  SUPPORTED_CARRIERS,
} from './constants.mjs';
import { HttpError } from './http.mjs';
import { generateTrackingNumber, isSupportedCarrier } from './tracking.mjs';

function cloneParcel(parcel) {
  return {
    carrier: parcel.carrier,
    tracking_number: parcel.tracking_number,
    handed_over_at: parcel.handed_over_at,
    auto: parcel.auto,
    events: parcel.events.map((event) => ({ ...event })),
  };
}

function unsupportedCarrier(carrier) {
  return new HttpError(
    422,
    'UNSUPPORTED_CARRIER',
    `Unsupported carrier "${String(carrier)}". Supported carriers: ${SUPPORTED_CARRIERS.join(', ')}.`,
  );
}

function parcelNotFound(trackingNumber) {
  return new HttpError(404, 'PARCEL_NOT_FOUND', `No parcel with tracking number ${trackingNumber}.`);
}

/**
 * In-memory parcels and their journey timers. Every operation either returns a
 * response shape for the router or throws an HttpError the router serializes.
 */
export function createParcelService({ now, scheduler, deliver }) {
  /** tracking_number -> parcel */
  const parcels = new Map();
  /** tracking_number -> Set<timer handle> */
  const timers = new Map();

  const emitEvent = (parcel, eventCode, location) => {
    const event = {
      event_id: `evt-${randomUUID()}`,
      event_code: eventCode,
      location: location || DEFAULT_LOCATION,
      occurred_at: new Date(now()).toISOString(),
    };
    parcel.events.push(event);
    return event;
  };

  const cancelTimers = (trackingNumber) => {
    const handles = timers.get(trackingNumber);
    if (!handles) return;
    for (const handle of handles) scheduler.cancel(handle);
    timers.delete(trackingNumber);
  };

  const fireAutoEvent = async (parcel, eventCode) => {
    // A manual advance cancels timers and clears `auto`; guard against a timer
    // that was already dequeued when that happened.
    if (!parcel.auto || !parcels.has(parcel.tracking_number)) return;
    await deliver(parcel, emitEvent(parcel, eventCode));
  };

  const scheduleAutoEvents = (parcel) => {
    const handles = new Set();
    timers.set(parcel.tracking_number, handles);

    for (const [delayMs, eventCode] of AUTO_SCHEDULE) {
      const handle = scheduler.schedule(() => {
        handles.delete(handle);
        return fireAutoEvent(parcel, eventCode);
      }, delayMs);
      handles.add(handle);
    }
  };

  const assertRequestedCarrier = (body, parcel) => {
    if (body.carrier === undefined || body.carrier === null) return;
    if (!isSupportedCarrier(body.carrier)) {
      throw unsupportedCarrier(body.carrier);
    }
    if (parcel && body.carrier !== parcel.carrier) {
      throw new HttpError(
        409,
        'CARRIER_MISMATCH',
        `Parcel ${parcel.tracking_number} belongs to carrier "${parcel.carrier}".`,
      );
    }
  };

  function register(body) {
    const carrier = body.carrier;
    if (!isSupportedCarrier(carrier)) {
      throw unsupportedCarrier(carrier);
    }

    const supplied = body.tracking_number;
    let trackingNumber;
    if (supplied === undefined || supplied === null) {
      let attempts = 0;
      do {
        trackingNumber = generateTrackingNumber(carrier);
        attempts += 1;
      } while (parcels.has(trackingNumber) && attempts < 100);
    } else if (typeof supplied !== 'string' || !CARRIER_PATTERNS[carrier].test(supplied)) {
      throw new HttpError(
        422,
        'INVALID_TRACKING_NUMBER',
        `Tracking number "${String(supplied)}" does not match the ${carrier} format.`,
      );
    } else {
      trackingNumber = supplied;
    }

    const existing = parcels.get(trackingNumber);
    if (existing) {
      if (existing.carrier !== carrier) {
        // Tracking-number spaces are disjoint; this guards a hand-crafted clash.
        throw new HttpError(
          409,
          'TRACKING_NUMBER_CONFLICT',
          `Tracking number ${trackingNumber} is already registered for ${existing.carrier}.`,
        );
      }
      return { status: 200, parcel: cloneParcel(existing) };
    }

    const parcel = {
      carrier,
      tracking_number: trackingNumber,
      handed_over_at: null,
      auto: false,
      events: [],
    };
    parcels.set(trackingNumber, parcel);

    return { status: 201, parcel: cloneParcel(parcel) };
  }

  async function handover(trackingNumber, body) {
    const parcel = parcels.get(trackingNumber) ?? null;
    assertRequestedCarrier(body, parcel);
    if (!parcel) throw parcelNotFound(trackingNumber);

    if (parcel.handed_over_at) {
      // Repeated handover is a no-op: no rescheduling, no duplicate scans.
      return { status: 202, parcel: cloneParcel(parcel) };
    }

    parcel.handed_over_at = new Date(now()).toISOString();
    parcel.auto = true;
    scheduleAutoEvents(parcel);

    await deliver(parcel, emitEvent(parcel, 'PICKED_UP'));

    return { status: 202, parcel: cloneParcel(parcel) };
  }

  async function advance(trackingNumber, body) {
    const parcel = parcels.get(trackingNumber) ?? null;
    assertRequestedCarrier(body, parcel);
    if (!parcel) throw parcelNotFound(trackingNumber);
    if (!parcel.handed_over_at) {
      throw new HttpError(409, 'NOT_HANDED_OVER', 'Parcel has not been handed over yet.');
    }

    let eventCode = body.event_code;
    if (eventCode === undefined || eventCode === null) {
      eventCode = JOURNEY_EVENT_CODES.find(
        (code) => !parcel.events.some((event) => event.event_code === code),
      );
      if (!eventCode) {
        throw new HttpError(409, 'JOURNEY_COMPLETE', 'Every journey event was already emitted.');
      }
    } else if (typeof eventCode !== 'string' || !ALLOWED_EVENT_CODES.includes(eventCode)) {
      throw new HttpError(
        400,
        'INVALID_EVENT_CODE',
        `Invalid event_code "${String(eventCode)}". Allowed: ${ALLOWED_EVENT_CODES.join(', ')}.`,
      );
    }

    const location = typeof body.location === 'string' && body.location ? body.location : undefined;

    cancelTimers(parcel.tracking_number);
    parcel.auto = false;

    const event = emitEvent(parcel, eventCode, location);
    await deliver(parcel, event);

    return { status: 200, parcel: cloneParcel(parcel), emitted: { ...event } };
  }

  function get(trackingNumber) {
    const parcel = parcels.get(trackingNumber);
    return parcel ? cloneParcel(parcel) : null;
  }

  /** True once the parcel has emitted any scan (the first carrier event). */
  function hasEvents(trackingNumber) {
    const parcel = parcels.get(trackingNumber);
    return Boolean(parcel && parcel.events.length > 0);
  }

  /**
   * Removes a parcel and cancels its timers, so later handover/advance/read
   * answer 404. Used by label refunds for parcels that never emitted a scan.
   */
  function retire(trackingNumber) {
    if (!parcels.has(trackingNumber)) return false;
    cancelTimers(trackingNumber);
    parcels.delete(trackingNumber);
    return true;
  }

  function count() {
    return parcels.size;
  }

  function close() {
    for (const trackingNumber of [...timers.keys()]) cancelTimers(trackingNumber);
  }

  return { register, handover, advance, get, hasEvents, retire, count, close };
}
