/**
 * Demo data for the Hyderabad marketplace.
 *
 * Seeds three farmer organizations around Hyderabad, two buyers, the farms,
 * fields, crops and harvests behind ten listings, and a spread of offers
 * across them. Everything here is invented, but it is shaped the way the app
 * would have produced it: only verified organizations hold published
 * listings, offers sit on active listings from verified sellers, and an
 * accepted offer leaves the listing for its seller to mark sold.
 *
 * Re-runnable. Organizations, users, farms, fields and crops are matched on
 * their natural keys and reused; the harvests, listings and offers belonging
 * to the seeded organizations are cleared and rebuilt, so running it twice
 * leaves the same data rather than a second copy of it. Nothing outside the
 * organizations listed below is read, written, or deleted.
 *
 * Usage:
 *   npm run db:seed
 *   SEED_OWNER_EMAIL=you@example.com npm run db:seed   # also join the orgs
 */

import "dotenv/config";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

/**
 * The password every demo account shares. These accounts exist to be signed
 * into while looking at the app, so the password is deliberately printed at
 * the end of a run rather than hidden.
 */
const DEMO_PASSWORD = "demo-harvest-2026";

/**
 * An existing account to add to every seeded organization, so the seller
 * dashboard has something in it when you sign in as yourself. Left unset,
 * the seeded organizations belong to the demo accounts alone.
 */
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();

// ---------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------

type OrgSeed = {
  slug: string;
  name: string;
  organizationType:
    | "farm"
    | "cooperative"
    | "buyer"
    | "processor";
  description: string;
  /** Only a verified organization may publish to the marketplace. */
  verified: boolean;
  contact: { email: string; fullName: string; phone: string };
};

const FARMERS: OrgSeed[] = [
  {
    slug: "shamirpet-agri-producer-company",
    name: "Shamirpet Agri Producer Company",
    organizationType: "cooperative",
    description:
      "A farmer producer company of 240 smallholders across Shamirpet and Turkapally, aggregating vegetables and paddy for the Hyderabad markets.",
    verified: true,
    contact: {
      email: "ravi.reddy@shamirpet-agri.example.com",
      fullName: "Ravi Kumar Reddy",
      phone: "+91 90000 10001",
    },
  },
  {
    slug: "chevella-organic-growers",
    name: "Chevella Organic Growers",
    organizationType: "farm",
    description:
      "Certified organic vegetables and spices grown on red soil at Chevella and Moinabad, without synthetic pesticide.",
    verified: true,
    contact: {
      email: "lakshmi@chevella-organics.example.com",
      fullName: "Lakshmi Prasad",
      phone: "+91 90000 10002",
    },
  },
  {
    slug: "deccan-harvest-farms",
    name: "Deccan Harvest Farms",
    organizationType: "farm",
    description:
      "Irrigated grain and onion farming at Shadnagar and Kothur, supplying millers and wholesalers across Telangana.",
    verified: true,
    contact: {
      email: "srinivas@deccanharvest.example.com",
      fullName: "Srinivas Rao",
      phone: "+91 90000 10003",
    },
  },
];

const BUYERS: OrgSeed[] = [
  {
    slug: "bowenpally-wholesale-traders",
    name: "Bowenpally Wholesale Traders",
    organizationType: "buyer",
    // Verification gates selling, not buying, so a buyer has no need of it.
    verified: false,
    description:
      "Commission agents at the Bowenpally market, buying vegetables and grain in lots for retail distribution across Hyderabad.",
    contact: {
      email: "anil@bowenpally-traders.example.com",
      fullName: "Anil Agarwal",
      phone: "+91 90000 20001",
    },
  },
  {
    slug: "deccan-foods-processing",
    name: "Deccan Foods Processing",
    organizationType: "processor",
    verified: false,
    description:
      "Sauce, paste and dehydrated vegetable processing at Patancheru, contracting directly with producer companies.",
    contact: {
      email: "meena@deccanfoods.example.com",
      fullName: "Meena Iyer",
      phone: "+91 90000 20002",
    },
  },
];

