/**
 * Calling the platform's own API from a Server Component.
 *
 * A page could query Prisma directly, but every scoping rule — which
 * organizations you may see, which listings are yours, which crops are shared
 * — already lives in the route handlers and is tested there. Going through
 * HTTP reuses those rules exactly rather than reimplementing them next to the
 * markup, where the two would eventually drift apart.
 *
 * The cost is one extra local round trip per request. If that ever matters,
 * the fix is to extract the queries into functions the routes and the pages
 * both call — not to hand-roll the scoping again in a page.
 */

import { cookies, headers } from "next/headers";

import type { ActionResult, PaginationMeta } from "./types";

export type ApiResult<T> = ActionResult<T> & { pagination?: PaginationMeta };

/**
 * The origin this request arrived on. Taken from the incoming headers rather
 * than an environment variable so it is correct behind a proxy, in preview
 * deployments, and on localhost without any configuration.
 */
async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  const protocol =
    incoming.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");

  return `${protocol}://${host}`;
}

/**
 * GETs an API route as the signed-in caller.
 *
 * The session cookie is forwarded explicitly: server-side `fetch` starts with
 * no credentials, so without this every call would come back 401.
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  const cookieHeader = (await cookies()).toString();

  let response: Response;
  try {
    response = await fetch(new URL(path, await requestOrigin()), {
      headers: { cookie: cookieHeader },
      // These pages render per-user data; a cached copy would be another
      // user's.
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Could not reach the API." };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: `The API returned an unreadable response (${response.status}).`,
    };
  }

  if (typeof payload === "object" && payload !== null && "ok" in payload) {
    return payload as ApiResult<T>;
  }

  return { ok: false, error: `Unexpected API response (${response.status}).` };
}
