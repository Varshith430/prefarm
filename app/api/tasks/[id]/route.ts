import {
  apiError,
  apiOk,
  infrastructureError,
  isPrismaKnownError,
  notFoundError,
  parseRouteId,
  readJsonBody,
  validationError,
  writeConflictResponse,
} from "@/lib/api";
import { READ, WRITE, requireResourceRole, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serialize } from "@/lib/serialize";
import { TaskStatus } from "@/lib/types";
import { updateTaskSchema } from "@/lib/validations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** GET /api/tasks/:id — the task with everything it is attached to. */
export async function GET(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Task");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "task", route.id, READ);
  if (!access.ok) return access.response;

  try {
    const task = await prisma.task.findUnique({
      where: { id: route.id },
      include: {
        assignee: true,
        farm: true,
        field: true,
        cropCycle: { include: { crop: true } },
      },
    });

    if (!task) return notFoundError("Task");
    return apiOk(serialize(task));
  } catch (error) {
    return infrastructureError("tasks", error);
  }
}

/**
 * PATCH /api/tasks/:id
 * Body: any subset of { title, description, farmId, fieldId, cropCycleId,
 *                       assignedTo, dueAt, status, priority, completedAt }
 *
 * `completed_at` is kept consistent with `status` here, matching
 * CHECK (completed_at IS NULL OR status = 'done'):
 *
 * - moving to `done` stamps the completion time, unless the caller supplied
 *   one or the task already carried one from an earlier completion;
 * - moving off `done` (reopening, or cancelling) clears it.
 *
 * Without this, reopening a finished task would be rejected by the database
 * rather than by anything the caller did wrong.
 */
export async function PATCH(request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Task");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "task", route.id, WRITE);
  if (!access.ok) return access.response;

  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const parsed = updateTaskSchema.safeParse(body.value);
  if (!parsed.success) return validationError(parsed.error);

  const update = parsed.data;

  try {
    const task = await prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({ where: { id: route.id } });
      if (!existing) return null;

      const status = update.status ?? existing.status;

      let completedAt: Date | null | undefined = update.completedAt;
      if (update.status !== undefined && completedAt === undefined) {
        completedAt =
          status === TaskStatus.done ? (existing.completedAt ?? new Date()) : null;
      }

      return tx.task.update({
        where: { id: route.id },
        data: { ...update, ...(completedAt !== undefined ? { completedAt } : {}) },
        include: {
          assignee: true,
          farm: true,
          field: true,
          cropCycle: { include: { crop: true } },
        },
      });
    });

    if (!task) return notFoundError("Task");
    return apiOk(serialize(task));
  } catch (error) {
    if (isPrismaKnownError(error) && error.code === "P2003") {
      return apiError(422, "A referenced farm, field, crop cycle, or user does not exist.");
    }
    return writeConflictResponse(error, "Task") ?? infrastructureError("tasks", error);
  }
}

/**
 * DELETE /api/tasks/:id
 *
 * Deleting a task is WRITE rather than MANAGE: a task is a day-to-day record
 * that cascades to nothing, unlike a farm or a field.
 */
export async function DELETE(_request: Request, context: Context) {
  const route = parseRouteId((await context.params).id, "Task");
  if (!route.ok) return route.response;

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const access = await requireResourceRole(auth.session, "task", route.id, WRITE);
  if (!access.ok) return access.response;

  try {
    await prisma.task.delete({ where: { id: route.id } });
    return new Response(null, { status: 204 });
  } catch (error) {
    return writeConflictResponse(error, "Task") ?? infrastructureError("tasks", error);
  }
}