/** Farms, and the fields within them, per farmer organization. */
const FARMS: Record<
  string,
  { name: string; location: string; areaHectares: string; fields: { name: string; areaHectares: string; soilType: string }[] }[]
> = {
  "shamirpet-agri-producer-company": [
    {
      name: "Shamirpet Block A",
      location: "Shamirpet, Medchal-Malkajgiri",
      areaHectares: "48.500",
      fields: [
        { name: "Block A1", areaHectares: "12.000", soilType: "Red sandy loam" },
        { name: "Block A2", areaHectares: "18.500", soilType: "Red sandy loam" },
      ],
    },
    {
      name: "Turkapally Unit",
      location: "Turkapally, Medchal-Malkajgiri",
      areaHectares: "31.250",
      fields: [
        { name: "Canal Field", areaHectares: "16.000", soilType: "Black cotton" },
      ],
    },
  ],
  "chevella-organic-growers": [
    {
      name: "Chevella Home Farm",
      location: "Chevella, Ranga Reddy",
      areaHectares: "22.000",
      fields: [
        { name: "Drip Plot 1", areaHectares: "6.500", soilType: "Red loam" },
        { name: "Drip Plot 2", areaHectares: "5.250", soilType: "Red loam" },
      ],
    },
    {
      name: "Moinabad Orchard",
      location: "Moinabad, Ranga Reddy",
      areaHectares: "14.750",
      fields: [
        { name: "Spice Block", areaHectares: "4.000", soilType: "Gravelly red" },
      ],
    },
  ],
  "deccan-harvest-farms": [
    {
      name: "Shadnagar Main Farm",
      location: "Shadnagar, Ranga Reddy",
      areaHectares: "76.000",
      fields: [
        { name: "North Bund", areaHectares: "24.000", soilType: "Black cotton" },
        { name: "Borewell Field", areaHectares: "19.500", soilType: "Black cotton" },
      ],
    },
    {
      name: "Kothur Fields",
      location: "Kothur, Ranga Reddy",
      areaHectares: "41.000",
      fields: [
        { name: "Kothur East", areaHectares: "21.000", soilType: "Red sandy loam" },
      ],
    },
  ],
};

/** Crops each organization grows, with the varieties actually planted here. */
const CROPS: Record<
  string,
  { name: string; variety: string; typicalDaysToHarvest: number }[]
> = {
  "shamirpet-agri-producer-company": [
    { name: "Tomato", variety: "Arka Rakshak", typicalDaysToHarvest: 75 },
    { name: "Onion", variety: "Bhima Super", typicalDaysToHarvest: 110 },
    { name: "Paddy", variety: "Telangana Sona (RNR 15048)", typicalDaysToHarvest: 125 },
  ],
  "chevella-organic-growers": [
    { name: "Tomato", variety: "US 440", typicalDaysToHarvest: 80 },
    { name: "Green Chilli", variety: "Teja", typicalDaysToHarvest: 95 },
    { name: "Turmeric", variety: "Nizamabad Bulb", typicalDaysToHarvest: 240 },
  ],
  "deccan-harvest-farms": [
    { name: "Wheat", variety: "HD 2967", typicalDaysToHarvest: 135 },
    { name: "Rice", variety: "Sona Masuri (BPT 5204)", typicalDaysToHarvest: 145 },
    { name: "Onion", variety: "Nasik Red", typicalDaysToHarvest: 115 },
  ],
};

/**
 * The listings themselves, each tied to the harvest it came out of. Prices are
 * per kilogram and in the range these crops actually fetch around Hyderabad;
 * quantities are the lot sizes a buyer would be offered.
 */
type ListingSeed = {
  key: string;
  org: string;
  farm: string;
  field: string;
  crop: string;
  variety: string;
  season: string;
  plantedOn: string;
  expectedHarvestOn: string;
  harvestedOn: string;
  actualYieldKg: string;
  title: string;
  description: string;
  quantityKg: string;
  pricePerKg: string;
  availableFrom: string | null;
  status: "draft" | "active" | "sold" | "archived";
};

