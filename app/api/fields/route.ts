import {
  apiCreated,
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  paginationMeta,
  readJsonBody,
  searchParamsToObject,
  validationError,
} from "@/lib/api";
import {
  READ,
  WRITE,
  requireResourceRole,
  requireUser,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createFieldSchema, fieldQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fields
 * Body: { farmId, name, areaHectares, soilType?, status? }
 *
 * The tenant comes from the parent farm rather than the payload: whoever may
 * write to the farm may add a field to it, and a farm in another organization
 * is refused before anything is written.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createFieldSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { farmId, name, areaHectares, soilType, status } = parsed.data;

  const access = await requireResourceRole(auth.session, "farm", farmId, WRITE);
  if (!access.ok) return access.response;

  try {
    const field = await prisma.field.create({
      data: { farmId, name, areaHectares, soilType: soilType ?? null, status },
    });

    return apiCreated(serialize(field), `/api/fields/${field.id}`);
  } catch (error) {
    if (isPrismaKnownError(error)) {
      // UNIQUE (farm_id, name)
      if (error.code === "P2002") {
        return apiError(409, `This farm already has a field named "${name}".`, {
          name: ["Already used within this farm."],
        });
      }
      // The farm was proven to exist by the access check above.
      if (error.code === "P2003") {
        return apiError(409, "The farm was removed while this request ran.");
      }
    }
    return infrastructureError("fields", error);
  }
}

/**
 * GET /api/fields?farmId=&organizationId=&status=&limit=&offset=
 *
 * Always filtered through the parent farm's organization, so the result can
 * only ever contain fields belonging to tenants the caller is a member of.
 * `farmId` narrows further, and is authorized on its own so that naming
 * another tenant's farm is a 403 rather than an empty list.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = fieldQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, farmId, status } = parsed.data;

  if (farmId) {
    const access = await requireResourceRole(auth.session, "farm", farmId, READ);
    if (!access.ok) return access.response;
  }

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  const where = {
    ...(farmId ? { farmId } : {}),
    farm: scope.where,
    ...(status ? { status } : {}),
  };

  try {
    const [fields, total] = await prisma.$transaction([
      prisma.field.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.field.count({ where }),
    ]);

    return apiOk(serialize(fields), {
      pagination: paginationMeta(limit, offset, fields.length, total),
    });
  } catch (error) {
    return infrastructureError("fields", error);
  }
}
