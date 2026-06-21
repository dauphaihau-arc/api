import ms, { type StringValue } from 'ms';

export function parseDurationToMilliseconds(
  value: string | undefined,
  fallbackInMilliseconds: number,
): number {
  if (!value) {
    return fallbackInMilliseconds;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const parsedDuration = ms(value as StringValue);

  if (typeof parsedDuration !== 'number') {
    return fallbackInMilliseconds;
  }

  return parsedDuration;
}

export function parseDurationToSeconds(
  value: string | undefined,
  fallbackInSeconds: number,
): number {
  return Math.floor(
    parseDurationToMilliseconds(value, fallbackInSeconds * 1000) / 1000,
  );
}
