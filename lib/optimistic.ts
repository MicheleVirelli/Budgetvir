import type { ExpenseWithSplits } from "./types";

const OPTIMISTIC_KEY_PREFIX = "budgetvir_opt_exp_";
const OPTIMISTIC_TTL_MS = 60 * 1000; // 60 seconds

interface StoredOptimisticExpense {
  timestamp: number;
  expense: ExpenseWithSplits;
}

// In-memory fallback if sessionStorage is unavailable (e.g. strict private mode)
const memoryStore = new Map<string, StoredOptimisticExpense[]>();

function getStorageKey(groupId: string): string {
  return `${OPTIMISTIC_KEY_PREFIX}${groupId}`;
}

function safeGetItems(groupId: string): StoredOptimisticExpense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(getStorageKey(groupId));
    if (!raw) return memoryStore.get(groupId) ?? [];
    const parsed = JSON.parse(raw) as StoredOptimisticExpense[];
    const now = Date.now();
    // Filter out expired entries
    return parsed.filter((item) => now - item.timestamp < OPTIMISTIC_TTL_MS);
  } catch {
    return memoryStore.get(groupId) ?? [];
  }
}

function safeSaveItems(groupId: string, items: StoredOptimisticExpense[]): void {
  memoryStore.set(groupId, items);
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(getStorageKey(groupId), JSON.stringify(items));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

/**
 * Saves or updates an optimistic expense for a specific group.
 * Dispatches a custom window event so active components can update immediately.
 */
export function saveOptimisticExpense(groupId: string, expense: ExpenseWithSplits): void {
  const current = safeGetItems(groupId);
  const filtered = current.filter((item) => item.expense.id !== expense.id);
  filtered.unshift({
    timestamp: Date.now(),
    expense,
  });
  safeSaveItems(groupId, filtered);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("budgetvir:optimistic_expense", {
        detail: { groupId, expense },
      }),
    );
  }
}

/**
 * Retrieves all currently valid optimistic expenses for a group.
 */
export function getOptimisticExpenses(groupId: string): ExpenseWithSplits[] {
  return safeGetItems(groupId).map((item) => item.expense);
}

/**
 * Removes an optimistic expense once confirmed by server data.
 */
export function removeOptimisticExpense(groupId: string, expenseId: string): void {
  const current = safeGetItems(groupId);
  const remaining = current.filter((item) => item.expense.id !== expenseId);
  safeSaveItems(groupId, remaining);
}

