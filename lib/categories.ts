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

/** Icon shown for an expense: its own emoji if set, else the category emoji. */
export function expenseIcon(emoji: string | null, category: string): string {
  return emoji || getCategory(category).emoji;
}
