import { getGroupData } from "@/lib/data";
import { profileName } from "@/lib/balances";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const data = await getGroupData(id);
  if (!data) {
    return new Response("Not found", { status: 404 });
  }

  const { group, members, expenses } = data;
  const memberNames = members.map((m) => profileName(m));

  const header = [
    "Date",
    "Title",
    "Category",
    "Currency",
    "Amount",
    "Paid by",
    "Split",
    "Notes",
    ...memberNames,
  ];

  const rows = expenses.map((e) => {
    const owedByUser = new Map(e.splits.map((s) => [s.user_id, s.amount_owed]));
    return [
      e.expense_date,
      e.title,
      e.category,
      e.currency,
      e.amount.toFixed(2),
      profileName(members.find((m) => m.id === e.paid_by)),
      e.split_type,
      e.notes ?? "",
      ...members.map((m) => (owedByUser.get(m.id) ?? 0).toFixed(2)),
    ];
  });

  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  const safeName = group.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="budgetvir_${safeName}.csv"`,
    },
  });
}