const LISTINGS: ListingSeed[] = [
  {
    key: "shamirpet-tomato",
    org: "shamirpet-agri-producer-company",
    farm: "Shamirpet Block A",
    field: "Block A1",
    crop: "Tomato",
    variety: "Arka Rakshak",
    season: "Kharif 2026",
    plantedOn: "2026-06-18",
    expectedHarvestOn: "2026-09-01",
    harvestedOn: "2026-08-29",
    actualYieldKg: "9400.00",
    title: "Arka Rakshak Tomatoes — Grade A, field packed",
    description:
      "Firm, deep red tomatoes picked at breaker stage and packed in 25 kg crates the same morning. Triple disease resistant variety, uniform 80-100 g fruit. Lifting from the Shamirpet collection centre.",
    quantityKg: "2500.00",
    pricePerKg: "24.50",
    availableFrom: "2026-09-08",
    status: "active",
  },
  {
    key: "shamirpet-onion",
    org: "shamirpet-agri-producer-company",
    farm: "Shamirpet Block A",
    field: "Block A2",
    crop: "Onion",
    variety: "Bhima Super",
    season: "Kharif 2026",
    plantedOn: "2026-05-25",
    expectedHarvestOn: "2026-09-12",
    harvestedOn: "2026-08-20",
    actualYieldKg: "21000.00",
    title: "Bhima Super Onions — cured, 45-55 mm",
    description:
      "Kharif onion cured in the field for twelve days and graded to 45-55 mm. Tight necks, single centres, packed in 50 kg mesh bags. Suitable for four to six weeks of storage.",
    quantityKg: "9000.00",
    pricePerKg: "18.00",
    availableFrom: "2026-09-06",
    status: "active",
  },
  {
    key: "shamirpet-paddy",
    org: "shamirpet-agri-producer-company",
    farm: "Turkapally Unit",
    field: "Canal Field",
    crop: "Paddy",
    variety: "Telangana Sona (RNR 15048)",
    season: "Rabi 2025-26",
    plantedOn: "2025-12-08",
    expectedHarvestOn: "2026-04-10",
    harvestedOn: "2026-04-06",
    actualYieldKg: "42000.00",
    title: "Telangana Sona Paddy (RNR 15048) — 14% moisture",
    description:
      "Fine grain low-GI paddy, machine harvested and dried to 14% moisture. Aggregated from 60 member farmers under one lot number. Mill-ready, loading from Turkapally godown.",
    quantityKg: "18000.00",
    pricePerKg: "23.20",
    availableFrom: null,
    status: "active",
  },
  {
    key: "shamirpet-tomato-bulk",
    org: "shamirpet-agri-producer-company",
    farm: "Shamirpet Block A",
    field: "Block A2",
    crop: "Tomato",
    variety: "Arka Rakshak",
    season: "Kharif 2026",
    plantedOn: "2026-07-02",
    expectedHarvestOn: "2026-09-20",
    harvestedOn: "2026-09-02",
    actualYieldKg: "11800.00",
    title: "Arka Rakshak Tomatoes — bulk processing lot",
    description:
      "Second picking, mixed sizes with some sun scald. Priced for paste and sauce processing rather than fresh retail. Loose loaded, buyer arranges the vehicle.",
    quantityKg: "5000.00",
    pricePerKg: "21.00",
    availableFrom: "2026-09-11",
    status: "draft",
  },
  {
    key: "chevella-tomato",
    org: "chevella-organic-growers",
    farm: "Chevella Home Farm",
    field: "Drip Plot 1",
    crop: "Tomato",
    variety: "US 440",
    season: "Kharif 2026",
    plantedOn: "2026-06-10",
    expectedHarvestOn: "2026-08-28",
    harvestedOn: "2026-08-26",
    actualYieldKg: "5200.00",
    title: "Organic US 440 Tomatoes — no synthetic pesticide",
    description:
      "Grown under drip on certified organic land at Chevella, using neem cake and trichoderma alone. Thick walled fruit that travels well. Certificate copy shared with the invoice.",
    quantityKg: "1800.00",
    pricePerKg: "32.00",
    availableFrom: "2026-09-07",
    status: "active",
  },
  {
    key: "chevella-chilli",
    org: "chevella-organic-growers",
    farm: "Chevella Home Farm",
    field: "Drip Plot 2",
    crop: "Green Chilli",
    variety: "Teja",
    season: "Kharif 2026",
    plantedOn: "2026-06-05",
    expectedHarvestOn: "2026-09-08",
    harvestedOn: "2026-09-01",
    actualYieldKg: "3100.00",
    title: "Teja Green Chilli — fresh picked, high pungency",
    description:
      "The Teja line the Guntur trade is built on, sold green rather than dried. Sharp heat, thin skin, picked every third day. Packed in ventilated 10 kg crates.",
    quantityKg: "1200.00",
    pricePerKg: "42.00",
    availableFrom: "2026-09-05",
    status: "active",
  },
  {
    key: "chevella-turmeric",
    org: "chevella-organic-growers",
    farm: "Moinabad Orchard",
    field: "Spice Block",
    crop: "Turmeric",
    variety: "Nizamabad Bulb",
    season: "Rabi 2025-26",
    plantedOn: "2025-06-20",
    expectedHarvestOn: "2026-03-15",
    harvestedOn: "2026-03-11",
    actualYieldKg: "7600.00",
    title: "Turmeric Fingers — boiled, dried and polished",
    description:
      "Nizamabad bulb type, boiled within a day of digging, sun dried to 8% moisture and polished. Curcumin tested at 3.1%. Stored in jute bags on wooden pallets.",
    quantityKg: "3000.00",
    pricePerKg: "138.00",
    availableFrom: null,
    status: "active",
  },
  {
    key: "deccan-wheat",
    org: "deccan-harvest-farms",
    farm: "Shadnagar Main Farm",
    field: "North Bund",
    crop: "Wheat",
    variety: "HD 2967",
    season: "Rabi 2025-26",
    plantedOn: "2025-11-14",
    expectedHarvestOn: "2026-03-28",
    harvestedOn: "2026-03-30",
    actualYieldKg: "26000.00",
    title: "HD 2967 Wheat — cleaned and graded",
    description:
      "Bold amber grain, gravity cleaned to under 1% foreign matter and bagged at 50 kg. Protein tested at 11.8%. Held in a covered godown at Shadnagar since April.",
    quantityKg: "8000.00",
    pricePerKg: "26.40",
    availableFrom: null,
    status: "active",
  },
  {
    key: "deccan-rice",
    org: "deccan-harvest-farms",
    farm: "Shadnagar Main Farm",
    field: "Borewell Field",
    crop: "Rice",
    variety: "Sona Masuri (BPT 5204)",
    season: "Rabi 2025-26",
    plantedOn: "2025-12-02",
    expectedHarvestOn: "2026-04-25",
    harvestedOn: "2026-04-22",
    actualYieldKg: "38000.00",
    title: "Sona Masuri Rice (BPT 5204) — raw milled, new crop",
    description:
      "Lightweight aromatic rice, raw milled at 4% broken and single polished. This season's crop, not blended with old stock. Sold in 25 kg bags, minimum five tonnes.",
    quantityKg: "12000.00",
    pricePerKg: "52.00",
    availableFrom: "2026-09-10",
    status: "active",
  },
  {
    key: "deccan-onion",
    org: "deccan-harvest-farms",
    farm: "Kothur Fields",
    field: "Kothur East",
    crop: "Onion",
    variety: "Nasik Red",
    season: "Rabi 2025-26",
    plantedOn: "2025-11-28",
    expectedHarvestOn: "2026-03-22",
    harvestedOn: "2026-03-20",
    actualYieldKg: "19500.00",
    title: "Nasik Red Onions — medium grade, storage lot",
    description:
      "Dark red skin with tight scales, held in a ventilated storage shed since March with under 6% loss. Medium grade at 40-50 mm. Sold as one lot.",
    quantityKg: "6500.00",
    pricePerKg: "15.75",
    availableFrom: null,
    status: "sold",
  },
];

