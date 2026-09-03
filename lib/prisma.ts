import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * Prisma client singleton.
 *
 * Prisma 7 requires an explicit driver adapter, so this wires the `pg` driver
 * through `PrismaPg`. Connection settings are tuned for Supabase's connection
 * pooler — the direct `db.<ref>.supabase.co` host is IPv6-only and is
 * unreachable from IPv4-only networks.
 */

function connectionConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL is not set. Copy the Supabase pooler connection string into .env.",
    );
  }

  const url = new URL(raw);

  // `pg` gives the URL's `sslmode` precedence over the `ssl` option below, so
  // it is stripped here and TLS is configured explicitly instead.
  url.searchParams.delete("sslmode");

  // Supabase's pooler serves a certificate signed by its own root CA, which is
  // not in Node's trust store. Verification is therefore off by default: the
  // connection is still encrypted, but not protected against an active MITM.
  // Set DATABASE_CA_CERT to Supabase's CA bundle to turn full verification on.
  const ca = process.env.DATABASE_CA_CERT;

  // The transaction pooler (port 6543) hands out a different backend per
  // statement, so prepared statements must be disabled there. Session mode
  // (5432) keeps one backend per connection and needs no special handling.
  const isTransactionPooler =
    url.port === "6543" || url.searchParams.get("pgbouncer") === "true";

  return {
    connectionString: url.toString(),
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
    // Poolers cap client connections; keep each app instance modest.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    connectionTimeoutMillis: 10_000,
    ...(isTransactionPooler ? { statement_timeout: undefined } : {}),
  };
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg(connectionConfig()),
    // `password_hash` is excluded from every query by default, so it cannot
    // reach a response through a `include: { user: true }` somewhere or a
    // whole-row serialization. The one place that needs it — verifying a
    // sign-in — asks for it explicitly with `omit: { passwordHash: false }`.
    omit: { user: { passwordHash: true } },
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

// `next dev` re-evaluates modules on every hot reload. Without caching the
// client on globalThis, each reload would open a new pool and exhaust the
// pooler's connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
