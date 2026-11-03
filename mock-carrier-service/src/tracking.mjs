import { randomInt } from 'node:crypto';
import { HttpError } from './http.mjs';
import { CARRIER_PATTERNS } from './constants.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomDigits(length) {
  let out = '';
  for (let index = 0; index < length; index += 1) out += String(randomInt(0, 10));
  return out;
}

function randomLetters(length) {
  let out = '';
  for (let index = 0; index < length; index += 1) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export function generateTrackingNumber(carrier) {
  switch (carrier) {
    case 'usps':
      return `9${randomDigits(21)}`;
    case 'dhl':
      return randomDigits(10);
    case 'vnpost':
      return `${randomLetters(2)}${randomDigits(9)}VN`;
    default:
      throw new HttpError(422, 'UNSUPPORTED_CARRIER', `Unsupported carrier "${carrier}".`);
  }
}

export function isSupportedCarrier(carrier) {
  return typeof carrier === 'string' && Object.hasOwn(CARRIER_PATTERNS, carrier);
}
