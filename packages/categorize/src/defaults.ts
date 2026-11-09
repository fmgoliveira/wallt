import type { RuleCondition } from "@wallt/core";

/**
 * Cold-start rules for common Portuguese merchants (PLAN §6 step 4). They are offered, not forced: the user adds
 * them from the rules screen and can edit or delete each one. A merchant matches on any of its `keywords`
 * (accent- and case-insensitive substring of the description or payee) and only for outflows.
 */
export interface DefaultRuleSpec {
  /** Rule name; also the idempotency key (a rule with this name is never added twice). */
  name: string;
  /** Stable key of a seeded default category (`categories.system_key`). */
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
  { name: "Galp", categoryKey: "fuel", keywords: ["galp"] },
  { name: "Repsol", categoryKey: "fuel", keywords: ["repsol"] },
  { name: "BP", categoryKey: "fuel", keywords: ["bp"] },
  { name: "Prio", categoryKey: "fuel", keywords: ["prio"] },
  { name: "Via Verde", categoryKey: "tolls", keywords: ["via verde", "viaverde"] },
  { name: "EDP", categoryKey: "electricity", keywords: ["edp"] },
  { name: "Endesa", categoryKey: "electricity", keywords: ["endesa"] },
  { name: "Iberdrola", categoryKey: "electricity", keywords: ["iberdrola"] },
  { name: "EPAL", categoryKey: "water", keywords: ["epal"] },
  { name: "MEO", categoryKey: "internet-tv", keywords: ["meo"] },
  { name: "NOS", categoryKey: "internet-tv", keywords: ["nos comunicacoes", "nos sgps"] },
  { name: "Vodafone", categoryKey: "internet-tv", keywords: ["vodafone"] },
  { name: "Uber", categoryKey: "ride-hailing", keywords: ["uber"] },
  { name: "Bolt", categoryKey: "ride-hailing", keywords: ["bolt"] },
  { name: "Glovo", categoryKey: "delivery", keywords: ["glovo"] },
  { name: "Uber Eats", categoryKey: "delivery", keywords: ["uber eats", "ubereats"] },
  { name: "Netflix", categoryKey: "subscriptions", keywords: ["netflix"] },
  { name: "Spotify", categoryKey: "subscriptions", keywords: ["spotify"] },
  { name: "Amazon Prime", categoryKey: "subscriptions", keywords: ["amazon prime", "prime video"] },
  { name: "Disney+", categoryKey: "subscriptions", keywords: ["disney plus", "disneyplus"] },
  { name: "Farmácia", categoryKey: "pharmacy", keywords: ["farmacia"] },
  {
    name: "CP / Metro",
    categoryKey: "public-transport",
    keywords: ["comboios de portugal", "metro de lisboa", "metro do porto", "carris"],
  },
  { name: "EMEL", categoryKey: "parking", keywords: ["emel"] },
  { name: "IKEA", categoryKey: "home-goods", keywords: ["ikea"] },
  { name: "Worten", categoryKey: "electronics", keywords: ["worten"] },
  { name: "Fnac", categoryKey: "electronics", keywords: ["fnac"] },
  { name: "Zara", categoryKey: "clothing", keywords: ["zara"] },
  { name: "Decathlon", categoryKey: "shopping", keywords: ["decathlon"] },
  { name: "Ryanair / TAP", categoryKey: "travel", keywords: ["ryanair", "tap air", "easyjet"] },
  { name: "Booking", categoryKey: "travel", keywords: ["booking.com", "airbnb"] },
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
