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

// Keyword → category, for guessing a category from a bank transaction's text.
// Lowercased substring match; first hit wins. Best-effort — the user can change
// it in the prefilled form.
const CATEGORY_HINTS: [RegExp, string][] = [
  [/esselunga|coop|conad|lidl|eurospin|carrefour|interspar|despar|pam|penny|aldi|md |supermerc|aliment|market/, "groceries"],
  [/ristorant|pizzer|trattor|osteria|mcdonald|burger|sushi|bar\b|caffè|caffe|bistro|tavola calda/, "dining"],
  [/enoteca|birr|pub\b|wine|cocktail/, "drinks"],
  [/benzin|carburant|eni\b|q8|tamoil|ip\b|esso|agip|distributor|autostrad|telepass|parcheggi|park|taxi|uber|trenital|italo|atac|gtt|amt|metro|bus\b/, "transport"],
  [/booking|airbnb|hotel|ryanair|easyjet|ita airways|alitalia|volotea|wizz|trivago|expedia|flixbus/, "travel"],
  [/enel|eni gas|hera|a2a|acea|iren|sorgenia|illumia|tim\b|vodafone|windtre|fastweb|iliad|bolletta/, "utilities"],
  [/netflix|spotify|disney|prime video|dazn|now tv|cinema|teatro|steam|playstation|xbox|nintendo/, "entertainment"],
  [/amazon|zalando|zara|h&m|decathlon|ikea|mediaworld|unieuro|apple\b|shop|store/, "shopping"],
  [/farmac|parafarm|medic|dottor|ospedal|clinic|dental|ottica/, "health"],
  [/palestr|gym|fitness|piscina|sport/, "sports"],
];

/** Best-effort category key guessed from a transaction description. */
export function guessCategory(text: string | null | undefined): string {
  const s = (text ?? "").toLowerCase();
  for (const [re, key] of CATEGORY_HINTS) if (re.test(s)) return key;
  return "general";
}

/** Icon shown for an expense: its own emoji if set, else the category emoji. */
export function expenseIcon(
  emoji: string | null,
  category: string,
  custom: CustomCategory[] = [],
): string {
  return emoji || resolveCategory(category, custom).emoji;
}
