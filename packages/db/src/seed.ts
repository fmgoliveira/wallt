import type { SqlExecutor } from "./migrate";

type SeedCategory = {
  key: string;
  name: string;
  icon: string;
  children?: [key: string, name: string][];
};

/** Default categories (pt-PT names, two levels). Keys are stable and never change once released. */
export const DEFAULT_EXPENSE_CATEGORIES: readonly SeedCategory[] = [
  {
    key: "housing",
    name: "Habitação",
    icon: "home",
    children: [
      ["rent", "Renda / Prestação"],
      ["electricity", "Eletricidade"],
      ["water", "Água"],
      ["gas", "Gás"],
      ["internet-tv", "Internet e TV"],
      ["condo", "Condomínio"],
    ],
  },
  { key: "groceries", name: "Supermercado", icon: "shopping-cart" },
  {
    key: "dining",
    name: "Restauração",
    icon: "utensils",
    children: [
      ["restaurants", "Restaurantes"],
      ["coffee", "Café e pastelaria"],
      ["delivery", "Takeaway e entregas"],
    ],
  },
  {
    key: "transport",
    name: "Transportes",
    icon: "car",
    children: [
      ["fuel", "Combustível"],
      ["tolls", "Portagens"],
      ["public-transport", "Transportes públicos"],
      ["ride-hailing", "Táxi e TVDE"],
      ["parking", "Estacionamento"],
    ],
  },
  {
    key: "health",
    name: "Saúde",
    icon: "heart-pulse",
    children: [
      ["pharmacy", "Farmácia"],
      ["doctor", "Consultas e exames"],
    ],
  },
  {
    key: "leisure",
    name: "Lazer",
    icon: "ticket",
    children: [
      ["travel", "Viagens"],
      ["subscriptions", "Subscrições"],
      ["culture", "Cultura e eventos"],
    ],
  },
  {
    key: "shopping",
    name: "Compras",
    icon: "shopping-bag",
    children: [
      ["clothing", "Roupa e calçado"],
      ["electronics", "Eletrónica"],
      ["home-goods", "Casa e decoração"],
    ],
  },
  { key: "education", name: "Educação", icon: "graduation-cap" },
  { key: "insurance", name: "Seguros", icon: "shield" },
  { key: "taxes-fees", name: "Impostos e taxas", icon: "landmark" },
  { key: "gifts", name: "Presentes e donativos", icon: "gift" },
  { key: "other-expense", name: "Outras despesas", icon: "ellipsis" },
];

export const DEFAULT_INCOME_CATEGORIES: readonly SeedCategory[] = [
  { key: "salary", name: "Salário", icon: "briefcase" },
  { key: "refunds", name: "Reembolsos", icon: "rotate-ccw" },
  { key: "investment-income", name: "Rendimentos", icon: "trending-up" },
  { key: "other-income", name: "Outros rendimentos", icon: "plus-circle" },
];

export type SeedContext = {
  userId: string;
  /** UUIDv7 generator. */
  newId: () => string;
  /** Current UTC ISO timestamp. */
  now: string;
  /** HLC stamp for the inserted rows. */
  hlc: string;
};

const INSERT = `INSERT INTO categories
  (id, user_id, created_at, updated_at, hlc, deleted_at, server_seq, name, parent_id, type, icon, color, archived, sort_order, system_key)
  SELECT ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, NULL, 0, ?, ?
  WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id = ? AND system_key = ?)`;

/**
 * Inserts the default categories for a user. Idempotent: a category is created only if the user has
 * none with that `system_key` yet (even if renamed, archived or soft-deleted), so re-running never
 * duplicates or resurrects rows. Returns the number of categories inserted.
 */
export async function seedDefaultCategories(db: SqlExecutor, ctx: SeedContext): Promise<number> {
  let inserted = 0;
  const insert = async (
    key: string,
    name: string,
    type: "expense" | "income",
    icon: string | null,
    parentId: string | null,
    sortOrder: number,
  ): Promise<string> => {
    const id = ctx.newId();
    await db.run(INSERT, [
      id,
      ctx.userId,
      ctx.now,
      ctx.now,
      ctx.hlc,
      name,
      parentId,
      type,
      icon,
      sortOrder,
      key,
      ctx.userId,
      key,
    ]);
    const rows = await db.all<{ id: string }>(
      "SELECT id FROM categories WHERE user_id = ? AND system_key = ?",
      [ctx.userId, key],
    );
    const row = rows[0];
    if (!row) throw new Error(`Seed failed for category ${key}`);
    if (row.id === id) inserted++;
    return row.id;
  };

  await db.transaction(async () => {
    for (const [type, list] of [
      ["expense", DEFAULT_EXPENSE_CATEGORIES],
      ["income", DEFAULT_INCOME_CATEGORIES],
    ] as const) {
      let order = 0;
      for (const c of list) {
        const parentId = await insert(c.key, c.name, type, c.icon, null, order++);
        let childOrder = 0;
        for (const [childKey, childName] of c.children ?? []) {
          await insert(`${c.key}.${childKey}`, childName, type, null, parentId, childOrder++);
        }
      }
    }
  });
  return inserted;
}
