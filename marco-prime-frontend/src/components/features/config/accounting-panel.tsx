import { Calculator, Loader2, Plus, Save, Trash2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  accountingSchema,
  type Accounting,
  type AccountingRow,
} from "../../../schemas/accounting.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface AccountingPanelProps {
  adminCardNumber: number;
}

type EditableRow = Pick<
  AccountingRow,
  "id" | "label" | "liters" | "purchasePricePerLiter" | "revenue"
>;

export function AccountingPanel({ adminCardNumber }: AccountingPanelProps) {
  const [accounting, setAccounting] = useState<Accounting | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("accounting"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = accountingSchema.parse(await response.json());
      setAccounting(value);
      setEventName(value.eventName);
      setEventDate(value.eventDate);
      setRows(value.rows.map(({ id, label, liters, purchasePricePerLiter, revenue }) => ({
        id,
        label,
        liters,
        purchasePricePerLiter,
        revenue,
      })));
    } catch {
      setMessage("Impossible de charger la comptabilité.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [adminCardNumber]);

  const updateRow = (id: string, field: keyof EditableRow, value: string) => {
    setRows((current) => current.map((row) =>
      row.id === id ? { ...row, [field]: value } : row,
    ));
    setMessage(null);
  };

  const save = async () => {
    const normalized = rows.map((row) => ({
      ...row,
      label: row.label.trim(),
      liters: normalizeNumber(row.liters),
      purchasePricePerLiter: normalizeNumber(row.purchasePricePerLiter),
      revenue: normalizeNumber(row.revenue),
    }));
    if (!eventName.trim() || !eventDate || normalized.some((row) =>
      !row.label || row.liters === null || row.purchasePricePerLiter === null || row.revenue === null
    )) {
      setMessage("Complétez toutes les cases avec des nombres positifs ou nuls.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(apiUrl("accounting"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber,
          eventName: eventName.trim(),
          eventDate,
          rows: normalized,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = accountingSchema.parse(await response.json());
      setAccounting(value);
      setRows(value.rows.map(({ id, label, liters, purchasePricePerLiter, revenue }) => ({
        id,
        label,
        liters,
        purchasePricePerLiter,
        revenue,
      })));
      setMessage("Comptabilité enregistrée.");
    } catch {
      setMessage("Impossible d’enregistrer la comptabilité.");
    } finally {
      setSaving(false);
    }
  };

  const totals = rows.reduce((sum, row) => {
    const liters = Number(normalizeNumber(row.liters) ?? 0);
    const cost = liters * Number(normalizeNumber(row.purchasePricePerLiter) ?? 0);
    const revenue = Number(normalizeNumber(row.revenue) ?? 0);
    return {
      liters: sum.liters + liters,
      cost: sum.cost + cost,
      revenue: sum.revenue + revenue,
      result: sum.result + revenue - cost,
    };
  }, { liters: 0, cost: 0, revenue: 0, result: 0 });

  if (loading) return <div class="flex flex-1 items-center justify-center"><Loader2 class="size-12 animate-spin text-primary" /></div>;

  return (
    <div class="flex-1 overflow-y-auto p-7">
      <div class="mx-auto flex max-w-7xl flex-col gap-5">
        <header class="flex flex-wrap items-end gap-4">
          <div class="mr-auto">
            <h1 class="flex items-center gap-3 text-2xl font-bold"><Calculator /> Compta réelle</h1>
            <p class="mt-1 text-muted-foreground">Saisissez les litres mesurés et les recettes réelles. Aucun calcul de TVA.</p>
          </div>
          <label class="flex flex-col gap-1 text-sm">Nom de l’événement<input class="border bg-input px-3 py-2 text-base" value={eventName} onInput={(event) => setEventName(event.currentTarget.value)} /></label>
          <label class="flex flex-col gap-1 text-sm">Date<input type="date" class="border bg-input px-3 py-2 text-base" value={eventDate} onInput={(event) => setEventDate(event.currentTarget.value)} /></label>
        </header>

        <Card class="overflow-x-auto p-0">
          <table class="w-full min-w-[900px] border-collapse text-left">
            <thead class="bg-muted/50"><tr><th class="p-3">Boisson</th><th class="p-3">Litres réels</th><th class="p-3">Prix achat / L</th><th class="p-3">Coût total</th><th class="p-3">Recettes réelles</th><th class="p-3">Résultat</th><th /></tr></thead>
            <tbody>
              {rows.map((row) => {
                const cost = Number(row.liters.replace(",", ".") || 0) * Number(row.purchasePricePerLiter.replace(",", ".") || 0);
                const result = Number(row.revenue.replace(",", ".") || 0) - cost;
                return <tr key={row.id} class="border-t">
                  <td class="p-2"><input class="w-full border bg-input px-3 py-2" value={row.label} onInput={(event) => updateRow(row.id, "label", event.currentTarget.value)} /></td>
                  <td class="p-2"><NumberInput value={row.liters} onInput={(value) => updateRow(row.id, "liters", value)} /></td>
                  <td class="p-2"><NumberInput value={row.purchasePricePerLiter} onInput={(value) => updateRow(row.id, "purchasePricePerLiter", value)} /></td>
                  <td class="p-3 font-medium">{formatMoney(cost)}</td>
                  <td class="p-2"><NumberInput value={row.revenue} onInput={(value) => updateRow(row.id, "revenue", value)} /></td>
                  <td class={`p-3 font-bold ${result < 0 ? "text-destructive" : "text-green-400"}`}>{formatMoney(result)}</td>
                  <td class="p-2"><Button aria-label={`Supprimer ${row.label}`} size="icon" variant="ghost" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Trash2 /></Button></td>
                </tr>;
              })}
            </tbody>
            <tfoot class="border-t-2 bg-muted/40 font-bold"><tr><td class="p-3">TOTAL</td><td class="p-3">{totals.liters.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} L</td><td /><td class="p-3">{formatMoney(totals.cost)}</td><td class="p-3">{formatMoney(totals.revenue)}</td><td class="p-3">{formatMoney(totals.result)}</td><td /></tr></tfoot>
          </table>
          {rows.length === 0 && <p class="p-8 text-center text-muted-foreground">Ajoutez une ligne pour commencer.</p>}
        </Card>

        <div class="flex items-center gap-3">
          <Button variant="outline" onClick={() => setRows((current) => [...current, { id: crypto.randomUUID(), label: "", liters: "0", purchasePricePerLiter: "0", revenue: "0" }])}><Plus /> Ajouter une boisson</Button>
          <Button class="ml-auto" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 class="animate-spin" /> : <Save />} Enregistrer</Button>
        </div>
        {message && <p class="text-center text-lg">{message}</p>}
        {accounting && <p class="text-center text-sm text-muted-foreground">Dernière sauvegarde : {new Date(accounting.updatedAt).toLocaleString("fr-FR")}</p>}
      </div>
    </div>
  );
}

function NumberInput({ value, onInput }: { value: string; onInput: (value: string) => void }) {
  return <input inputMode="decimal" class="w-32 border bg-input px-3 py-2" value={value} onInput={(event) => onInput(event.currentTarget.value)} />;
}

function normalizeNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized)) ? normalized : null;
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} €`;
}