/**
 * Offers across those listings. A buyer may hold only one pending offer per
 * listing — the partial unique index in db/schema.sql enforces it — so the
 * pending rows below are one per buyer per listing.
 */
const OFFERS: {
  listing: string;
  buyer: string;
  pricePerUnit: string;
  quantity: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
}[] = [
  {
    listing: "shamirpet-tomato",
    buyer: "bowenpally-wholesale-traders",
    pricePerUnit: "23.00",
    quantity: "2000.00",
    status: "pending",
  },
  {
    listing: "shamirpet-tomato",
    buyer: "deccan-foods-processing",
    pricePerUnit: "22.50",
    quantity: "1500.00",
    status: "pending",
  },
  {
    listing: "shamirpet-onion",
    buyer: "deccan-foods-processing",
    pricePerUnit: "17.25",
    quantity: "5000.00",
    status: "pending",
  },
  {
    listing: "shamirpet-paddy",
    buyer: "deccan-foods-processing",
    pricePerUnit: "22.80",
    quantity: "15000.00",
    status: "accepted",
  },
  {
    listing: "chevella-tomato",
    buyer: "bowenpally-wholesale-traders",
    pricePerUnit: "27.00",
    quantity: "1500.00",
    status: "rejected",
  },
  {
    listing: "deccan-rice",
    buyer: "bowenpally-wholesale-traders",
    pricePerUnit: "50.50",
    quantity: "10000.00",
    status: "pending",
  },
  {
    // Accepted, and the seller has since marked the listing sold — which is a
    // separate decision in the app, because an offer may be for part of a lot.
    listing: "deccan-onion",
    buyer: "deccan-foods-processing",
    pricePerUnit: "15.50",
    quantity: "6500.00",
    status: "accepted",
  },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** DATE columns hold a plain day; midnight UTC keeps it from drifting a day. */
function day(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Checks the tables above refer to each other before a single row is written,
 * so a typo in a field or variety name fails immediately rather than halfway
 * through seeding.
 */
function validate() {
  for (const seed of LISTINGS) {
    const farms = FARMS[seed.org];
    const farm = farms?.find((candidate) => candidate.name === seed.farm);
    if (!farm) throw new Error(`${seed.key}: no farm "${seed.farm}" in ${seed.org}`);
    if (!farm.fields.some((field) => field.name === seed.field)) {
      throw new Error(`${seed.key}: no field "${seed.field}" on ${seed.farm}`);
    }
    const crop = CROPS[seed.org]?.find(
      (candidate) => candidate.name === seed.crop && candidate.variety === seed.variety,
    );
    if (!crop) {
      throw new Error(`${seed.key}: ${seed.org} does not grow ${seed.crop} (${seed.variety})`);
    }
  }

  const keys = new Set(LISTINGS.map((seed) => seed.key));
  if (keys.size !== LISTINGS.length) throw new Error("duplicate listing key");

  for (const offer of OFFERS) {
    if (!keys.has(offer.listing)) throw new Error(`offer on unknown listing ${offer.listing}`);
    if (!BUYERS.some((buyer) => buyer.slug === offer.buyer)) {
      throw new Error(`offer from unknown buyer ${offer.buyer}`);
    }
    const listing = LISTINGS.find((seed) => seed.key === offer.listing)!;
    if (offer.status === "pending" && listing.status !== "active") {
      throw new Error(`${offer.listing}: a pending offer on a ${listing.status} listing`);
    }
    if (Number(offer.quantity) > Number(listing.quantityKg)) {
      throw new Error(`${offer.listing}: offer is for more than the lot holds`);
    }
  }

  // The partial unique index allows one pending offer per buyer per listing.
  const pending = OFFERS.filter((offer) => offer.status === "pending").map(
    (offer) => `${offer.listing}/${offer.buyer}`,
  );
  if (new Set(pending).size !== pending.length) {
    throw new Error("two pending offers from one buyer on one listing");
  }
}

async function main() {
  validate();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const allOrgs = [...FARMERS, ...BUYERS];

  // --- organizations and the people in them -------------------------------
  const orgIdBySlug = new Map<string, string>();

  for (const seed of allOrgs) {
    const organization = await prisma.organization.upsert({
      where: { slug: seed.slug },
      update: {
        name: seed.name,
        description: seed.description,
        organizationType: seed.organizationType,
        verifiedAt: seed.verified ? new Date("2026-07-15T09:30:00.000Z") : null,
      },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        organizationType: seed.organizationType,
        verifiedAt: seed.verified ? new Date("2026-07-15T09:30:00.000Z") : null,
      },
    });
    orgIdBySlug.set(seed.slug, organization.id);

    const user = await prisma.user.upsert({
      where: { email: seed.contact.email },
      update: { fullName: seed.contact.fullName, phone: seed.contact.phone },
      create: {
        email: seed.contact.email,
        fullName: seed.contact.fullName,
        phone: seed.contact.phone,
        passwordHash,
      },
    });

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: { role: "owner" },
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
      },
    });
  }

  const organizationIds = [...orgIdBySlug.values()];

  // --- an existing account joins them, if one was named --------------------
  if (OWNER_EMAIL) {
    const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });

    if (!owner) {
      console.warn(
        `! SEED_OWNER_EMAIL=${OWNER_EMAIL} matched no account; skipping that step.`,
      );
    } else {
      for (const organizationId of organizationIds) {
        await prisma.organizationMember.upsert({
          where: {
            organizationId_userId: { organizationId, userId: owner.id },
          },
          update: { role: "owner" },
          create: { organizationId, userId: owner.id, role: "owner" },
        });
      }
      console.log(`✓ ${OWNER_EMAIL} added as owner of all ${organizationIds.length} organizations`);
    }
  }

  // --- clear what a previous run created ----------------------------------
  // Scoped to the seeded organizations, so anything else in the database is
  // left exactly as it was.
  const farmerIds = FARMERS.map((seed) => orgIdBySlug.get(seed.slug)!);

  const removedOffers = await prisma.offer.deleteMany({
    where: { listing: { organizationId: { in: farmerIds } } },
  });
  const removedListings = await prisma.marketplaceListing.deleteMany({
    where: { organizationId: { in: farmerIds } },
  });
  const removedCycles = await prisma.cropCycle.deleteMany({
    where: { field: { farm: { organizationId: { in: farmerIds } } } },
  });

  // --- farms, fields, crops ------------------------------------------------
  const farmIdByKey = new Map<string, string>();
  const fieldIdByKey = new Map<string, string>();
  const cropIdByKey = new Map<string, string>();

  for (const seed of FARMERS) {
    const organizationId = orgIdBySlug.get(seed.slug)!;

    for (const farmSeed of FARMS[seed.slug]) {
      const farm = await prisma.farm.upsert({
        where: {
          organizationId_name: { organizationId, name: farmSeed.name },
        },
        update: {
          location: farmSeed.location,
          areaHectares: farmSeed.areaHectares,
        },
        create: {
          organizationId,
          name: farmSeed.name,
          location: farmSeed.location,
          areaHectares: farmSeed.areaHectares,
        },
      });
      farmIdByKey.set(`${seed.slug}/${farmSeed.name}`, farm.id);

      for (const fieldSeed of farmSeed.fields) {
        const field = await prisma.field.upsert({
          where: { farmId_name: { farmId: farm.id, name: fieldSeed.name } },
          update: {
            areaHectares: fieldSeed.areaHectares,
            soilType: fieldSeed.soilType,
          },
          create: {
            farmId: farm.id,
            name: fieldSeed.name,
            areaHectares: fieldSeed.areaHectares,
            soilType: fieldSeed.soilType,
          },
        });
        fieldIdByKey.set(`${seed.slug}/${fieldSeed.name}`, field.id);
      }
    }

    for (const cropSeed of CROPS[seed.slug]) {
      // Matched by hand rather than upserted: the unique key includes the
      // nullable `organizationId` of platform-wide crops, which is not a key
      // Prisma will accept in a `where`.
      const key = `${seed.slug}/${cropSeed.name}/${cropSeed.variety}`;
      const existing = await prisma.crop.findFirst({
        where: {
          organizationId,
          name: cropSeed.name,
          variety: cropSeed.variety,
        },
      });

      const crop =
        existing ??
        (await prisma.crop.create({
          data: {
            organizationId,
            name: cropSeed.name,
            variety: cropSeed.variety,
            typicalDaysToHarvest: cropSeed.typicalDaysToHarvest,
          },
        }));

      cropIdByKey.set(key, crop.id);
    }
  }

  // --- harvests and the listings that came out of them ---------------------
  const listingIdByKey = new Map<string, string>();

  for (const seed of LISTINGS) {
    const cycle = await prisma.cropCycle.create({
      data: {
        fieldId: fieldIdByKey.get(`${seed.org}/${seed.field}`)!,
        cropId: cropIdByKey.get(`${seed.org}/${seed.crop}/${seed.variety}`)!,
        season: seed.season,
        plantedOn: day(seed.plantedOn),
        expectedHarvestOn: day(seed.expectedHarvestOn),
        harvestedOn: day(seed.harvestedOn),
        status: "harvested",
        actualYieldKg: seed.actualYieldKg,
      },
    });

    const listing = await prisma.marketplaceListing.create({
      data: {
        organizationId: orgIdBySlug.get(seed.org)!,
        cropCycleId: cycle.id,
        title: seed.title,
        description: seed.description,
        quantityKg: seed.quantityKg,
        pricePerKg: seed.pricePerKg,
        availableFrom: seed.availableFrom ? day(seed.availableFrom) : null,
        status: seed.status,
      },
    });

    listingIdByKey.set(seed.key, listing.id);
  }

  // --- offers --------------------------------------------------------------
  for (const seed of OFFERS) {
    const buyerOrganizationId = orgIdBySlug.get(seed.buyer)!;

    // The offer records which member placed it. That is the buying
    // organization's own contact, not whoever ran the seed.
    const contactEmail = BUYERS.find((b) => b.slug === seed.buyer)!.contact.email;
    const buyer = await prisma.user.findUnique({
      where: { email: contactEmail },
      select: { id: true },
    });

    await prisma.offer.create({
      data: {
        listingId: listingIdByKey.get(seed.listing)!,
        buyerOrganizationId,
        buyerId: buyer?.id ?? null,
        pricePerUnit: seed.pricePerUnit,
        quantity: seed.quantity,
        status: seed.status,
      },
    });
  }

  // --- what happened -------------------------------------------------------
  const active = LISTINGS.filter((l) => l.status === "active").length;
  console.log(
    [
      "",
      `✓ ${FARMERS.length} farmer organizations (verified) and ${BUYERS.length} buyers`,
      `✓ ${Object.values(FARMS).flat().length} farms, ${Object.values(FARMS).flat().flatMap((f) => f.fields).length} fields, ${Object.values(CROPS).flat().length} crops`,
      `✓ ${LISTINGS.length} listings — ${active} active, ${LISTINGS.length - active} draft/sold`,
      `✓ ${OFFERS.length} offers — ${OFFERS.filter((o) => o.status === "pending").length} pending, ${OFFERS.filter((o) => o.status === "accepted").length} accepted, ${OFFERS.filter((o) => o.status === "rejected").length} rejected`,
      `  (replaced ${removedListings.count} listings, ${removedCycles.count} harvests and ${removedOffers.count} offers from an earlier run)`,
      "",
      "Demo sign-ins — every account uses the same password:",
      ...allOrgs.map((o) => `  ${o.contact.email.padEnd(44)} ${o.name}`),
      `  password: ${DEMO_PASSWORD}`,
      "",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
