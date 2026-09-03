import { z } from "zod";

import { TaskPriority, TaskStatus } from "@/app/generated/prisma/enums";

import {
  atLeastOneFieldError,
  hasAtLeastOneKey,
  nullableText,
  offsetPaginationSchema,
  shortText,
  timestampSchema,
  uuidSchema,
} from "./common";

const taskFields = z.object({
  organizationId: uuidSchema,
  farmId: uuidSchema.nullable().optional(),
  fieldId: uuidSchema.nullable().optional(),
  cropCycleId: uuidSchema.nullable().optional(),
  assignedTo: uuidSchema.nullable().optional(),
  title: shortText(200),
  description: nullableText().optional(),
  dueAt: timestampSchema.nullable().optional(),
  // Defaults are applied on the create schema only; on the `.partial()` update
  // schema they would reset an omitted column instead of leaving it alone.
  status: z.enum(TaskStatus),
  priority: z.enum(TaskPriority),
  completedAt: timestampSchema.nullable().optional(),
});

/** Mirrors CHECK (completed_at IS NULL OR status = 'done'). */
const checkCompletion = (
  value: { status?: TaskStatus; completedAt?: Date | null },
  ctx: z.RefinementCtx,
) => {
  if (value.completedAt && value.status !== TaskStatus.done) {
    ctx.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "A completion time is only allowed when the status is 'done'.",
    });
  }
};

/** `organizationId` is resolved from the session; see `createFarmSchema`. */
export const createTaskSchema = taskFields
  .extend({
    organizationId: uuidSchema.optional(),
    status: z.enum(TaskStatus).default(TaskStatus.todo),
    priority: z.enum(TaskPriority).default(TaskPriority.normal),
  })
  .superRefine(checkCompletion);

/** `organizationId` is omitted: tasks cannot be moved between tenants. */
export const updateTaskSchema = taskFields
  .omit({ organizationId: true })
  .partial()
  .superRefine(checkCompletion)
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

export const taskQuerySchema = offsetPaginationSchema.extend({
  /** Omitted, the list covers every organization the caller belongs to. */
  organizationId: uuidSchema.optional(),
  status: z.enum(TaskStatus).optional(),
  priority: z.enum(TaskPriority).optional(),
  assignedTo: uuidSchema.optional(),
  farmId: uuidSchema.optional(),
  dueBefore: timestampSchema.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskQuery = z.infer<typeof taskQuerySchema>;
