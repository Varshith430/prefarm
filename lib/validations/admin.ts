import { z } from "zod";

import { booleanQueryParam, offsetPaginationSchema, searchTermSchema, timestampSchema } from "./common";
import { organizationTypeSchema } from "./organization";

/**
 * The platform administrator's view of organizations. Unlike every other list
 * endpoint this one is not scoped to the caller's memberships — seeing every
 * tenant is the entire point of it — so the filters are about triage rather
 * than access.
 */
export const adminOrganizationQuerySchema = offsetPaginationSchema.extend({
  /** `true` for the queue awaiting verification, `false` for those granted it. */
  unverified: booleanQueryParam.optional(),
  organizationType: organizationTypeSchema.optional(),
  search: searchTermSchema.optional(),
});

/**
 * Grants or revokes verification.
 *
 * `verifiedAt` is required and explicit: a timestamp grants it, `null` takes
 * it back. Sending the moment rather than a bare `verify: true` keeps the
 * column meaning "when this was granted", and makes revocation the same
 * request rather than a second endpoint.
 */
export const verifyOrganizationSchema = z.object({
  verifiedAt: timestampSchema.nullable(),
});

export type AdminOrganizationQuery = z.infer<typeof adminOrganizationQuerySchema>;
export type VerifyOrganizationInput = z.infer<typeof verifyOrganizationSchema>;
