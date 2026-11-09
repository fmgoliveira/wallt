import type { RuleCondition } from "@wallt/core";

/**
 * Cold-start rules for common Portuguese merchants (PLAN §6 step 4). They are offered, not forced: the user adds
 * them from the rules screen and can edit or delete each one. A merchant matches on any of its `keywords`
 * (accent- and case-insensitive substring of the description or payee) and only for outflows.
 */
export interface DefaultRuleSpec {
  /** Rule name; also the idempotency key (a rule with this name is never added twice). */
  name: string;
  /** Stable key of a seeded default category (`categories.system_key`): `groceries`, or `parent.child` such as `transport.fuel`. */
  categoryKey: string;
  keywords: readonly string[];
}

export const DEFAULT_RULE_SPECS: readonly DefaultRuleSpec[] = [
  { name: "Continente", categoryKey: "groceries", keywords: ["continente"] },
  { name: "Pingo Doce", categoryKey: "groceries", keywords: ["pingo doce"] },
  { name: "Lidl", categoryKey: "groceries", keywords: ["lidl"] },
  { name: "Auchan", categoryKey: "groceries", keywords: ["auchan"] },
  { name: "Minipreço", categoryKey: "groceries", keywords: ["minipreco"] },
  { name: "Intermarché", categoryKey: "groceries", keywords: ["intermarche"] },
  { name: "Mercadona", categoryKey: "groceries", keywords: ["mercadona"] },
  { name: "Aldi", categoryKey: "groceries", keywords: ["aldi"] },
  { name: "Galp", categoryKey: "transport.fuel", keywords: ["galp"] },
  { name: "Repsol", categoryKey: "transport.fuel", keywords: ["repsol"] },
  { name: "BP", categoryKey: "transport.fuel", keywords: ["bp"] },
  { name: "Prio", categoryKey: "transport.fuel", keywords: ["prio"] },
  { name: "Via Verde", categoryKey: "transport.tolls", keywords: ["via verde", "viaverde"] },
  { name: "EDP", categoryKey: "housing.electricity", keywords: ["edp"] },
  { name: "Endesa", categoryKey: "housing.electricity", keywords: ["endesa"] },
  { name: "Iberdrola", categoryKey: "housing.electricity", keywords: ["iberdrola"] },
  { name: "EPAL", categoryKey: "housing.water", keywords: ["epal"] },
  { name: "MEO", categoryKey: "housing.internet-tv", keywords: ["meo"] },
  { name: "NOS", categoryKey: "housing.internet-tv", keywords: ["nos comunicacoes", "nos sgps"] },
  { name: "Vodafone", categoryKey: "housing.internet-tv", keywords: ["vodafone"] },
  { name: "Uber", categoryKey: "transport.ride-hailing", keywords: ["uber"] },
  { name: "Bolt", categoryKey: "transport.ride-hailing", keywords: ["bolt"] },
  { name: "Glovo", categoryKey: "dining.delivery", keywords: ["glovo"] },
  { name: "Uber Eats", categoryKey: "dining.delivery", keywords: ["uber eats", "ubereats"] },
  { name: "Netflix", categoryKey: "leisure.subscriptions", keywords: ["netflix"] },
  { name: "Spotify", categoryKey: "leisure.subscriptions", keywords: ["spotify"] },
  {
    name: "Amazon Prime",
    categoryKey: "leisure.subscriptions",
    keywords: ["amazon prime", "prime video"],
  },
  {
    name: "Disney+",
    categoryKey: "leisure.subscriptions",
    keywords: ["disney plus", "disneyplus"],
  },
  { name: "Farmácia", categoryKey: "health.pharmacy", keywords: ["farmacia"] },
  {
    name: "CP / Metro",
    categoryKey: "transport.public-transport",
    keywords: ["comboios de portugal", "metro de lisboa", "metro do porto", "carris"],
  },
  { name: "EMEL", categoryKey: "transport.parking", keywords: ["emel"] },
  { name: "IKEA", categoryKey: "shopping.home-goods", keywords: ["ikea"] },
  { name: "Worten", categoryKey: "shopping.electronics", keywords: ["worten"] },
  { name: "Fnac", categoryKey: "shopping.electronics", keywords: ["fnac"] },
  { name: "Zara", categoryKey: "shopping.clothing", keywords: ["zara"] },
  { name: "Decathlon", categoryKey: "shopping", keywords: ["decathlon"] },
  {
    name: "Ryanair / TAP",
    categoryKey: "leisure.travel",
    keywords: ["ryanair", "tap air", "easyjet"],
  },
  { name: "Booking", categoryKey: "leisure.travel", keywords: ["booking.com", "airbnb"] },
];

/**
 * The conditions of a default rule: any keyword as a whole word (one regex, tested on the text and on its
 * accent-free form) in the description, outflows only. Whole words keep "bp" or "edp" out of unrelated text.
 */
export function defaultRuleConditions(spec: DefaultRuleSpec): RuleCondition[] {
  const pattern = spec.keywords
    .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return [
    { field: "description", op: "regex", value: `\\b(?:${pattern})\\b` },
    { field: "sign", op: "equals", value: "expense" },
  ];
}
