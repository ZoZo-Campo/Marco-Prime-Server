import {
  Archive,
  Calculator,
  Check,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  beerFormatFromProductName,
  findBeerPriceReference,
  SALE_FORMAT_LITERS,
} from "../../../constants/beer-prices";
import {
  accountingExportSchema,
  accountingSchema,
  type Accounting,
  type AccountingExport,
  type AccountingRow,
} from "../../../schemas/accounting.schema";
import {
  productCostListSchema,
  statisticsResponseSchema,
  type ProductCost,
} from "../../../schemas/statistics.schema";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface AccountingPanelProps {
  adminCardNumber: number;
}

type EditableRow = Pick<
  AccountingRow,
  | "id"
  | "productId"
  | "label"
  | "liters"
  | "units"
  | "purchasePricePerLiter"
  | "revenue"
  | "salePrice"
  | "saleFormat"
>;
type AccountingStatus = "draft" | "closed";
type DialogName = "new-event" | "close-event" | null;

// Types Fouaille : les pressions (fûts) se comptent en litres, tout le reste en unités.
const KEG_TYPE_ID = 1;
const DEFAULT_START_TIME = "16:30";
const DEFAULT_END_TIME = "23:59";

interface AccountingDraft {
  status: AccountingStatus;
  eventName: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  rows: EditableRow[];
}

