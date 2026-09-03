import { getCurrentSession, organizationIdsFor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Prisma's driver adapter needs Node APIs, and a health check must never be
// served from a cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strips anything resembling a connection string out of error text. */
function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]*/gi, "postgresql://[redacted]");
}

/**
 * GET /api/health
 *
 * Intentionally reachable without a session: an uptime probe cannot sign in,
 * and a liveness check that requires credentials stops being a liveness check.
 * It therefore reveals only that the service and its database are up.
 *
 * The row counts are the part worth protecting — platform-wide totals would
 * tell an anonymous caller how big the business is — so they are returned only
 * to a signed-in caller, and then only for that caller's own organizations.
 */
export async function GET() {
  const startedAt = Date.now();
  const session = await getCurrentSession();

  try {
    // Round-trips the pool and proves the schema is reachable through the
    // generated client, not just that a socket opened.
    const [version] = await prisma.$queryRaw<
      { server_version: string }[]
    >`SELECT current_setting('server_version') AS server_version`;

    const organizationIds = session ? organizationIdsFor(session) : [];

    const counts = session
      ? await (async () => {
          const [organizations, farms, sensors] = await Promise.all([
            prisma.organization.count({ where: { id: { in: organizationIds } } }),
            prisma.farm.count({ where: { organizationId: { in: organizationIds } } }),
            prisma.sensor.count({
              where: { field: { farm: { organizationId: { in: organizationIds } } } },
            }),
          ]);
          return { organizations, farms, sensors };
        })()
      : null;

    return Response.json(
      {
        status: "ok",
        database: {
          connected: true,
          postgres: version?.server_version ?? null,
          latencyMs: Date.now() - startedAt,
        },
        ...(counts ? { counts } : {}),
        checkedAt: new Date().toISOString(),
      },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[health] database check failed:", error);

    return Response.json(
      {
        status: "error",
        database: {
          connected: false,
          latencyMs: Date.now() - startedAt,
          error: safeMessage(error),
        },
        checkedAt: new Date().toISOString(),
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
