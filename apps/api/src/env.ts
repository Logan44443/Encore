const isProd = process.env.NODE_ENV === "production";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (isProd) throw new Error("JWT_SECRET must be set in production");
  console.warn("[env] JWT_SECRET not set — using an insecure development secret");
  return "encore-dev-secret-change-me";
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL || null,
  pgliteDir: process.env.PGLITE_DIR ?? "./.data/pglite",
  jwtSecret: jwtSecret(),
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
  tmdbApiKey: process.env.TMDB_API_KEY || null,
  tmdbReadToken: process.env.TMDB_READ_TOKEN || null,
  setlistFmApiKey: process.env.SETLISTFM_API_KEY || null,
  musicBrainzUserAgent: process.env.MUSICBRAINZ_USER_AGENT || "Encore/0.1 (https://github.com/encore)",
};
