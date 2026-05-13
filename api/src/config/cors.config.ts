type CorsEnv = Partial<Record<'CORS_ALLOWED_ORIGINS', string>>;

export function parseCorsAllowedOrigins(env: CorsEnv): string[] {
  const rawOrigins = env.CORS_ALLOWED_ORIGINS?.trim();

  if (!rawOrigins) {
    return [];
  }

  return rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
