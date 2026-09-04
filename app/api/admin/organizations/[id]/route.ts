import {
  apiOk,
  infrastructureError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { verifyOrganizationSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/organizations/:id
 * Body: { verifiedAt: <ISO datetime> | null }
 *
 * Grants verification with a timestamp, or revokes it with null. Platform
 * administrators only — this is the one write in the API that reaches into an
 * organization the caller does not belong to, which is why it is the only
 * thing this endpoint can change: a route that could edit any tenant's name or
 * type would be a much larger hole than the one it is here to fill.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Organization");
  if (!route.ok) return route.response;

  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = verifyOrganizationSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const organization = await prisma.organization.update({
      where: { id: route.id },
      data: { verifiedAt: parsed.data.verifiedAt },
    });

    return apiOk(serialize(organization));
  } catch (error) {
    return writeConflictResponse(error, "Organization")
      ?? infrastructureError("admin-organizations", error);
  }
}
