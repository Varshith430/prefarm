/**
 * Client-side form submission against the JSON API.
 *
 * Every route handler answers with the `ActionResult` envelope, so the only
 * thing a form needs is a typed way to post and get that envelope back —
 * including for the failures `fetch` reports as thrown errors or as a body
 * that is not JSON at all, which would otherwise surface as an unhandled
 * rejection rather than a message in the form.
 */

import type { ActionResult } from "./types";

/** Field errors keyed by input name, as `validationError()` produces them. */
export type FieldErrors = Record<string, string[]>;

export async function submitJson<T>(
  path: string,
  body?: unknown,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
): Promise<ActionResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return {
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
    };
  }

  // 204 carries no body; sign-out is the endpoint that answers this way.
  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: `The server returned an unreadable response (${response.status}).`,
    };
  }

  if (typeof payload === "object" && payload !== null && "ok" in payload) {
    return payload as ActionResult<T>;
  }

  return {
    ok: false,
    error: `Unexpected response from the server (${response.status}).`,
  };
}

/**
 * Narrows a failed result to its field errors.
 *
 * Zod flattens nested paths onto their top-level key, so a problem inside the
 * `organization` object arrives under `organization` rather than
 * `organization.name`. Forms pass both keys to the field that shows it.
 */
export function fieldErrorsOf(result: ActionResult<unknown> | null): FieldErrors {
  if (!result || result.ok) return {};
  return result.fieldErrors ?? {};
}
