import {
  AlertCircle,
  BarChart3,
  CircleDollarSign,
  Loader2,
  PackageOpen,
  RefreshCw,
  Save,
  Tags,
  Users,
  WalletCards,
} from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  productCostListSchema,
  statisticsResponseSchema,
  type ProductCost,
  type StatisticsResponse,
} from "../../../schemas/statistics.schema";
import { cn } from "../../../utils/cn";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

type Period = "evening" | "today" | "week" | "custom";
type View = "results" | "costs";
type SaveState = "idle" | "saving" | "saved" | "error";
type RefreshSeconds = 0 | 5 | 15 | 30 | 60 | 300;

const REFRESH_STORAGE_KEY = "marco-statistics-refresh-seconds";

interface StatisticsPanelProps {
  adminCardNumber: number;
}

export function StatisticsPanel({ adminCardNumber }: StatisticsPanelProps) {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [period, setPeriod] = useState<Period>("evening");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [view, setView] = useState<View>("results");
  const [refreshSeconds, setRefreshSeconds] = useState<RefreshSeconds>(
    getStoredRefreshSeconds,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [statisticsError, setStatisticsError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductCost[]>([]);
  const [costInputs, setCostInputs] = useState<Record<number, string>>({});
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const range = useMemo(
    () => getRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  useEffect(() => {
    if (!range) {
      setStatisticsError("Choisissez une période valide.");
      setStatisticsLoading(false);
      return;
    }

    const controller = new AbortController();
    let fetching = false;

    const load = async (showLoader: boolean) => {
      if (fetching) return;
      fetching = true;
      if (showLoader) setStatisticsLoading(true);
      try {
        const response = await fetch(apiUrl("statistics"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            adminCardNumber,
            from: range.from.toISOString(),
            to: range.to.toISOString(),
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatistics(statisticsResponseSchema.parse(await response.json()));
        setStatisticsError(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setStatisticsError("Impossible de charger les statistiques.");
      } finally {
        fetching = false;
        setStatisticsLoading(false);
      }
    };

    void load(true);
    const interval =
      refreshSeconds > 0
        ? window.setInterval(() => void load(false), refreshSeconds * 1000)
        : null;
    return () => {
      controller.abort();
      if (interval !== null) window.clearInterval(interval);
    };
  }, [
    adminCardNumber,
    range?.from.getTime(),
    range?.to.getTime(),
    refreshKey,
    refreshSeconds,
  ]);

  useEffect(() => {
    window.localStorage.setItem(
      REFRESH_STORAGE_KEY,
      refreshSeconds.toString(),
    );
  }, [refreshSeconds]);

  useEffect(() => {
    const controller = new AbortController();

    const loadCosts = async () => {
      setCostsLoading(true);
      try {
        const response = await fetch(apiUrl("statistics/costs"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ adminCardNumber }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const loadedProducts = productCostListSchema.parse(await response.json());
        setProducts(loadedProducts);
        setCostInputs(
          Object.fromEntries(
            loadedProducts.map((product) => [
              product.id,
              product.costPrice ?? "",
            ]),
          ),
        );
        setCostsError(null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setCostsError("Impossible de charger les prix d’achat.");
      } finally {
        setCostsLoading(false);
      }
    };

    void loadCosts();
    return () => controller.abort();
  }, [adminCardNumber]);

  const saveCosts = async () => {
    const costs: Array<{ productId: number; costPrice: string }> = [];
    for (const product of products) {
      const value = (costInputs[product.id] ?? "").trim().replace(",", ".");
      if (value === "") continue;
      if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
        setSaveState("error");
        setCostsError(`Prix invalide pour ${product.name}.`);
        return;
      }
      costs.push({ productId: product.id, costPrice: Number(value).toFixed(2) });
    }

    setSaveState("saving");
    setCostsError(null);
    try {
      const response = await fetch(apiUrl("statistics/costs"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber, costs }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCostInputs((current) =>
        Object.fromEntries(
          products.map((product) => {
            const value = (current[product.id] ?? "").trim().replace(",", ".");
            return [product.id, value === "" ? "" : Number(value).toFixed(2)];
          }),
        ),
      );
      setSaveState("saved");
      setRefreshKey((current) => current + 1);
    } catch (error) {
      console.error("Erreur d’enregistrement des prix d’achat:", error);
      setSaveState("error");
      setCostsError("Impossible d’enregistrer les prix d’achat.");
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 border-b bg-card px-7 py-3">
        <Button
          variant={view === "results" ? "default" : "outline"}
          onClick={() => setView("results")}
        >
          <BarChart3 class="size-5" /> Résultats
        </Button>
        <Button
          variant={view === "costs" ? "default" : "outline"}
          onClick={() => setView("costs")}
        >
          <Tags class="size-5" /> Prix d’achat
        </Button>
      </div>

      {view === "results" ? (
        <ResultsView
          period={period}
          setPeriod={setPeriod}
          customFrom={customFrom}
          customTo={customTo}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
          statistics={statistics}
          loading={statisticsLoading}
          error={statisticsError}
          refreshSeconds={refreshSeconds}
          setRefreshSeconds={setRefreshSeconds}
          onRefresh={() => setRefreshKey((current) => current + 1)}
        />
      ) : (
        <CostsView
          products={products}
          values={costInputs}
          onValueChange={(productId, value) => {
            setCostInputs((current) => ({ ...current, [productId]: value }));
            setSaveState("idle");
            setCostsError(null);
          }}
          loading={costsLoading}
          error={costsError}
          saveState={saveState}
          onSave={() => void saveCosts()}
        />
      )}
    </div>
  );
}

interface ResultsViewProps {
  period: Period;
  setPeriod: (period: Period) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  statistics: StatisticsResponse | null;
  loading: boolean;
  error: string | null;
  refreshSeconds: RefreshSeconds;
  setRefreshSeconds: (seconds: RefreshSeconds) => void;
  onRefresh: () => void;
}

function ResultsView(props: ResultsViewProps) {
  const { statistics } = props;

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-7 py-5">
      <div class="mb-5 flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <label class="flex min-w-64 flex-col gap-1 text-sm font-medium">
          <span>Période</span>
          <select
            class="h-12 rounded-lg border bg-background px-4 text-lg font-semibold outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            value={props.period}
            onChange={(event) =>
              props.setPeriod(event.currentTarget.value as Period)
            }
          >
            <option value="evening">Soirée · 17h–23h59</option>
            <option value="today">Aujourd’hui · minuit–minuit</option>
            <option value="week">Semaine · lundi–dimanche</option>
            <option value="custom">Dates personnalisées</option>
          </select>
        </label>
        <label class="flex min-w-56 flex-col gap-1 text-sm font-medium">
          <span>Actualisation</span>
          <select
            class="h-12 rounded-lg border bg-background px-4 text-lg outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            value={props.refreshSeconds}
            onChange={(event) =>
              props.setRefreshSeconds(
                Number(event.currentTarget.value) as RefreshSeconds,
              )
            }
          >
            <option value={0}>En pause</option>
            <option value={5}>Toutes les 5 secondes</option>
            <option value={15}>Toutes les 15 secondes</option>
            <option value={30}>Toutes les 30 secondes</option>
            <option value={60}>Toutes les minutes</option>
            <option value={300}>Toutes les 5 minutes</option>
          </select>
        </label>
        <Button
          class="ml-auto"
          variant="outline"
          onClick={props.onRefresh}
          disabled={props.loading}
        >
          <RefreshCw class={cn("size-5", props.loading && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {props.period === "custom" && (
        <div class="mb-5 flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
          <DateField label="Du" value={props.customFrom} onInput={props.setCustomFrom} />
          <DateField label="Au (inclus)" value={props.customTo} onInput={props.setCustomTo} />
        </div>
      )}

      {props.error && (
        <div class="mb-5 flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          <AlertCircle class="size-6" /> {props.error}
        </div>
      )}

      {props.loading && !statistics ? (
        <div class="flex min-h-80 items-center justify-center">
          <Loader2 class="size-12 animate-spin text-primary" />
        </div>
      ) : statistics ? (
        <>
          <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <MetricCard icon={CircleDollarSign} label="Recettes des ventes" value={`${statistics.summary.revenue}€`} />
            <MetricCard icon={WalletCards} label="Coût d’achat" value={`${statistics.summary.cost}€`} />
            <MetricCard
              icon={BarChart3}
              label="Bénéfice estimé"
              value={`${statistics.summary.profit}€`}
              accent={Number(statistics.summary.profit) >= 0 ? "positive" : "negative"}
            />
            <MetricCard icon={PackageOpen} label="Produits vendus" value={statistics.summary.unitsSold.toString()} />
          </div>

          <div class="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <SmallMetric icon={Users} label="Clients différents" value={statistics.summary.uniqueMembers} />
            <SmallMetric label="Lignes de vente" value={statistics.summary.salesLines} />
            <SmallMetric label="Rechargements" value={statistics.summary.rechargeCount} />
            <SmallMetric label="Crédits rechargés" value={`${statistics.summary.rechargeAmount}€`} />
          </div>

          {statistics.summary.unconfiguredProductCount > 0 && (
            <div class="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-500">
              Bénéfice incomplet : {statistics.summary.unconfiguredProductCount} produit
              {statistics.summary.unconfiguredProductCount > 1 ? "s vendus n’ont" : " vendu n’a"} pas encore de prix d’achat.
            </div>
          )}

          <Card class="mt-5 gap-0 overflow-hidden py-0">
            <div class="grid grid-cols-[minmax(180px,1fr)_100px_130px_130px_130px] gap-3 border-b bg-muted/40 px-4 py-3 font-semibold">
              <span>Produit</span><span class="text-right">Quantité</span><span class="text-right">Recette</span><span class="text-right">Coût</span><span class="text-right">Bénéfice</span>
            </div>
            {statistics.products.length === 0 ? (
              <p class="p-8 text-center text-muted-foreground">Aucune vente sur cette période.</p>
            ) : statistics.products.map((product) => (
              <div key={product.productId} class="grid grid-cols-[minmax(180px,1fr)_100px_130px_130px_130px] items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div class="min-w-0"><p class="truncate font-semibold">{product.name}</p><p class="text-sm text-muted-foreground">{product.category}</p></div>
                <span class="text-right text-lg font-semibold">{product.quantity}</span>
                <span class="text-right">{product.revenue}€</span>
                <span class={cn("text-right", !product.costConfigured && "text-amber-500")}>{product.costConfigured ? `${product.cost}€` : "À saisir"}</span>
                <span class="text-right font-semibold">{product.profit}€</span>
              </div>
            ))}
          </Card>

          <p class="mt-3 text-right text-xs text-muted-foreground">
            Dernière mise à jour : {new Date(statistics.generatedAt).toLocaleTimeString("fr-FR")}
          </p>
        </>
      ) : null}
    </div>
  );
}

interface CostsViewProps {
  products: ProductCost[];
  values: Record<number, string>;
  onValueChange: (productId: number, value: string) => void;
  loading: boolean;
  error: string | null;
  saveState: SaveState;
  onSave: () => void;
}

function CostsView(props: CostsViewProps) {
  return (
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex items-center justify-between gap-4 border-b px-7 py-4">
        <div>
          <h2 class="text-xl font-bold">Prix d’achat unitaires</h2>
          <p class="text-sm text-muted-foreground">Enregistrés uniquement sur cette Marco, jamais dans Fouaille Manager.</p>
        </div>
        <Button onClick={props.onSave} disabled={props.loading || props.saveState === "saving"}>
          {props.saveState === "saving" ? <Loader2 class="size-5 animate-spin" /> : <Save class="size-5" />}
          Enregistrer les prix
        </Button>
      </div>

      {props.error && <div class="border-b border-destructive/30 bg-destructive/10 px-7 py-3 text-center text-destructive">{props.error}</div>}
      {props.saveState === "saved" && <div class="border-b border-green-500/30 bg-green-500/10 px-7 py-3 text-center text-green-500">Prix d’achat enregistrés. Les bénéfices ont été recalculés.</div>}

      <div class="min-h-0 flex-1 overflow-y-auto px-7 py-5">
        {props.loading ? (
          <div class="flex h-full items-center justify-center"><Loader2 class="size-12 animate-spin text-primary" /></div>
        ) : (
          <Card class="gap-0 overflow-hidden py-0">
            <div class="grid grid-cols-[minmax(220px,1fr)_150px_190px] gap-4 border-b bg-muted/40 px-5 py-3 font-semibold">
              <span>Produit</span><span class="text-right">Prix de vente</span><span class="text-right">Prix d’achat</span>
            </div>
            {props.products.map((product) => (
              <label key={product.id} class="grid grid-cols-[minmax(220px,1fr)_150px_190px] items-center gap-4 border-b px-5 py-3 last:border-b-0">
                <span class="min-w-0"><span class="block truncate font-semibold">{product.name}</span><span class="text-sm text-muted-foreground">{product.category}{!product.available ? " · indisponible" : ""}</span></span>
                <span class="text-right">{product.sellingPrice}€</span>
                <span class="flex items-center justify-end gap-2">
                  <input
                    class="h-12 w-32 rounded-lg border bg-background px-3 text-right text-lg outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    type="text"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={props.values[product.id] ?? ""}
                    onInput={(event) =>
                      props.onValueChange(product.id, event.currentTarget.value)
                    }
                    aria-label={`Prix d’achat de ${product.name}`}
                  />
                  €
                </span>
              </label>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, accent }: { icon: typeof BarChart3; label: string; value: string; accent?: "positive" | "negative" }) {
  return (
    <Card class="gap-3 p-5 py-5">
      <div class="flex items-center gap-2 text-muted-foreground"><Icon class="size-5" /><span>{label}</span></div>
      <strong class={cn("text-3xl", accent === "positive" && "text-green-500", accent === "negative" && "text-destructive")}>{value}</strong>
    </Card>
  );
}

function SmallMetric({ icon: Icon, label, value }: { icon?: typeof Users; label: string; value: string | number }) {
  return <div class="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">{Icon && <Icon class="size-5 text-muted-foreground" />}<span class="text-muted-foreground">{label}</span><strong class="ml-auto text-lg">{value}</strong></div>;
}

function DateField({ label, value, onInput }: { label: string; value: string; onInput: (value: string) => void }) {
  return <label class="flex flex-col gap-1 text-sm font-medium"><span>{label}</span><input class="h-12 rounded-lg border bg-background px-4 text-lg" type="date" value={value} onInput={(event) => onInput(event.currentTarget.value)} /></label>;
}

function getRange(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);

  if (period === "evening") {
    start.setHours(17, 0, 0, 0);
    end.setDate(end.getDate() + 1);
  } else if (period === "today") {
    end.setDate(end.getDate() + 1);
  } else if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo)) return null;
    const customStart = new Date(`${customFrom}T00:00:00`);
    const customEnd = new Date(`${customTo}T00:00:00`);
    customEnd.setDate(customEnd.getDate() + 1);
    if (customEnd <= customStart) return null;
    return { from: customStart, to: customEnd };
  }

  return { from: start, to: end };
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStoredRefreshSeconds(): RefreshSeconds {
  const savedValue = window.localStorage.getItem(REFRESH_STORAGE_KEY);
  if (savedValue === null) return 15;
  const stored = Number(savedValue);
  return stored === 0 ||
    stored === 5 ||
    stored === 15 ||
    stored === 30 ||
    stored === 60 ||
    stored === 300
    ? stored
    : 15;
}
