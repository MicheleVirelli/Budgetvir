export interface Category {
  key: string;
  label: string;
  emoji: string;
}

// Fixed category set (Splitwise-style). Stored as `category` key on expenses —
// no DB table needed, which keeps reads cheap.
export const CATEGORIES: Category[] = [
  { key: "general", label: "General", emoji: "🧾" },
  { key: "groceries", label: "Groceries", emoji: "🛒" },
  { key: "dining", label: "Dining out", emoji: "🍽️" },
  { key: "drinks", label: "Drinks", emoji: "🍺" },
  { key: "transport", label: "Transport", emoji: "🚕" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "accommodation", label: "Accommodation", emoji: "🏨" },
  { key: "home", label: "Home", emoji: "🏠" },
  { key: "utilities", label: "Utilities", emoji: "💡" },
  { key: "entertainment", label: "Entertainment", emoji: "🎉" },
  { key: "shopping", label: "Shopping", emoji: "🛍️" },
  { key: "health", label: "Health", emoji: "💊" },
  { key: "gifts", label: "Gifts", emoji: "🎁" },
  { key: "sports", label: "Sports", emoji: "⚽" },
  { key: "other", label: "Other", emoji: "📦" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

export function getCategory(key: string | null | undefined): Category {
  return (key && BY_KEY.get(key)) || CATEGORIES[0];
}

interface CustomCategory {
  id: string;
  emoji: string;
  label: string;
}

function customToCategory(c: CustomCategory): Category {
  return { key: c.id, label: c.label, emoji: c.emoji };
}

/** Built-in categories plus a group's custom ones (custom first). */
export function buildCategoryList(custom: CustomCategory[] = []): Category[] {
  return [...custom.map(customToCategory), ...CATEGORIES];
}

/** Resolve a category key against a group's custom categories, else built-ins. */
export function resolveCategory(
  key: string | null | undefined,
  custom: CustomCategory[] = [],
): Category {
  if (key) {
    const c = custom.find((x) => x.id === key);
    if (c) return customToCategory(c);
  }
  return getCategory(key);
}

/** Icon shown for an expense: its own emoji if set, else the category emoji. */
export function expenseIcon(
  emoji: string | null,
  category: string,
  custom: CustomCategory[] = [],
): string {
  return emoji || resolveCategory(category, custom).emoji;
}
