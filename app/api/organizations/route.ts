import { MembershipRole } from "@/app/generated/prisma/enums";
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
import { organizationIdsFor, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { availableSlug, slugify } from "@/lib/slug";
import {
  createOrganizationSchema,
  organizationQuerySchema,
} from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/organizations
 *
 * Body: { name, organizationType, description?, slug? }
 *
 * Any signed-in user may create an organization, and becomes its owner in the
 * same transaction — an organization nobody belongs to would be invisible to
 * every subsequent request, including its creator's.
 *
 * `slug` is NOT NULL UNIQUE in the database but is not part of the documented
 * payload, so it is derived from `name` unless the caller supplies one.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createOrganizationSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const { name, description, organizationType } = parsed.data;
  const requestedSlug = parsed.data.slug;
  const base = requestedSlug ?? slugify(name);

  if (!base) {
    return apiError(
      400,
      "Could not derive a slug from the name. Provide `slug` explicitly.",
      { name: ["Contains no letters or digits to build a slug from."] },
    );
  }

  try {
    // A slug the caller typed is taken at their word, and a collision is their
    // conflict to resolve. One derived from the name is not: two tenants may
    // legitimately share a display name, so a collision takes a suffix rather
    // than failing a request whose slug the caller never saw.
    const slug = requestedSlug
      ? requestedSlug
      : await availableSlug(base, async (candidate) =>
          (await prisma.organization.findUnique({
            where: { slug: candidate },
            select: { id: true },
          })) !== null,
        );

    if (!slug) {
      return apiError(409, "Could not find a free address for that name.", {
        name: ["Too many organizations already use this name."],
      });
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        description: description ?? null,
        organizationType,
        members: {
          create: { userId: auth.session.user.id, role: MembershipRole.owner },
        },
      },
    });

    return apiCreated(
      serialize(organization),
      `/api/organizations/${organization.id}`,
    );
  } catch (error) {
    // Unique violation — only `slug` is unique on this table. With a derived
    // slug this can now only be a race: two requests that picked the same
    // suffix between the availability check and the insert.
    if (isPrismaKnownError(error) && error.code === "P2002") {
      return requestedSlug
        ? apiError(409, `An organization with the slug "${requestedSlug}" already exists.`, {
            slug: ["Already taken."],
          })
        : apiError(409, "That name was taken while this request ran. Try again.", {
            name: ["Try again."],
          });
    }
    return infrastructureError("organizations", error);
  }
}

/**
 * GET /api/organizations?organizationType=&search=&limit=&offset=
 *
 * Lists only the organizations the caller belongs to — this is their tenant
 * list, not a directory of everyone on the platform. `search` matches name or
 * slug case-insensitively.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = organizationQuerySchema.safeParse(
    searchParamsToObject(url.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, organizationType, search } = parsed.data;
  const where = {
    id: { in: organizationIdsFor(auth.session) },
    ...(organizationType ? { organizationType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  try {
    // Counted in the same round trip so `total` cannot drift from the page.
    const [organizations, total] = await prisma.$transaction([
      prisma.organization.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.organization.count({ where }),
    ]);

    return apiOk(serialize(organizations), {
      pagination: paginationMeta(limit, offset, organizations.length, total),
    });
  } catch (error) {
    return infrastructureError("organizations", error);
  }
}
