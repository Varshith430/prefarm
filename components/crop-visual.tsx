/**
 * The picture on a product card.
 *
 * Nothing in the schema stores an image for a crop, and a marketplace of
 * grey rectangles is hard to scan, so each listing gets a stable illustrated
 * tile instead: an emoji chosen from the crop or listing name, on a tint
 * derived from that same name. Two listings of the same produce therefore
 * always look alike, and one listing looks the same on every page.
 */

/**
 * Keywords are checked in order, so more specific produce is listed before the
 * general terms that would otherwise swallow it ("sweet potato" before
 * "potato", "green pepper" before "pepper").
 */
const PRODUCE: [pattern: string, emoji: string][] = [
  ["sweet potato", "🍠"],
  ["potato", "🥔"],
  ["tomato", "🍅"],
  ["onion", "🧅"],
  ["garlic", "🧄"],
  ["ginger", "🫚"],
  ["carrot", "🥕"],
  ["chilli", "🌶️"],
  ["chili", "🌶️"],
  ["capsicum", "🫑"],
  ["pepper", "🫑"],
  ["brinjal", "🍆"],
  ["aubergine", "🍆"],
  ["eggplant", "🍆"],
  ["cucumber", "🥒"],
  ["gourd", "🥒"],
  ["pumpkin", "🎃"],
  ["broccoli", "🥦"],
  ["cauliflower", "🥦"],
  ["cabbage", "🥬"],
  ["spinach", "🥬"],
  ["lettuce", "🥬"],
  ["kale", "🥬"],
  ["mushroom", "🍄"],
  ["avocado", "🥑"],
  ["olive", "🫒"],
  ["corn", "🌽"],
  ["maize", "🌽"],
  ["wheat", "🌾"],
  ["barley", "🌾"],
  ["oat", "🌾"],
  ["millet", "🌾"],
  ["sorghum", "🌾"],
  ["rice", "🍚"],
  ["paddy", "🌾"],
  ["soy", "🫘"],
  ["bean", "🫘"],
  ["lentil", "🫘"],
  ["gram", "🫘"],
  ["dal", "🫘"],
  ["pea", "🫛"],
  ["peanut", "🥜"],
  ["groundnut", "🥜"],
  ["cashew", "🥜"],
  ["almond", "🌰"],
  ["chestnut", "🌰"],
  ["coconut", "🥥"],
  ["banana", "🍌"],
  ["mango", "🥭"],
  ["apple", "🍎"],
  ["pear", "🍐"],
  ["grape", "🍇"],
  ["orange", "🍊"],
  ["tangerine", "🍊"],
  ["lemon", "🍋"],
  ["lime", "🍋"],
  ["pineapple", "🍍"],
  ["watermelon", "🍉"],
  ["melon", "🍈"],
  ["papaya", "🍈"],
  ["guava", "🍈"],
  ["strawberry", "🍓"],
  ["blueberry", "🫐"],
  ["berry", "🫐"],
  ["cherry", "🍒"],
  ["peach", "🍑"],
  ["kiwi", "🥝"],
  ["sugarcane", "🎋"],
  ["cane", "🎋"],
  ["bamboo", "🎋"],
  ["cotton", "🌼"],
  ["sunflower", "🌻"],
  ["flower", "🌸"],
  ["rose", "🌹"],
  ["tea", "🍵"],
  ["coffee", "☕"],
  ["cocoa", "🍫"],
  ["honey", "🍯"],
  ["milk", "🥛"],
  ["egg", "🥚"],
  ["herb", "🌿"],
  ["mint", "🌿"],
  ["basil", "🌿"],
  ["coriander", "🌿"],
  ["seed", "🌱"],
  ["sapling", "🌱"],
];

/** Backgrounds an emoji is placed on, picked by name so it never changes. */
const TINTS = [
  "from-emerald-100 to-emerald-50 dark:from-emerald-950 dark:to-emerald-900",
  "from-amber-100 to-amber-50 dark:from-amber-950 dark:to-amber-900",
  "from-rose-100 to-rose-50 dark:from-rose-950 dark:to-rose-900",
  "from-sky-100 to-sky-50 dark:from-sky-950 dark:to-sky-900",
  "from-lime-100 to-lime-50 dark:from-lime-950 dark:to-lime-900",
  "from-violet-100 to-violet-50 dark:from-violet-950 dark:to-violet-900",
];

/** Same name in, same tint out — a plain sum is enough to spread them. */
function tintFor(name: string): string {
  let total = 0;
  for (let index = 0; index < name.length; index += 1) {
    total += name.charCodeAt(index);
  }
  return TINTS[total % TINTS.length];
}

export function cropEmoji(...names: (string | null | undefined)[]): string {
  const haystack = names.filter(Boolean).join(" ").toLowerCase();
  const match = PRODUCE.find(([pattern]) => haystack.includes(pattern));
  // Produce nobody thought of still gets a plant rather than a blank tile.
  return match ? match[1] : "🌾";
}

const SIZES = {
  sm: "h-12 w-12 shrink-0 rounded-md text-2xl",
  md: "h-40 w-full rounded-md text-6xl",
  lg: "h-64 w-full rounded-lg text-8xl",
} as const;

/**
 * The tile itself. `name` decides the emoji and the tint; `label` is what a
 * screen reader hears, since the picture is decoration standing in for a
 * photograph rather than information of its own.
 */
export function CropVisual({
  name,
  cropName,
  size = "md",
}: {
  name: string;
  cropName?: string | null;
  size?: keyof typeof SIZES;
}) {
  const emoji = cropEmoji(cropName, name);

  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-linear-to-br ${tintFor(
        cropName ?? name,
      )} ${SIZES[size]}`}
    >
      <span className="select-none leading-none">{emoji}</span>
    </div>
  );
}
