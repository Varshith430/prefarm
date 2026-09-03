import { z } from "zod";

import { MembershipRole, OrganizationType } from "@/app/generated/prisma/enums";

import {
  atLeastOneFieldError,
  hasAtLeastOneKey,
  nullableText,
  offsetPaginationSchema,
  searchTermSchema,
  shortText,
  slugSchema,
  uuidSchema,
} from "./common";

/**
 * Organization classification. Stored lowercase to match the other enums in
 * db/schema.sql, but accepted case- and separator-insensitively so clients may
 * post "FARM", "farm", "Input Supplier", or "input-supplier".
 */
export const organizationTypeSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
      : value,
  z.enum(OrganizationType),
);

const organizationFields = z.object({
  name: shortText(160),
  description: nullableText().optional(),
  organizationType: organizationTypeSchema,
  /** Optional: derived from `name` via `slugify()` when omitted. */
  slug: slugSchema.optional(),
});

export const createOrganizationSchema = organizationFields;

export const updateOrganizationSchema = organizationFields
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

const userFields = z.object({
  email: z.email().trim().max(254).toLowerCase(),
  fullName: shortText(160),
  phone: nullableText(32).optional(),
});

export const createUserSchema = userFields;

export const updateUserSchema = userFields
  .partial()
  .refine(hasAtLeastOneKey, atLeastOneFieldError);

/** Adds a user to an organization, or changes an existing member's role. */
export const upsertMembershipSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
  role: z.enum(MembershipRole).default(MembershipRole.viewer),
});

export const removeMembershipSchema = z.object({
  organizationId: uuidSchema,
  userId: uuidSchema,
});

/** Filters for GET /api/organizations. `search` matches name or slug. */
export const organizationQuerySchema = offsetPaginationSchema.extend({
  organizationType: organizationTypeSchema.optional(),
  search: searchTermSchema.optional(),
});

/** Filters for GET /api/users. `search` matches full name or email. */
export const userQuerySchema = offsetPaginationSchema.extend({
  organizationId: uuidSchema.optional(),
  search: searchTermSchema.optional(),
});

export type OrganizationQuery = z.infer<typeof organizationQuerySchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpsertMembershipInput = z.infer<typeof upsertMembershipSchema>;
