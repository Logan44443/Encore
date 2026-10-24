const isProd = process.env.NODE_ENV === "production";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set. On your Mac it goes in apps/api/.env; in production, in Render's Environment page.`);
  }
  return value;
}

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  /** Supabase's session pooler connection string, with the database password in it. */
  databaseUrl: required("DATABASE_URL"),
  databasePoolSize: Number(process.env.DATABASE_POOL_SIZE ?? 5),
  /** https://<project>.supabase.co */
  supabaseUrl: required("SUPABASE_URL").replace(/\/+$/, ""),
  /** Server-only key (sb_secret_…): creates and deletes accounts. Never sent to the app. */
  supabaseSecretKey: required("SUPABASE_SECRET_KEY"),
  /** Set when running behind a proxy/load balancer so rate limits key on the real client IP. */
  trustProxy: process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true",
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
  tmdbApiKey: process.env.TMDB_API_KEY || null,
  tmdbReadToken: process.env.TMDB_READ_TOKEN || null,
  /** Optional: Google Books fills in book covers and blurbs Open Library is missing. */
  googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || null,
  setlistFmApiKey: process.env.SETLISTFM_API_KEY || null,
  musicBrainzUserAgent: process.env.MUSICBRAINZ_USER_AGENT || "Encore/0.1 (https://github.com/encore)",
};
