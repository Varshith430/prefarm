/**
 * Domain types for the AgriTech platform.
 *
 * Row types and enums come from the generated Prisma client so they can never
 * drift from prisma/schema.prisma. This module adds the things Prisma does not
 * generate: relation-loaded shapes, wire-safe (serialized) shapes for passing
 * data from Server to Client Components, and small transport helpers.
 *
 * The generated client is gitignored, so run `prisma generate` (wired to
 * `npm run postinstall`) before typechecking a fresh clone.
 */

// Prisma 7 exports row types as `<Model>Model`; they are aliased back to the
// bare model name so application code reads naturally.
import type {
  CropCycleModel as CropCycle,
  CropModel as Crop,
  FarmModel as Farm,
  FieldModel as Field,
  InventoryItemModel as InventoryItem,
  InventoryMovementModel as InventoryMovement,
  MarketplaceListingModel as MarketplaceListing,
  OfferModel as Offer,
  OrganizationMemberModel as OrganizationMember,
  OrganizationModel as Organization,
  SensorModel as Sensor,
  SensorReadingModel as SensorReading,
  TaskModel as Task,
  UserModel as User,
} from "@/app/generated/prisma/models";

// Enums are re-exported as both values and types, so callers can write
// `FarmStatus.active` as well as `status: FarmStatus`.
export {
  CropCycleStatus,
  FarmStatus,
  FieldStatus,
  ListingStatus,
  MembershipRole,
  OfferStatus,
  MovementType,
  SensorType,
  TaskPriority,
  TaskStatus,
} from "@/app/generated/prisma/enums";

export type {
  Crop,
  CropCycle,
  Farm,
  Field,
  InventoryItem,
  InventoryMovement,
  MarketplaceListing,
  Offer,
  Organization,
  OrganizationMember,
  Sensor,
  SensorReading,
  Task,
  User,
};

// ---------------------------------------------------------------------------
// Relation-loaded shapes
//
// These describe what a query returns for a given `include`, so a component
// can state the data it needs instead of accepting a bare row.
// ---------------------------------------------------------------------------

export type OrganizationMemberWithUser = OrganizationMember & { user: User };

export type OrganizationWithMembers = Organization & {
  members: OrganizationMemberWithUser[];
};

export type FarmWithFields = Farm & { fields: Field[] };

export type FieldWithContext = Field & {
  farm: Farm;
  cropCycles: CropCycle[];
  sensors: Sensor[];
};

export type CropCycleWithCrop = CropCycle & { crop: Crop };

export type CropCycleWithContext = CropCycleWithCrop & {
  field: Field & { farm: Farm };
};

export type SensorWithField = Sensor & { field: Field };

/** A sensor plus its most recent reading; `readings` holds 0 or 1 rows. */
export type SensorWithLatestReading = Sensor & { readings: SensorReading[] };

export type TaskWithRelations = Task & {
  assignee: User | null;
  farm: Farm | null;
  field: Field | null;
  cropCycle: CropCycleWithCrop | null;
};

export type InventoryItemWithMovements = InventoryItem & {
  movements: InventoryMovement[];
};

export type InventoryMovementWithRecorder = InventoryMovement & {
  recorder: User | null;
};

export type MarketplaceListingWithCycle = MarketplaceListing & {
  cropCycle: CropCycleWithCrop | null;
};

/** A bid as the seller sees it: who is bidding, and on which listing. */
export type OfferWithParties = Offer & {
  listing: MarketplaceListing;
  buyerOrganization: Organization;
  buyer: User | null;
};

// ---------------------------------------------------------------------------
// Wire-safe shapes
//
// Prisma returns Date, Decimal, and BigInt values. None of them survive the
// Server -> Client Component boundary (or JSON), so anything crossing it is
// serialized to strings first. Decimal is derived from a generated field
// rather than imported, so it tracks whatever the client runtime uses.
// ---------------------------------------------------------------------------

type DecimalValue = Farm["areaHectares"];

export type Serialized<T> = T extends Date
  ? string
  : T extends DecimalValue
    ? string
    : T extends bigint
      ? string
      : T extends readonly (infer U)[]
        ? Serialized<U>[]
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;

export type OrganizationDTO = Serialized<Organization>;
export type UserDTO = Serialized<User>;
export type OrganizationMemberDTO = Serialized<OrganizationMember>;
export type FarmDTO = Serialized<Farm>;
export type FieldDTO = Serialized<Field>;
export type CropDTO = Serialized<Crop>;
export type CropCycleDTO = Serialized<CropCycle>;
export type SensorDTO = Serialized<Sensor>;
export type SensorReadingDTO = Serialized<SensorReading>;
export type TaskDTO = Serialized<Task>;
export type InventoryItemDTO = Serialized<InventoryItem>;
export type InventoryMovementDTO = Serialized<InventoryMovement>;
export type MarketplaceListingDTO = Serialized<MarketplaceListing>;
export type OfferDTO = Serialized<Offer>;

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  limit: number;
  offset: number;
  /** Total rows matching the filters, ignoring limit/offset. */
  total: number;
  hasMore: boolean;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}

/**
 * Result of a Server Action or route handler. `fieldErrors` matches the shape
 * of `z.treeifyError`-style flattening, so a form can map errors back to inputs.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
