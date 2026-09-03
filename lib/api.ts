/**
 * Shared helpers for route handlers.
 *
 * Every endpoint answers with the `ActionResult` shape from lib/types.ts:
 * `{ ok: true, data }` or `{ ok: false, error, fieldErrors? }`.
 */

import { z } from "zod";

import type { PaginationMeta } from "./types";
import { uuidSchema } from "./validations/common";

/** Prisma error codes that mean "the database was unreachable", not "bad input". */
export const CONNECTION_ERROR_CODES = [
  "P1000", // authentication failed
  "P1001", // can't reach database server
  "P1002", // server reached but timed out
  "P1008", // operation timed out
  "P1017", // server closed the connection
  "P2024", // connection pool timeout
];

export function apiError(
  status: number,
  error: string,
  fieldErrors?: Record<string, string[]>,
): Response {
  return Response.json(
    { ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

/** Turns a ZodError into a 400 with per-field messages a form can consume. */
export function validationError(error: z.ZodError): Response {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return apiError(
    400,
    formErrors[0] ?? "Validation failed.",
    fieldErrors as Record<string, string[]>,
  );
}

/** Reads a JSON body, returning a 400 response instead of throwing. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: apiError(400, "Request body must be valid JSON."),
    };
  }
}

/**
 * Narrows an unknown error to a Prisma known-request error. Checked
 * structurally so routes need not import the generated error class.
 */
export function isPrismaKnownError(
  error: unknown,
): error is { code: string; meta?: Record<string, unknown> } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

/** 503 for connectivity failures, otherwise a logged, opaque 500. */
export function infrastructureError(scope: string, error: unknown): Response {
  if (isPrismaKnownError(error) && CONNECTION_ERROR_CODES.includes(error.code)) {
    console.error(`[${scope}] database unavailable:`, error);
    return apiError(503, "Database unavailable. Try again shortly.");
  }
  console.error(`[${scope}] unexpected failure:`, error);
  return apiError(500, "Internal server error.");
}

/** Query strings send "" for omitted inputs; drop those so defaults apply. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (value !== "") result[key] = value;
  }
  return result;
}

/** 200 with the standard success envelope. List responses add `pagination`. */
export function apiOk<T>(data: T, extra?: Record<string, unknown>): Response {
  return Response.json(
    { ok: true, data, ...extra },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

/** 201 plus a `Location` header pointing at the new resource. */
export function apiCreated<T>(data: T, location: string): Response {
  return Response.json({ ok: true, data }, { status: 201, headers: { location } });
}

export function notFoundError(resource: string): Response {
  return apiError(404, `${resource} not found.`);
}

/**
 * Validates a dynamic route segment as a UUID. A malformed id is a 404 rather
 * than a 400: from the client's side the resource simply does not exist, and
 * answering differently would confirm which id shapes are real.
 */
export function parseRouteId(
  id: string,
  resource: string,
): { ok: true; id: string } | { ok: false; response: Response } {
  const parsed = uuidSchema.safeParse(id);
  if (!parsed.success) return { ok: false, response: notFoundError(resource) };
  return { ok: true, id: parsed.data };
}

/** Builds the pagination envelope from a page of rows and the total count. */
export function paginationMeta(
  limit: number,
  offset: number,
  pageLength: number,
  total: number,
): PaginationMeta {
  return { limit, offset, total, hasMore: offset + pageLength < total };
}

/**
 * Maps the write errors every table can raise onto responses, so route
 * handlers only special-case what is specific to them.
 *
 * - P2025: the row (or a row it references) was not found.
 * - P2003: a foreign key points at something that does not exist.
 */
export function writeConflictResponse(
  error: unknown,
  resource: string,
): Response | null {
  if (!isPrismaKnownError(error)) return null;
  if (error.code === "P2025") return notFoundError(resource);
  if (error.code === "P2003") {
    const field = typeof error.meta?.field_name === "string" ? error.meta.field_name : null;
    return apiError(422, "A referenced record does not exist.", {
      ...(field ? { [field]: ["No matching record found."] } : {}),
    });
  }
  return null;
}
