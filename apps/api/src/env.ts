export interface ApiEnv {
  host: string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  databaseUrl: string;
  redisUrl: string | null;
  storageDir: string;
}

export function loadEnv(): ApiEnv {
  return {
    host: process.env.API_HOST ?? "0.0.0.0",
    port: Number.parseInt(process.env.API_PORT ?? "3000", 10),
    jwtSecret: process.env.JWT_SECRET ?? "naxeu-dev-secret-change-me-please-32chars",
    corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    databaseUrl: process.env.DATABASE_URL ?? "postgres://naxeu:naxeu@localhost:5432/naxeu",
    redisUrl: process.env.REDIS_URL ?? null,
    storageDir: process.env.STORAGE_DIR ?? "/data/storage",
  };
}
