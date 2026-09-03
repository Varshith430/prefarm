import { z } from "zod";

import { shortText } from "./common";
import { organizationTypeSchema } from "./organization";

/**
 * Password rules.
 *
 * Length is the requirement that actually correlates with strength, so this
 * asks for a long password rather than a menu of character classes. The upper
 * bound is a denial-of-service guard: every candidate is run through a
 * memory-hard KDF, so unbounded input would be a free way to burn server time.
 */
export const passwordSchema = z
  .string()
  .min(10, { error: "Use at least 10 characters." })
  .max(200, { error: "Use at most 200 characters." })
  .refine((value) => value.trim().length >= 10, {
    error: "Cannot be mostly whitespace.",
  });

/** Sign-in identifiers are matched case-insensitively, as `users.email` is stored lowercase. */
const emailSchema = z.email().trim().max(254).toLowerCase();

/**
 * Registration. An organization may be created in the same request, which
 * makes the new user its owner — the common case of someone signing up to run
 * their own farm rather than being invited into an existing tenant.
 */
export const registerSchema = z.object({
  email: emailSchema,
  fullName: shortText(160),
  password: passwordSchema,
  phone: z.string().trim().max(32).optional(),
  organization: z
    .object({
      name: shortText(160),
      organizationType: organizationTypeSchema,
    })
    .optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});

/**
 * Changing a password requires the current one, so someone who finds an
 * unattended signed-in browser cannot lock the owner out of their account.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Enter your current password." }).max(200),
    newPassword: passwordSchema,
    /** Ends sessions on other devices. On by default after a password change. */
    revokeOtherSessions: z.boolean().default(true),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    error: "The new password must differ from the current one.",
    path: ["newPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
