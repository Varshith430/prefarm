/**
 * Tenancy lookups for resources that do not carry an `organization_id` of
 * their own.
 *
 * A field belongs to a farm, a crop cycle to a field, a sensor to a field —
 * so authorizing a request about one means walking back up to the owning
 * organization first. Each lookup selects only the id it needs, so the check
 * costs one narrow query rather than loading the row twice.
 */

import { MembershipRole } from "@/app/generated/prisma/enums";
import { apiError, notFoundError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

import { authorizeOrg, READ } from "./guards";
import type { ResolvedSession } from "./session";

/** `organizationId` is null for a platform-wide crop shared across tenants. */
type Owner = { found: false } | { found: true; organizationId: string | null };

const NOT_FOUND: Owner = { found: false };

export const RESOURCE_LABELS = {
  farm: "Farm",
  field: "Field",
  cropCycle: "Crop cycle",
  crop: "Crop",
  sensor: "Sensor",
  task: "Task",
  inventoryItem: "Inventory item",
  listing: "Listing",
} as const;

export type ResourceKind = keyof typeof RESOURCE_LABELS;

const LOOKUPS: Record<ResourceKind, (id: string) => Promise<Owner>> = {
  async farm(id) {
    const row = await prisma.farm.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return row ? { found: true, organizationId: row.organizationId } : NOT_FOUND;
  },

  async field(id) {
    const row = await prisma.field.findUnique({
      where: { id },
      select: { farm: { select: { organizationId: true } } },
    });
    return row ? { found: true, organizationId: row.farm.organizationId } : NOT_FOUND;
  },

  async cropCycle(id) {
    const row = await prisma.cropCycle.findUnique({
      where: { id },
      select: { field: { select: { farm: { select: { organizationId: true } } } } },
    });
    return row
      ? { found: true, organizationId: row.field.farm.organizationId }
      : NOT_FOUND;
  },

  async crop(id) {
    const row = await prisma.crop.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return row ? { found: true, organizationId: row.organizationId } : NOT_FOUND;
  },

  async sensor(id) {
    const row = await prisma.sensor.findUnique({
      where: { id },
      select: { field: { select: { farm: { select: { organizationId: true } } } } },
    });
    return row
      ? { found: true, organizationId: row.field.farm.organizationId }
      : NOT_FOUND;
  },

  async task(id) {
    const row = await prisma.task.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return row ? { found: true, organizationId: row.organizationId } : NOT_FOUND;
  },

  async inventoryItem(id) {
    const row = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return row ? { found: true, organizationId: row.organizationId } : NOT_FOUND;
  },

  async listing(id) {
    const row = await prisma.marketplaceListing.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return row ? { found: true, organizationId: row.organizationId } : NOT_FOUND;
  },
};

/**
 * The two organizations an offer sits between.
 *
 * Offers are the one resource with two owners — the buyer who made the bid and
 * the seller who owns the listing — so `requireResourceRole`, which resolves a
 * single owning organization, cannot express who may do what here. Callers
 * take this and decide per action: reading is open to either side, answering
 * belongs to the seller alone.
 */
export interface OfferParties {
  status: string;
  listingId: string;
  buyerOrganizationId: string;
  sellerOrganizationId: string;
}

export async function findOfferParties(id: string): Promise<OfferParties | null> {
  const offer = await prisma.offer.findUnique({
    where: { id },
    select: {
      status: true,
      listingId: true,
      buyerOrganizationId: true,
      listing: { select: { organizationId: true } },
    },
  });

  if (!offer) return null;

  return {
    status: offer.status,
    listingId: offer.listingId,
    buyerOrganizationId: offer.buyerOrganizationId,
    sellerOrganizationId: offer.listing.organizationId,
  };
}

export type ResourceAccess =
  | { ok: true; organizationId: string | null }
  | { ok: false; response: Response };

/**
 * Resolves a resource's owning organization and checks the caller's role in
 * it. A resource that does not exist is a 404; one in another tenant is a 403.
 *
 * Shared crops (`organization_id IS NULL`) belong to no tenant: any signed-in
 * caller may read them, and nobody may change them through this API, since
 * there is no platform-administrator role to hold that privilege yet.
 */
export async function requireResourceRole(
  session: ResolvedSession,
  kind: ResourceKind,
  id: string,
  minimumRole: MembershipRole = READ,
): Promise<ResourceAccess> {
  const owner = await LOOKUPS[kind](id);

  if (!owner.found) {
    return { ok: false, response: notFoundError(RESOURCE_LABELS[kind]) };
  }

  if (owner.organizationId === null) {
    if (minimumRole === READ) return { ok: true, organizationId: null };
    return {
      ok: false,
      response: apiError(
        403,
        `This ${RESOURCE_LABELS[kind].toLowerCase()} is shared across the platform and cannot be changed here.`,
      ),
    };
  }

  const allowed = authorizeOrg(session, owner.organizationId, minimumRole);
  if (!allowed.ok) return allowed;

  return { ok: true, organizationId: owner.organizationId };
}
