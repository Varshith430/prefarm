/**
 * Per-device credentials for telemetry ingest.
 *
 * A field gateway cannot hold a browser cookie, and handing it a person's
 * login would give it that person's entire access — every farm, every listing,
 * every stock movement. So a sensor carries its own bearer token, and that
 * token authorizes exactly one thing: writing readings for that one sensor.
 *
 * As with sessions, only the SHA-256 of the token is stored. The token is
 * therefore shown once, when it is issued, and a device that loses it is given
 * a new one by rotation rather than by looking the old one up.
 */

import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

/** The token is high-entropy random, so a fast digest is the right primitive. */
export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedDeviceToken {
  /** Returned once, at issue; never recoverable afterwards. */
  token: string;
  hash: string;
  issuedAt: Date;
}

export function issueDeviceToken(): IssuedDeviceToken {
  const token = randomUUID();
  return { token, hash: hashDeviceToken(token), issuedAt: new Date() };
}

/** Reads `Authorization: Bearer <token>`, or null when absent or malformed. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

export interface DeviceIdentity {
  sensorId: string;
  isActive: boolean;
}

/**
 * Resolves a bearer token to the single sensor it belongs to.
 *
 * Deliberately returns nothing about the organization: this credential does
 * not stand in for a member of the tenant, and a caller holding it can act on
 * one sensor and nothing else.
 */
export async function resolveDeviceToken(
  token: string,
): Promise<DeviceIdentity | null> {
  const sensor = await prisma.sensor.findUnique({
    where: { deviceTokenHash: hashDeviceToken(token) },
    select: { id: true, isActive: true },
  });

  return sensor ? { sensorId: sensor.id, isActive: sensor.isActive } : null;
}
