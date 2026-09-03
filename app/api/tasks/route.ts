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
  resolveOrganizationId,
  scopeToMemberships,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { createTaskSchema, taskQuerySchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tasks
 * Body: { organizationId, title, description?, farmId?, fieldId?, cropCycleId?,
 *         assignedTo?, dueAt?, status?, priority?, completedAt? }
 *
 * The farm, field, and crop cycle links are all optional and independent: a
 * task can be pinned to as much or as little of the hierarchy as is known —
 * but each one given is checked against the caller's memberships, so a task
 * cannot be used to attach itself to another tenant's land.
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = createTaskSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const {
    farmId,
    fieldId,
    cropCycleId,
    assignedTo,
    title,
    description,
    dueAt,
    status,
    priority,
    completedAt,
  } = parsed.data;

  const target = resolveOrganizationId(auth.session, parsed.data.organizationId, WRITE);
  if (!target.ok) return target.response;

  const organizationId = target.organizationId;

  // Each optional link is authorized separately; they can point anywhere in
  // the hierarchy, so membership in the task's own organization is not enough.
  for (const [kind, id] of [
    ["farm", farmId],
    ["field", fieldId],
    ["cropCycle", cropCycleId],
  ] as const) {
    if (!id) continue;
    const access = await requireResourceRole(auth.session, kind, id, WRITE);
    if (!access.ok) return access.response;
  }

  // An assignee must be someone the caller shares an organization with,
  // otherwise the endpoint would confirm which arbitrary user ids exist.
  if (assignedTo) {
    const shared = await prisma.organizationMember.findFirst({
      where: { userId: assignedTo, organizationId },
      select: { userId: true },
    });
    if (!shared) {
      return apiError(422, "The assignee is not a member of this organization.", {
        assignedTo: ["Not a member of this organization."],
      });
    }
  }

  try {
    const task = await prisma.task.create({
      data: {
        organizationId,
        farmId: farmId ?? null,
        fieldId: fieldId ?? null,
        cropCycleId: cropCycleId ?? null,
        assignedTo: assignedTo ?? null,
        title,
        description: description ?? null,
        dueAt: dueAt ?? null,
        status,
        priority,
        completedAt: completedAt ?? null,
      },
    });

    return apiCreated(serialize(task), `/api/tasks/${task.id}`);
  } catch (error) {
    // Every reference was checked above, so this means one was deleted while
    // the request was in flight.
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(409, "A referenced record was removed while this request ran.");
    }
    return infrastructureError("tasks", error);
  }
}

/**
 * GET /api/tasks?organizationId=&status=&priority=&assignedTo=&farmId=&dueBefore=
 *
 * Scoped to the caller's memberships; `organizationId` narrows to one of them.
 * Ordering puts the soonest deadline first, with undated tasks last rather
 * than at the head of an ascending sort.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = taskQuerySchema.safeParse(searchParamsToObject(url.searchParams));
  if (!parsed.success) return validationError(parsed.error);

  const { limit, offset, status, priority, assignedTo, farmId, dueBefore } =
    parsed.data;

  if (farmId) {
    const access = await requireResourceRole(auth.session, "farm", farmId, READ);
    if (!access.ok) return access.response;
  }

  const scope = scopeToMemberships(auth.session, parsed.data.organizationId);
  if (!scope.ok) return scope.response;

  const where = {
    ...scope.where,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(assignedTo ? { assignedTo } : {}),
    ...(farmId ? { farmId } : {}),
    ...(dueBefore ? { dueAt: { lt: dueBefore } } : {}),
  };

  try {
    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        include: { assignee: true, farm: true, field: true },
        orderBy: [
          { dueAt: { sort: "asc", nulls: "last" } },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    return apiOk(serialize(tasks), {
      pagination: paginationMeta(limit, offset, tasks.length, total),
    });
  } catch (error) {
    return infrastructureError("tasks", error);
  }
}
