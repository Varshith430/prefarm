/**
 * What an organization's type says it is here to do.
 *
 * The marketplace has two sides, and `organizations.organization_type` is what
 * decides which side a tenant is on. Growers list produce; buyers make offers
 * on it. Stating that once, here, keeps the dashboard, the navigation, and the
 * route handlers from each inventing their own idea of who may sell.
 *
 * The remaining types — `input_supplier`, `logistics`, `service_provider` —
 * are on neither side: they trade in inputs and services rather than produce,
 * so they get the buyer's view of the app (browse, and make offers) and are
 * refused the seller's actions, which is the conservative reading. Moving one
 * of them across is a matter of adding it to the list below.
 */

import { OrganizationType } from "@/app/generated/prisma/enums";

/** Types that grow or aggregate produce, and may therefore list it for sale. */
const SELLS: ReadonlySet<string> = new Set<string>([
  OrganizationType.farm,
  OrganizationType.cooperative,
  OrganizationType.distributor,
]);

/** Types that exist to buy produce, and get the buying side of the app. */
const BUYS: ReadonlySet<string> = new Set<string>([
  OrganizationType.buyer,
  OrganizationType.processor,
  OrganizationType.retailer,
]);

/**
 * Whether this organization may keep crops and publish listings.
 *
 * This is the authority for the question. Anything that is not a selling type
 * is treated as unable to sell, so a type added to the enum later is refused
 * until somebody decides it belongs above — the safe direction to be wrong in.
 */
export function sellsProduce(organizationType: string): boolean {
  return SELLS.has(organizationType);
}

/** Whether this organization is one of the buying types. */
export function buysProduce(organizationType: string): boolean {
  return BUYS.has(organizationType);
}

/** The organization type as a label, e.g. `input_supplier` -> "input supplier". */
export function organizationTypeLabel(organizationType: string): string {
  return organizationType.replace(/_/g, " ");
}