interface WritableFile {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
interface SaveFileHandle {
  createWritable(): Promise<WritableFile>;
}
interface DirectoryHandle {
  getFileHandle(name: string, options: { create: boolean }): Promise<SaveFileHandle>;
}
interface FilePickerWindow extends Window {
  showDirectoryPicker?: (options?: { mode?: "readwrite" }) => Promise<DirectoryHandle>;
}

export function AccountingPanel({ adminCardNumber }: AccountingPanelProps) {
  const [accounting, setAccounting] = useState<Accounting | null>(null);
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [purchasePriceDefaults, setPurchasePriceDefaults] = useState<Map<number, string>>(new Map());
  const [status, setStatus] = useState<AccountingStatus>("draft");
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState(DEFAULT_START_TIME);
  const [eventEndTime, setEventEndTime] = useState(DEFAULT_END_TIME);
  const [rechargeFromDate, setRechargeFromDate] = useState(todayLocal());
  const [rechargeFromTime, setRechargeFromTime] = useState(DEFAULT_START_TIME);
  const [rechargeToDate, setRechargeToDate] = useState(todayLocal());
  const [rechargeToTime, setRechargeToTime] = useState(DEFAULT_END_TIME);
  const [rechargeSummary, setRechargeSummary] = useState<AccountingExport["rechargeSummary"] | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [lastPrefillAt, setLastPrefillAt] = useState<string | null>(null);
  const [lastExportSignature, setLastExportSignature] = useState<string | null>(null);
  const loaded = useRef(false);
  const lastSavedSignature = useRef("");
  const lastFailedSignature = useRef("");

  const draft = useMemo<AccountingDraft>(
    () => ({ status, eventName, eventDate, eventStartTime, eventEndTime, rows }),
    [status, eventName, eventDate, eventStartTime, eventEndTime, rows],
  );
  const draftSignature = useMemo(() => signature(draft), [draft]);
  const hasUnsavedChanges = loaded.current && draftSignature !== lastSavedSignature.current;
  const isClosed = status === "closed";
  const availableProducts = useMemo(
    () => products.filter((product) => product.available).sort(compareProducts),
    [products],
  );
  const archivedProducts = useMemo(
    () => products.filter((product) => !product.available).sort(compareProducts),
    [products],
  );

  const load = async () => {
    loaded.current = false;
    setLoading(true);
    setMessage(null);
    try {
      const [accountingResponse, productsResponse] = await Promise.all([
        fetch(apiUrl("accounting"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ adminCardNumber }),
        }),
        fetch(apiUrl("statistics/costs"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ adminCardNumber }),
        }),
      ]);
      if (!accountingResponse.ok || !productsResponse.ok) throw new Error("HTTP error");

      const value = accountingSchema.parse(await accountingResponse.json());
      const catalogue = productCostListSchema.parse(await productsResponse.json());
      const nextDefaults = defaultsMap(value);
      const editableRows = toEditableRows(value, catalogue, nextDefaults);
      const nextDraft = {
        status: value.status,
        eventName: value.eventName,
        eventDate: value.eventDate,
        eventStartTime: value.eventStartTime,
        eventEndTime: value.eventEndTime,
        rows: editableRows,
      };
      setAccounting(value);
      setProducts(catalogue);
      setPurchasePriceDefaults(nextDefaults);
      setStatus(value.status);
      setEventName(value.eventName);
      setEventDate(value.eventDate);
      setEventStartTime(value.eventStartTime);
      setEventEndTime(value.eventEndTime);
      setRechargeFromDate(value.eventDate);
      setRechargeFromTime(value.eventStartTime);
      setRechargeToDate(value.eventEndTime <= value.eventStartTime ? addDaysIso(value.eventDate, 1) : value.eventDate);
      setRechargeToTime(value.eventEndTime);
      setRows(editableRows);
      lastSavedSignature.current = signature(nextDraft);
      loaded.current = true;
    } catch {
      setMessage("Impossible de charger la comptabilité et le catalogue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [adminCardNumber]);

  const persist = async (nextDraft: AccountingDraft, quiet = false) => {
    if (!isValidDraft(nextDraft)) {
      if (!quiet) {
        setMessage("Choisissez un produit différent par ligne et vérifiez tous les nombres.");
      }
      return null;
    }
    setSaving(true);
    const requestSignature = signature(nextDraft);
    try {
      const response = await fetch(apiUrl("accounting"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber,
          status: nextDraft.status,
          eventName: nextDraft.eventName.trim(),
          eventDate: nextDraft.eventDate,
          eventStartTime: nextDraft.eventStartTime,
          eventEndTime: nextDraft.eventEndTime,
          rows: normalizeRows(nextDraft.rows),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = accountingSchema.parse(await response.json());
      setAccounting(value);
      setPurchasePriceDefaults(defaultsMap(value));
      lastSavedSignature.current = requestSignature;
      lastFailedSignature.current = "";
      if (!quiet) setMessage("Comptabilité enregistrée.");
      return value;
    } catch {
      if (quiet) lastFailedSignature.current = requestSignature;
      setMessage("Impossible d’enregistrer la comptabilité.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (loading || saving || isClosed || !loaded.current || !hasUnsavedChanges || !isValidDraft(draft)) return;
    if (lastFailedSignature.current === draftSignature) return;
    const timer = window.setTimeout(() => void persist(draft, true), 800);
    return () => window.clearTimeout(timer);
  }, [draftSignature, loading, saving, isClosed]);

  const save = async () => {
    const value = await persist(draft);
    if (!value) return;
    const nextDefaults = defaultsMap(value);
    const editableRows = toEditableRows(value, products, nextDefaults);
    setPurchasePriceDefaults(nextDefaults);
    setRows(editableRows);
    setEventName(value.eventName);
    setEventDate(value.eventDate);
    setEventStartTime(value.eventStartTime);
    setEventEndTime(value.eventEndTime);
    setStatus(value.status);
    lastSavedSignature.current = signature({
      status: value.status,
      eventName: value.eventName,
      eventDate: value.eventDate,
      eventStartTime: value.eventStartTime,
      eventEndTime: value.eventEndTime,
      rows: editableRows,
    });
  };

  const updateRow = (id: string, field: keyof EditableRow, value: string | number | null) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    setMessage(null);
  };

  const chooseProduct = (rowId: string, value: string) => {
    const product = products.find((item) => item.id === Number(value));
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      if (!product) {
        return {
          ...row,
          productId: null,
          label: "",
          liters: "0",
          units: "0",
          purchasePricePerLiter: "0",
          salePrice: "0",
          saleFormat: "unit",
        };
      }
      const isKeg = product.productTypeId === KEG_TYPE_ID;
      const wasUnitQuantity = Number(row.units) > 0 ? row.units : row.liters;
      const wasLitreQuantity = Number(row.liters) > 0 ? row.liters : row.units;
      const format = isKeg ? beerFormatFromProductName(product.name) : "unit";
      const reference = findBeerPriceReference(product.name, isKeg ? "keg" : "bottle");
      return {
        ...row,
        productId: product.id,
        label: product.name,
        liters: isKeg ? wasLitreQuantity : "0",
        units: isKeg ? "0" : wasUnitQuantity,
        purchasePricePerLiter: purchasePriceDefaults.get(product.id)
          ?? reference?.purchasePrice
          ?? (isKeg ? "0" : product.costPrice ?? "0"),
        salePrice: reference?.salePrices[format] ?? product.sellingPrice,
        saleFormat: format,
      };
    }));
    setMessage(null);
  };

  const changeSaleFormat = (rowId: string, format: EditableRow["saleFormat"]) => {
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      const reference = findBeerPriceReference(row.label, "keg");
      return {
        ...row,
        saleFormat: format,
        salePrice: reference?.salePrices[format] ?? row.salePrice,
      };
    }));
    setMessage(null);
  };

  const addProduct = () => {
    const selectedIds = new Set(rows.flatMap((row) => (row.productId === null ? [] : [row.productId])));
    const normalizedQuery = normalizeSearch(productSearch);
    const product = [...availableProducts, ...archivedProducts].find(
      (item) =>
        !selectedIds.has(item.id) &&
        (!normalizedQuery || normalizeSearch(item.name).includes(normalizedQuery)),
    );
    if (!product) {
      setMessage(
        normalizedQuery
          ? "Aucun autre produit ne correspond à cette recherche."
          : "Tous les produits du catalogue sont déjà présents.",
      );
      return;
    }
    setRows((current) => [...current, newRow(product, purchasePriceDefaults)]);
    setMessage(null);
  };

  const prefillFromSales = async () => {
    if (!eventDate) {
      setMessage("Choisissez d’abord la date de la soirée.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("statistics"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber, ...eventRange(eventDate, eventStartTime, eventEndTime) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const statistics = statisticsResponseSchema.parse(await response.json());
      const revenues = new Map<string, { revenue: number; productId: number; name: string }>();
      for (const product of statistics.products) {
        const key = productFamily(product.name);
        const current = revenues.get(key);
        revenues.set(key, {
          revenue: (current?.revenue ?? 0) + Number(product.revenue),
          productId: current?.productId ?? product.productId,
          name: current?.name ?? product.name,
        });
      }
      setRows((currentRows) => {
        const remaining = new Map(revenues);
        const nextRows = currentRows.map((row) => {
          const key = productFamily(row.label);
          const sale = remaining.get(key);
          if (!sale) return row;
          remaining.delete(key);
          return { ...row, revenue: decimal(sale.revenue, 2) };
        });
        for (const sale of remaining.values()) {
          const product = products.find((entry) => entry.id === sale.productId)
            ?? products.find((entry) => productFamily(entry.name) === productFamily(sale.name));
          if (product) nextRows.push({ ...newRow(product, purchasePriceDefaults), revenue: decimal(sale.revenue, 2) });
        }
        return nextRows;
      });
      setLastPrefillAt(new Date().toISOString());
      setMessage(
        statistics.summary.salesLines === 0
          ? `Aucune vente trouvée sur la période ${eventStartTime}–${eventEndTime}. Les recettes restent modifiables.`
          : `${statistics.summary.salesLines} vente${statistics.summary.salesLines > 1 ? "s" : ""} intégrée${statistics.summary.salesLines > 1 ? "s" : ""} sur la période ${eventStartTime}–${eventEndTime}. Vérifiez puis ajustez les recettes réelles si nécessaire.`,
      );
    } catch {
      setMessage("Impossible de récupérer les ventes de cette soirée.");
    } finally {
      setSaving(false);
    }
  };

  const startNewEvent = async (keepProducts: boolean) => {
    const nextRows = keepProducts
      ? rows.map((row) => ({
          ...row,
          id: crypto.randomUUID(),
          liters: "0",
          units: "0",
          purchasePricePerLiter: row.productId === null
            ? row.purchasePricePerLiter
            : (purchasePriceDefaults.get(row.productId)
              ?? findBeerPriceReference(
                row.label,
                row.saleFormat === "unit" ? "bottle" : "keg",
              )?.purchasePrice
              ?? row.purchasePricePerLiter),
          revenue: "0",
        }))
      : [];
    const nextDraft: AccountingDraft = {
      status: "draft",
      eventName: "Soirée Marco",
      eventDate: todayLocal(),
      eventStartTime: DEFAULT_START_TIME,
      eventEndTime: DEFAULT_END_TIME,
      rows: nextRows,
    };
    setDialog(null);
    setStatus(nextDraft.status);
    setEventName(nextDraft.eventName);
    setEventDate(nextDraft.eventDate);
    setEventStartTime(nextDraft.eventStartTime);
    setEventEndTime(nextDraft.eventEndTime);
    setRechargeFromDate(nextDraft.eventDate);
    setRechargeFromTime(nextDraft.eventStartTime);
    setRechargeToDate(nextDraft.eventEndTime <= nextDraft.eventStartTime ? addDaysIso(nextDraft.eventDate, 1) : nextDraft.eventDate);
    setRechargeToTime(nextDraft.eventEndTime);
    setRows(nextDraft.rows);
    setLastPrefillAt(null);
    setLastExportSignature(null);
    const value = await persist(nextDraft, true);
    if (value) {
      lastSavedSignature.current = signature(nextDraft);
      setMessage(keepProducts
        ? "Nouvelle soirée créée. Les produits et prix d’achat ont été conservés."
        : "Nouvelle soirée vide créée. Les prix d’achat mémorisés restent disponibles.");
    }
  };

  const reopenEvent = async () => {
    const nextDraft = { ...draft, status: "draft" as const };
    const value = await persist(nextDraft, true);
    if (!value) return;
    setStatus("draft");
    lastSavedSignature.current = signature(nextDraft);
    setMessage("Soirée rouverte. Les saisies peuvent de nouveau être modifiées.");
  };

  const exportFullEvent = async () => {
    const saved = await persist(draft, true);
    if (!saved) return false;
    try {
      const response = await fetch(apiUrl("accounting/export"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber, ...eventRange(eventDate, eventStartTime, eventEndTime) }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const exported = accountingExportSchema.parse(await response.json());
      const files = createExportFiles(exported);
      const directoryPicker = (window as FilePickerWindow).showDirectoryPicker;
      if (directoryPicker) {
        try {
          const directory = await directoryPicker({ mode: "readwrite" });
          for (const file of files) {
            const handle = await directory.getFileHandle(file.name, { create: true });
            const writable = await handle.createWritable();
            await writable.write(file.blob);
            await writable.close();
          }
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return false;
          throw error;
        }
      } else {
        files.forEach((file, index) => {
          window.setTimeout(() => downloadBlob(file.name, file.blob), index * 400);
        });
      }
      setLastExportSignature(draftSignature);
      setMessage(directoryPicker
        ? "Export complet enregistré : 4 CSV et une sauvegarde JSON."
        : `Export enregistré dans les fichiers de la tablette : ${files.length} fichiers datés du ${formatDateFr(eventDate)} dans le dossier Téléchargements.`);
      return true;
    } catch {
      setMessage("Impossible de créer l’export complet de la soirée.");
      return false;
    }
  };

  const exportRecharges = async () => {
    if (!rechargeFromDate || !rechargeToDate) {
      setMessage("Choisissez les dates de début et de fin des rechargements.");
      return;
    }
    const from = new Date(`${rechargeFromDate}T${rechargeFromTime}:00`);
    const to = new Date(`${rechargeToDate}T${rechargeToTime}:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      setMessage("La plage de rechargements est invalide.");
      return;
    }
    if (to <= from) {
      setMessage("La date et l’heure de fin doivent être après le début.");
      return;
    }
    try {
      const response = await fetch(apiUrl("accounting/export"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber,
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const exported = accountingExportSchema.parse(await response.json());
      setRechargeSummary(exported.rechargeSummary ?? null);
      const csv = tableCsv(
        ["Transaction", "Date", "Membre", "Montant", "Paiement reçu"],
        exported.recharges.map((recharge) => [recharge.orderId, formatCsvDate(recharge.date), memberName(recharge), csvNumber(Number(recharge.amount), 2), paymentMethodLabel(recharge.paymentMethod)]),
      );
      const sameDay = rechargeFromDate === rechargeToDate;
      const fileName = sameDay
        ? `rechargements-${formatDateFr(rechargeFromDate)}.csv`
        : `rechargements-${formatDateFr(rechargeFromDate)}_au_${formatDateFr(rechargeToDate)}.csv`;
      downloadBlob(fileName, csvFile("rechargements.csv", csv).blob);
      setMessage(`${exported.recharges.length} rechargement(s) exporté(s) du ${formatDateFr(rechargeFromDate)} ${rechargeFromTime} au ${formatDateFr(rechargeToDate)} ${rechargeToTime}.`);
    } catch (error) {
      setMessage(`Export des rechargements impossible : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    }
  };

  const closeEvent = async () => {
    if (!canClose(rows) || lastExportSignature !== draftSignature) return;
    const nextDraft = { ...draft, status: "closed" as const };
    const value = await persist(nextDraft, true);
    if (!value) return;
    setStatus("closed");
    lastSavedSignature.current = signature(nextDraft);
    setDialog(null);
    setMessage("Soirée clôturée. Les données sont verrouillées et exportées.");
  };

  const totals = calculateTotals(rows);
  const endIsNextDay = eventEndTime <= eventStartTime;
  const pricesReady = rows.length > 0 && rows.every(hasPositivePrice);
  const quantitiesReady = rows.length > 0 && rows.every(hasPositiveQuantity);
  const exportReady = lastExportSignature === draftSignature;

  if (loading) {
    return <div class="flex flex-1 items-center justify-center"><Loader2 class="size-12 animate-spin text-primary" /></div>;
  }

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="min-h-0 flex-1 overflow-y-auto p-5 pb-8">
        <div class="mx-auto flex max-w-7xl flex-col gap-5">
        <header class="flex flex-wrap items-end gap-4">
          <div class="mr-auto">
            <h1 class="flex items-center gap-3 text-2xl font-bold"><Calculator /> Compta réelle</h1>
            <p class="mt-1 text-muted-foreground">
              Saisissez les litres réellement écoulés pour les fûts et les unités pour les autres produits. Les prix du PDF préremplissent le prix de vente ; le CA attendu et l’écart se calculent automatiquement.
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span class={`rounded-full px-3 py-1 font-medium ${isClosed ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-300"}`}>
                {isClosed ? "Soirée clôturée" : "Brouillon en cours"}
              </span>
              <SaveState saving={saving} hasUnsavedChanges={hasUnsavedChanges} updatedAt={accounting?.updatedAt ?? null} />
            </div>
          </div>
          <label class="flex flex-col gap-1 text-sm">
            Nom de l’événement
            <input
              class="border bg-input px-3 py-2 text-base disabled:opacity-60"
              value={eventName}
              disabled={isClosed}
              onInput={(event) => { setEventName(event.currentTarget.value); setMessage(null); }}
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Date
            <input
              type="date"
              lang="fr-FR"
              class="border bg-input px-3 py-2 text-base disabled:opacity-60"
              value={eventDate}
              disabled={isClosed}
              onInput={(event) => {
                const value = event.currentTarget.value;
                setEventDate(value);
                setRechargeFromDate(value);
                setRechargeFromTime(eventStartTime);
                setRechargeToDate(eventEndTime <= eventStartTime ? addDaysIso(value, 1) : value);
                setRechargeToTime(eventEndTime);
                setLastPrefillAt(null);
                setMessage(null);
              }}
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Début
            <input
              type="time"
              class="border bg-input px-3 py-2 text-base disabled:opacity-60"
              value={eventStartTime}
              disabled={isClosed}
              onInput={(event) => { setEventStartTime(event.currentTarget.value); setLastPrefillAt(null); setMessage(null); }}
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Fin
            <input
              type="time"
              class="border bg-input px-3 py-2 text-base disabled:opacity-60"
              value={eventEndTime}
              disabled={isClosed}
              onInput={(event) => { setEventEndTime(event.currentTarget.value); setLastPrefillAt(null); setMessage(null); }}
            />
          </label>
        </header>

        {!isClosed && (
          <Card class="flex flex-wrap items-center gap-3 p-4">
            <Button variant="outline" disabled={saving} onClick={() => void prefillFromSales()}>
              <Sparkles /> Préremplir depuis les ventes
            </Button>
            <p class="text-sm text-muted-foreground">
              Période utilisée : {eventDate ? formatDateFr(eventDate) : "jour choisi"} de {eventStartTime} à {eventEndTime}
              {endIsNextDay && " (fin le lendemain)"}. Les valeurs restent modifiables pour refléter les pertes et écarts réels.
              {lastPrefillAt && ` Dernier préremplissage : ${new Date(lastPrefillAt).toLocaleTimeString("fr-FR")}.`}
            </p>
          </Card>
        )}

        <Card class="overflow-hidden p-0">
          <div class="flex flex-wrap items-center gap-3 border-b p-3">
            <label class="flex min-h-12 min-w-0 flex-1 items-center gap-2 border bg-background px-3 sm:min-w-72">
              <Search class="size-5 text-muted-foreground" />
              <input
                class="min-w-0 flex-1 bg-transparent text-base outline-none"
                placeholder="Rechercher un produit…"
                value={productSearch}
                onInput={(event) => setProductSearch(event.currentTarget.value)}
              />
              {productSearch && (
                <button aria-label="Effacer la recherche" class="p-2 text-muted-foreground" onClick={() => setProductSearch("")}>
                  <X class="size-5" />
                </button>
              )}
            </label>
            <span class="text-sm text-muted-foreground">
              Produits vendus actuellement en premier · anciens produits conservés pour la compta
            </span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[1280px] border-collapse text-left">
              <thead class="bg-muted/50">
                <tr>
                  <th class="p-3">Produit Fouaille</th><th class="p-3">Quantité réelle</th>
                  <th class="p-3">Prix d'achat</th><th class="p-3">Coût total</th>
                  <th class="p-3">Format</th><th class="p-3">Prix de vente</th>
                  <th class="p-3">CA attendu</th><th class="p-3">Recettes réelles</th>
                  <th class="p-3">Écart</th><th class="p-3">Résultat</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const values = calculateRow(row);
                  const isUnit = row.saleFormat === "unit";
                  const selectedElsewhere = new Set(rows.flatMap((item) =>
                    item.id !== row.id && item.productId !== null ? [item.productId] : [],
                  ));
                  return (
                    <tr key={row.id} class="border-t">
                      <td class="p-2">
                        <select
                          class="w-full min-w-52 border bg-input px-3 py-2 disabled:opacity-60"
                          value={row.productId ?? ""}
                          disabled={isClosed}
                          onChange={(event) => chooseProduct(row.id, event.currentTarget.value)}
                        >
                          {row.productId === null && <option value="">Choisir un produit…</option>}
                          <ProductOptions
                            currentProductId={row.productId}
                            query={productSearch}
                            available={availableProducts}
                            archived={archivedProducts}
                            selectedElsewhere={selectedElsewhere}
                          />
                        </select>
                      </td>
                      <td class="p-2">
                        <span class="flex items-center gap-2">
                          <NumberInput
                            value={isUnit ? row.units : row.liters}
                            disabled={isClosed}
                            onInput={(value) => updateRow(row.id, isUnit ? "units" : "liters", value)}
                          />
                          <span class="min-w-14 text-xs text-muted-foreground">{isUnit ? "unité" : "litre"}</span>
                        </span>
                      </td>
                      <td class="p-2">
                        <span class="flex items-center gap-2">
                          <NumberInput value={row.purchasePricePerLiter} disabled={isClosed} onInput={(value) => updateRow(row.id, "purchasePricePerLiter", value)} />
                          <span class="min-w-16 text-xs text-muted-foreground">{isUnit ? "/ unité" : "/ L"}</span>
                        </span>
                      </td>
                      <td class="p-3 font-medium">{formatMoney(values.cost)}</td>
                      <td class="p-2">
                        {isUnit ? (
                          <span class="inline-flex min-h-10 items-center px-2 text-sm text-muted-foreground">Unité</span>
                        ) : (
                          <select
                            class="w-28 border bg-input px-2 py-2 disabled:opacity-60"
                            value={row.saleFormat}
                            disabled={isClosed}
                            onChange={(event) => changeSaleFormat(row.id, event.currentTarget.value as EditableRow["saleFormat"])}
                          >
                            <option value="25cl">25 cl</option>
                            <option value="33cl">33 cl</option>
                            <option value="50cl">50 cl</option>
                            <option value="60cl">60 cl</option>
                          </select>
                        )}
                      </td>
                      <td class="p-2">
                        <span class="flex items-center gap-2">
                          <NumberInput value={row.salePrice} disabled={isClosed} onInput={(value) => updateRow(row.id, "salePrice", value)} />
                          <span class="min-w-14 text-xs text-muted-foreground">{isUnit ? "/ unité" : `/${row.saleFormat}`}</span>
                        </span>
                      </td>
                      <td class="p-3 font-medium">{formatMoney(values.expectedRevenue)}</td>
                      <td class="p-2"><NumberInput value={row.revenue} disabled={isClosed} onInput={(value) => updateRow(row.id, "revenue", value)} /></td>
                      <td class={`p-3 font-bold ${values.variance < 0 ? "text-destructive" : "text-green-400"}`}>
                        {formatMoney(values.variance)}
                      </td>
                      <td class={`p-3 font-bold ${values.result < 0 ? "text-destructive" : "text-green-400"}`}>
                        {formatMoney(values.result)}
                      </td>
                      <td class="p-2">
                        <Button
                          aria-label={`Supprimer ${row.label}`}
                          size="icon"
                          variant="ghost"
                          disabled={isClosed}
                          onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                        ><Trash2 /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot class="border-t-2 bg-muted/40 font-bold">
                <tr>
                  <td class="p-3">TOTAL</td>
                  <td class="p-3">{formatLiters(totals.liters)}{Number(totals.units) > 0 && <> · {formatUnits(totals.units)}</>}</td>
                  <td /><td class="p-3">{formatMoney(totals.cost)}</td>
                  <td /><td />
                  <td class="p-3">{formatMoney(totals.expectedRevenue)}</td><td class="p-3">{formatMoney(totals.revenue)}</td>
                  <td class={`p-3 ${totals.variance < 0 ? "text-destructive" : "text-green-400"}`}>{formatMoney(totals.variance)}</td>
                  <td class="p-3">{formatMoney(totals.result)}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="border-t px-3 py-2 text-xs text-muted-foreground">
            CA attendu : litres ÷ format × prix de vente pour les fûts, unités × prix de vente pour les autres produits. Écart = recettes réelles − CA attendu.
          </p>
          {rows.length === 0 && <p class="p-8 text-center text-muted-foreground">Ajoutez un produit ou préremplissez les ventes pour commencer.</p>}
        </Card>

          <Card class="flex flex-col gap-3 p-4">
            <div class="flex flex-wrap items-end justify-between gap-3">
              <div class="flex flex-col gap-1 text-sm">
                <span class="font-medium">Rechargements à exporter</span>
                <span class="text-muted-foreground">
                  Du {formatDateFr(rechargeFromDate)} {rechargeFromTime} au {formatDateFr(rechargeToDate)} {rechargeToTime}
                </span>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRechargeFromDate(eventDate);
                    setRechargeFromTime(eventStartTime);
                    setRechargeToDate(eventEndTime <= eventStartTime ? addDaysIso(eventDate, 1) : eventDate);
                    setRechargeToTime(eventEndTime);
                  }}
                >Soirée</Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const day = rechargeFromDate || todayLocal();
                    setRechargeFromDate(day);
                    setRechargeFromTime("00:00");
                    setRechargeToDate(day);
                    setRechargeToTime("23:59");
                  }}
                >Journée</Button>
              </div>
            </div>
            <div class="flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1 text-sm">Du
                <span class="flex gap-2">
                  <input type="date" lang="fr-FR" class="border bg-input px-3 py-2 text-base" value={rechargeFromDate} onInput={(event) => setRechargeFromDate(event.currentTarget.value)} />
                  <input type="time" class="border bg-input px-3 py-2 text-base" value={rechargeFromTime} onInput={(event) => setRechargeFromTime(event.currentTarget.value)} />
                </span>
              </label>
              <label class="flex flex-col gap-1 text-sm">Au
                <span class="flex gap-2">
                  <input type="date" lang="fr-FR" class="border bg-input px-3 py-2 text-base" value={rechargeToDate} onInput={(event) => setRechargeToDate(event.currentTarget.value)} />
                  <input type="time" class="border bg-input px-3 py-2 text-base" value={rechargeToTime} onInput={(event) => setRechargeToTime(event.currentTarget.value)} />
                </span>
              </label>
              <Button variant="outline" disabled={!rechargeFromDate || !rechargeToDate} onClick={() => void exportRecharges()}><Download /> Exporter rechargements CSV</Button>
            </div>
            <p class="text-xs text-muted-foreground">Plage libre : choisissez les dates et heures de début et de fin. « Soirée » reprend la période de la compta ; « Journée » couvre 00h00–23h59. Le mode de paiement est enregistré en local à chaque rechargement effectué sur cette Marco ; ceux faits sur une autre caisse apparaissent « Pas rechargé sur cette Marco ».</p>
            {rechargeSummary && (
              <div class="flex w-full flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
                <span>{rechargeSummary.count} rechargement(s) · total <strong>{rechargeSummary.total} €</strong></span>
                <span>Carte bancaire : <strong>{rechargeSummary.card} €</strong> ({rechargeSummary.cardCount})</span>
                <span>Espèces : <strong>{rechargeSummary.cash} €</strong> ({rechargeSummary.cashCount})</span>
                <span class="text-muted-foreground">Pas rechargé sur cette Marco : <strong>{rechargeSummary.unknown} €</strong> ({rechargeSummary.unknownCount})</span>
              </div>
            )}
          </Card>
          {message && <p class="text-center text-lg">{message}</p>}
        </div>
      </div>

      <div class="z-30 flex shrink-0 flex-wrap items-center gap-3 border-t bg-background px-5 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.35)]">
          {!isClosed && <Button variant="outline" onClick={addProduct}><Plus /> Ajouter un produit</Button>}
          <Button variant="outline" disabled={saving} onClick={() => void exportFullEvent()}><Download /> Export complet…</Button>
          <Button variant="outline" onClick={() => setDialog("new-event")}><RefreshCw /> Nouvelle soirée</Button>
          {isClosed ? (
            <Button class="ml-auto" disabled={saving} onClick={() => void reopenEvent()}>Rouvrir la soirée</Button>
          ) : (
            <>
              <Button variant="outline" disabled={saving} onClick={() => setDialog("close-event")}><Archive /> Clôturer la soirée</Button>
              <Button class="ml-auto" disabled={saving || !hasUnsavedChanges} onClick={() => void save()}>
                {saving ? <Loader2 class="animate-spin" /> : <Save />} Enregistrer maintenant
              </Button>
            </>
          )}
      </div>

      {dialog === "new-event" && (
        <Modal title="Créer une nouvelle soirée" onClose={() => setDialog(null)}>
          <p class="text-muted-foreground">
            La soirée actuelle est remplacée dans le brouillon local. Exportez-la d’abord si vous devez conserver son bilan.
            Les prix d'achat mémorisés (par litre ou par unité) ne sont jamais supprimés.
          </p>
          <div class="mt-5 grid gap-3 sm:grid-cols-2">
            <Button variant="outline" disabled={saving} onClick={() => void startNewEvent(true)}>Garder les produits habituels</Button>
            <Button disabled={saving} onClick={() => void startNewEvent(false)}>Commencer avec une liste vide</Button>
          </div>
        </Modal>
      )}

      {dialog === "close-event" && (
        <Modal title="Clôture guidée de la soirée" onClose={() => setDialog(null)}>
          <div class="space-y-3">
            <ChecklistLine ready={pricesReady} label="Prix d’achat vérifiés" detail="Chaque produit doit avoir un prix d’achat (par litre pour les fûts, par unité pour les autres) supérieur à zéro." />
            <ChecklistLine ready={quantitiesReady} label="Quantités réelles saisies" detail="Chaque ligne conservée doit contenir une quantité mesurée (litres pour les fûts, unités pour les autres produits)." />
            <ChecklistLine ready={rows.length > 0 && rows.every(hasPositiveSalePrice)} optional label="Prix de vente renseignés" detail="Les prix du PDF servent à calculer le CA attendu et l’écart. Un prix à zéro reste possible pour un produit offert." />
            <ChecklistLine ready={lastPrefillAt !== null} optional label="Ventes Marco vérifiées" detail="Préremplissez les recettes ou vérifiez-les manuellement." />
            <ChecklistLine ready={exportReady} label="Export et sauvegarde créés" detail="Les 4 CSV et la sauvegarde JSON doivent correspondre à la dernière saisie." />
          </div>
          <div class="mt-5 flex flex-wrap gap-3">
            <Button variant="outline" disabled={saving} onClick={() => void exportFullEvent()}><FileArchive /> Exporter et sauvegarder…</Button>
            <Button class="ml-auto" disabled={saving || !canClose(rows) || !exportReady} onClick={() => void closeEvent()}>
              <Check /> Marquer la soirée terminée
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductOptions({ currentProductId, query, available, archived, selectedElsewhere }: {
  currentProductId: number | null;
  query: string;
  available: ProductCost[];
  archived: ProductCost[];
  selectedElsewhere: Set<number>;
}) {
  const matches = (product: ProductCost) => product.id === currentProductId || normalizeSearch(product.name).includes(normalizeSearch(query));
  const visibleAvailable = available.filter(matches);
  const visibleArchived = archived.filter(matches);
  return (
    <>
      {visibleAvailable.length > 0 && (
        <optgroup label="En vente actuellement">
          {visibleAvailable.map((product) => <option key={product.id} value={product.id} disabled={selectedElsewhere.has(product.id)}>{product.name}</option>)}
        </optgroup>
      )}
      {visibleArchived.length > 0 && (
        <optgroup label="Anciens produits / hors vente">
          {visibleArchived.map((product) => <option key={product.id} value={product.id} disabled={selectedElsewhere.has(product.id)}>{product.name} · hors vente actuellement</option>)}
        </optgroup>
      )}
      {visibleAvailable.length === 0 && visibleArchived.length === 0 && <option disabled>Aucun produit correspondant</option>}
    </>
  );
}

function SaveState({ saving, hasUnsavedChanges, updatedAt }: { saving: boolean; hasUnsavedChanges: boolean; updatedAt: string | null }) {
  if (saving) return <span class="flex items-center gap-1 text-muted-foreground"><Loader2 class="size-4 animate-spin" /> Enregistrement…</span>;
  if (hasUnsavedChanges) return <span class="text-amber-300">Modifications en attente…</span>;
  return (
    <span class="flex items-center gap-1 text-green-400">
      <CheckCircle2 class="size-4" /> Enregistré{updatedAt ? ` à ${new Date(updatedAt).toLocaleTimeString("fr-FR")}` : ""}
    </span>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card class="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto p-6 pb-8 shadow-2xl">
        <div class="mb-4 flex items-start justify-between gap-3">
          <h2 class="text-2xl font-bold">{title}</h2>
          <Button size="icon" variant="ghost" aria-label="Fermer" onClick={onClose}><X /></Button>
        </div>
        {children}
      </Card>
    </div>
  );
}

function ChecklistLine({ ready, optional = false, label, detail }: { ready: boolean; optional?: boolean; label: string; detail: string }) {
  return (
    <div class="flex gap-3 rounded-lg border p-3">
      <span class={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${ready ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
        {ready ? <Check class="size-4" /> : "·"}
      </span>
      <div>
        <p class="font-semibold">{label} {optional && <span class="font-normal text-muted-foreground">(conseillé)</span>}</p>
        <p class="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function NumberInput({ value, disabled, onInput }: { value: string; disabled: boolean; onInput: (value: string) => void }) {
  return <input inputMode="decimal" class="w-32 border bg-input px-3 py-2 disabled:opacity-60" value={value} disabled={disabled} onInput={(event) => onInput(event.currentTarget.value)} />;
}

function newRow(product: ProductCost, defaults: Map<number, string>): EditableRow {
  const isKeg = product.productTypeId === KEG_TYPE_ID;
  const saleFormat: EditableRow["saleFormat"] = isKeg ? beerFormatFromProductName(product.name) : "unit";
  const reference = findBeerPriceReference(product.name, isKeg ? "keg" : "bottle");
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    label: product.name,
    liters: "0",
    units: "0",
    purchasePricePerLiter: defaults.get(product.id)
      ?? reference?.purchasePrice
      ?? (isKeg ? "0" : product.costPrice ?? "0"),
    revenue: "0",
    salePrice: reference?.salePrices[saleFormat] ?? product.sellingPrice,
    saleFormat,
  };
}

function toEditableRows(value: Accounting, catalogue: ProductCost[], defaults: Map<number, string>) {
  return value.rows.map(({ id, productId, label, liters, units, purchasePricePerLiter, revenue, salePrice, saleFormat }) => {
    const product = productId === null
      ? catalogue.find((entry) => normalizeSearch(entry.name) === normalizeSearch(label))
      : catalogue.find((entry) => entry.id === productId);
    const isKeg = product?.productTypeId === KEG_TYPE_ID;
    let nextLiters = liters;
    let nextUnits = units ?? "0";
    if (isKeg && Number(nextLiters) === 0 && Number(nextUnits) > 0) {
      nextLiters = nextUnits;
      nextUnits = "0";
    } else if (product && !isKeg && Number(nextUnits) === 0 && Number(nextLiters) > 0) {
      nextUnits = nextLiters;
      nextLiters = "0";
    }
    const format: EditableRow["saleFormat"] = isKeg
      ? (saleFormat && saleFormat !== "unit" ? saleFormat : beerFormatFromProductName(product?.name ?? label))
      : "unit";
    const reference = findBeerPriceReference(product?.name ?? label, isKeg ? "keg" : "bottle");
    return {
      id,
      productId: product?.id ?? null,
      label,
      liters: nextLiters,
      units: nextUnits,
      purchasePricePerLiter: Number(normalizeNumber(purchasePricePerLiter) ?? 0) > 0
        ? purchasePricePerLiter
        : (product ? defaults.get(product.id) : undefined)
          ?? reference?.purchasePrice
          ?? (product && !isKeg ? product.costPrice ?? undefined : undefined)
          ?? purchasePricePerLiter,
      revenue,
      salePrice: salePrice && Number(salePrice) > 0
        ? salePrice
        : reference?.salePrices[format] ?? product?.sellingPrice ?? salePrice ?? "0",
      saleFormat: format,
    };
  });
}

function defaultsMap(accounting: Accounting) {
  return new Map(accounting.productDefaults.map((entry) => [entry.productId, entry.purchasePricePerLiter]));
}

function signature(draft: AccountingDraft) {
  return JSON.stringify({
    status: draft.status, eventName: draft.eventName, eventDate: draft.eventDate,
    eventStartTime: draft.eventStartTime, eventEndTime: draft.eventEndTime,
    rows: draft.rows.map(({ id, productId, label, liters, units, purchasePricePerLiter, revenue, salePrice, saleFormat }) => ({ id, productId, label, liters, units, purchasePricePerLiter, revenue, salePrice, saleFormat })),
  });
}

function normalizeRows(rows: EditableRow[]) {
  return rows.map((row) => ({
    ...row,
    productId: row.productId as number,
    label: row.label.trim(),
    liters: normalizeNumber(row.liters) as string,
    units: normalizeNumber(row.units) as string,
    purchasePricePerLiter: normalizeNumber(row.purchasePricePerLiter) as string,
    revenue: normalizeNumber(row.revenue) as string,
    salePrice: normalizeNumber(row.salePrice) as string,
    saleFormat: row.saleFormat,
  }));
}

function isValidDraft(draft: AccountingDraft) {
  const productIds = draft.rows.flatMap((row) => row.productId === null ? [] : [row.productId]);
  return draft.eventName.trim() !== ""
    && draft.eventName.trim().length <= 100
    && isValidCalendarDate(draft.eventDate)
    && isValidTime(draft.eventStartTime)
    && isValidTime(draft.eventEndTime)
    && draft.rows.length <= 200
    && draft.rows.every((row) => row.productId !== null
      && row.label.trim() !== ""
      && row.label.trim().length <= 100
      && decimalWithin(row.liters, 3, 100_000)
      && decimalWithin(row.units, 2, 100_000)
      && decimalWithin(row.purchasePricePerLiter, 4, 100_000)
      && decimalWithin(row.salePrice, 2, 100_000)
      && decimalWithin(row.revenue, 2, 9_999_999.99))
    && new Set(productIds).size === draft.rows.length;
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function decimalWithin(value: string, decimals: number, max: number) {
  const normalized = normalizeNumber(value);
  if (normalized === null) return false;
  const fraction = normalized.split(".")[1];
  return (fraction?.length ?? 0) <= decimals && Number(normalized) <= max;
}

function normalizeNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(Number(normalized)) ? normalized : null;
}

/** Quantité comptabilisée : unités si la bouteille en a, sinon litres. */
function quantityOf(row: EditableRow) {
  const units = Number(normalizeNumber(row.units) ?? 0);
  return units > 0 ? units : Number(normalizeNumber(row.liters) ?? 0);
}

function calculateRow(row: EditableRow) {
  const quantity = quantityOf(row);
  const liters = Number(normalizeNumber(row.liters) ?? 0);
  const units = Number(normalizeNumber(row.units) ?? 0);
  const cost = quantity * Number(normalizeNumber(row.purchasePricePerLiter) ?? 0);
  const salePrice = Number(normalizeNumber(row.salePrice) ?? 0);
  const expectedRevenue = row.saleFormat === "unit"
    ? quantity * salePrice
    : (liters / SALE_FORMAT_LITERS[row.saleFormat]) * salePrice;
  const revenue = Number(normalizeNumber(row.revenue) ?? 0);
  return {
    quantity,
    liters,
    units,
    cost,
    salePrice,
    expectedRevenue,
    revenue,
    variance: revenue - expectedRevenue,
    result: revenue - cost,
  };
}

function calculateTotals(rows: EditableRow[]) {
  return rows.reduce((sum, row) => {
    const value = calculateRow(row);
    return {
      liters: sum.liters + value.liters,
      units: sum.units + value.units,
      cost: sum.cost + value.cost,
      expectedRevenue: sum.expectedRevenue + value.expectedRevenue,
      revenue: sum.revenue + value.revenue,
      variance: sum.variance + value.variance,
      result: sum.result + value.result,
    };
  }, { liters: 0, units: 0, cost: 0, expectedRevenue: 0, revenue: 0, variance: 0, result: 0 });
}

function hasPositivePrice(row: EditableRow) {
  return Number(normalizeNumber(row.purchasePricePerLiter) ?? 0) > 0;
}
function hasPositiveSalePrice(row: EditableRow) {
  return Number(normalizeNumber(row.salePrice) ?? 0) > 0;
}
function hasPositiveQuantity(row: EditableRow) {
  return quantityOf(row) > 0;
}
function canClose(rows: EditableRow[]) {
  return rows.length > 0 && rows.every(hasPositivePrice) && rows.every(hasPositiveQuantity);
}

function eventRange(eventDate: string, startTime = DEFAULT_START_TIME, endTime = DEFAULT_END_TIME) {
  const from = new Date(`${eventDate}T${startTime}:00`);
  const to = new Date(`${eventDate}T${endTime}:00`);
  if (to <= from) to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function formatDateFr(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function productFamily(value: string) {
  return normalizeSearch(value).replace(/\b(?:25|33|50|60)\s*c?l\b/g, "").replace(/\b(?:demi|pinte)\b/g, "").replace(/\s+/g, " ").trim();
}
function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").trim();
}
function compareProducts(left: ProductCost, right: ProductCost) {
  return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
}

function createExportFiles(exported: AccountingExport) {
  const stamp = `-${formatDateFr(exported.accounting.eventDate)}`;
  const accountingRows: EditableRow[] = exported.accounting.rows.map(({ id, productId, label, liters, units, purchasePricePerLiter, revenue, salePrice, saleFormat }) => ({
    id,
    productId,
    label,
    liters,
    units: units ?? "0",
    purchasePricePerLiter,
    revenue,
    salePrice: salePrice ?? "0",
    saleFormat: saleFormat ?? "unit",
  }));
  const accountingCsv = createAccountingCsv(
    exported.accounting.eventName,
    exported.accounting.eventDate,
    exported.accounting.eventStartTime,
    exported.accounting.eventEndTime,
    accountingRows,
    calculateTotals(accountingRows),
  );
  const salesCsv = tableCsv(
    ["Transaction", "Date", "Membre", "Produit", "Catégorie", "Quantité", "Montant débité", "Statut"],
    exported.sales.map((sale) => [sale.orderId, formatCsvDate(sale.date), memberName(sale), sale.productName, sale.category, sale.amount, csvNumber(Math.abs(Number(sale.price)), 2), sale.status === "replacement" ? "Vente de remplacement" : "Vente"]),
  );
  const rechargesCsv = tableCsv(
    ["Transaction", "Date", "Membre", "Montant", "Paiement reçu"],
    exported.recharges.map((recharge) => [recharge.orderId, formatCsvDate(recharge.date), memberName(recharge), csvNumber(Number(recharge.amount), 2), paymentMethodLabel(recharge.paymentMethod)]),
  );
  const correctionsCsv = tableCsv(
    ["Transaction d’origine", "Date correction", "Statut", "Produit initial", "Quantité initiale", "Produit corrigé", "Quantité corrigée", "Remboursé", "Redébité", "Variation solde", "Raison", "Administrateur"],
    exported.corrections.map((correction) => [
      correction.originalOrderId, formatCsvDate(correction.completedAt ?? correction.createdAt), correction.status === "completed" ? "Terminée" : "À vérifier",
      correction.originalProductName ?? correction.originalProductId ?? "",
      correction.originalAmount ?? "",
      correction.replacementProductName ?? (correction.replacementProductId === null ? "Annulation" : correction.replacementProductId),
      correction.replacementAmount,
      correction.refunded ?? "", correction.charged ?? "", correction.balanceChange ?? "", correction.reason, correction.adminMemberId,
    ]),
  );
  return [
    csvFile(`compta${stamp}.csv`, accountingCsv),
    csvFile(`ventes${stamp}.csv`, salesCsv),
    csvFile(`rechargements${stamp}.csv`, rechargesCsv),
    csvFile(`corrections${stamp}.csv`, correctionsCsv),
    { name: `sauvegarde-marco${stamp}.json`, blob: new Blob([JSON.stringify(exported, null, 2), "\n"], { type: "application/json;charset=utf-8" }) },
  ];
}

function createAccountingCsv(
  eventName: string,
  eventDate: string,
  eventStartTime: string,
  eventEndTime: string,
  rows: EditableRow[],
  totals: ReturnType<typeof calculateTotals>,
) {
  const lines: Array<Array<string | number>> = [
    ["Événement", eventName], ["Date", formatDateFr(eventDate)], ["Période", `${eventStartTime} – ${eventEndTime}`], [],
    ["Produit", "Format", "Quantité", "Unité", "Prix d’achat", "Coût total", "Prix de vente", "CA attendu", "Recettes réelles", "Écart", "Résultat"],
    ...rows.map((row) => {
      const value = calculateRow(row);
      const isUnit = row.saleFormat === "unit";
      return [
        row.label,
        formatSaleFormat(row.saleFormat),
        csvNumber(value.quantity, isUnit ? 2 : 3),
        isUnit ? "unité" : "litre",
        csvNumber(Number(row.purchasePricePerLiter.replace(",", ".")), 4),
        csvNumber(value.cost, 2),
        csvNumber(value.salePrice, 2),
        csvNumber(value.expectedRevenue, 2),
        csvNumber(value.revenue, 2),
        csvNumber(value.variance, 2),
        csvNumber(value.result, 2),
      ];
    }),
    ["TOTAL", "", "", `${formatLiters(totals.liters)} + ${formatUnits(totals.units)}`, "", csvNumber(totals.cost, 2), "", csvNumber(totals.expectedRevenue, 2), csvNumber(totals.revenue, 2), csvNumber(totals.variance, 2), csvNumber(totals.result, 2)],
  ];
  return lines.map((line) => line.map((cell) => csvCell(String(cell))).join(";")).join("\r\n");
}

function tableCsv(headers: string[], rows: Array<Array<string | number>>) {
  return [headers, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(";")).join("\r\n");
}
function csvFile(name: string, content: string) {
  return { name, blob: new Blob(["\ufeff", content], { type: "text/csv;charset=utf-8" }) };
}
function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
function paymentMethodLabel(method: "card" | "cash" | null) {
  if (method === "card") return "Carte bancaire";
  if (method === "cash") return "Espèces";
  return "Pas rechargé sur cette Marco";
}
function memberName(member: { memberFirstName: string | null; memberLastName: string | null; memberId: number | null }) {
  const name = [member.memberFirstName, member.memberLastName].filter(Boolean).join(" ");
  return name || (member.memberId === null ? "Membre inconnu" : `Membre ${member.memberId}`);
}
function formatCsvDate(value: string) {
  return new Date(value).toLocaleString("fr-FR");
}
function csvCell(value: string) {
  const protectedValue = /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}
function csvNumber(value: number, decimals: number) {
  return value.toFixed(decimals).replace(".", ",");
}
function decimal(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}
function formatMoney(value: number) {
  return `${value.toFixed(2)} €`;
}
function formatLiters(value: number) {
  return `${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} L`;
}
function formatUnits(value: number) {
  return `${value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")} unité${value > 1 ? "s" : ""}`;
}
function formatSaleFormat(format: EditableRow["saleFormat"]) {
  return format === "unit" ? "unité" : `${format.replace("cl", "")} cl`;
}
