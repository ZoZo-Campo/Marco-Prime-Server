import type { ComponentChildren } from "preact";
import {
  BarChart3,
  Calculator,
  Check,
  Loader2,
  Package,
  Power,
  RefreshCw,
  Save,
  Search,
  Server,
  ShieldAlert,
  ShoppingBasket,
  UsersRound,
  X,
} from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { apiHeaders, apiUrl, ENV_EDITABLE } from "../config/api";
import { MemberProvider, useMember } from "../contexts/member-context";
import { useApi } from "../hooks/use-api";
import {
  catalogSelectionSchema,
  type CatalogSelectionProduct,
} from "../schemas/product.schema";
import { cn } from "../utils/cn";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { StatisticsPanel } from "../components/features/config/statistics-panel";
import { AccountingPanel } from "../components/features/config/accounting-panel";
import { MembersPanel } from "../components/features/config/members-panel";
import { FouailleProductsPanel } from "../components/features/config/fouaille-products-panel";
import { SetupPanel } from "../components/features/config/setup-panel";
import { AdminAuthPanel } from "../components/features/auth/admin-auth-panel";
import { isAdminAccessGranted } from "../utils/admin-access";
import {
  configPasswordConfigured,
  refreshConfigAuthStatus,
} from "../utils/config-auth-status";

export const CONFIG_ROUTE_URL = "/config";

type SaveState = "idle" | "saving" | "saved" | "error";
type AdminSection = "catalog" | "statistics" | "accounting" | "members" | "fouaille-products" | "setup";
const KIOSK_CONTROL_URL = "http://127.0.0.1:3210";

export function ConfigPage() {
  return (
    <MemberProvider>
      <ConfigContent />
    </MemberProvider>
  );
}

function ConfigContent() {
  const { data: member, pause } = useMember();
  // En mode serveur uniquement, une carte admin ne suffit pas si un mot de
  // passe existe : il faut une session signée pour cette carte. En local ou
  // sur tablette, le parcours carte historique reste inchangé.
  const isAdmin =
    member?.admin === true && isAdminAccessGranted(member.cardNumber);

  useEffect(() => {
    if (configPasswordConfigured.value === null) {
      void refreshConfigAuthStatus();
    }
  }, []);

  useEffect(() => {
    if (isAdmin) pause();
  }, [isAdmin]);
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    refetch,
  } = useApi(catalogSelectionSchema, apiUrl("catalog-selection"), {
    immediate: isAdmin,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [catalogQuery, setCatalogQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [editingPrice, setEditingPrice] = useState<CatalogSelectionProduct | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  const [priceSaving, setPriceSaving] = useState(false);
  const [section, setSection] = useState<AdminSection>("catalog");
  const [kioskControlAvailable, setKioskControlAvailable] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [closingKiosk, setClosingKiosk] = useState(false);
  const [kioskExitError, setKioskExitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setKioskControlAvailable(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1_500);
    fetch(`${KIOSK_CONTROL_URL}/status`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => setKioskControlAvailable(response.ok))
      .catch(() => setKioskControlAvailable(false))
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!catalog) return;
    setSelectedIds(
      new Set(
        catalog
          .filter((product) => product.enabledOnMarco)
          .map((product) => product.id),
      ),
    );
    setDirty(false);
  }, [catalog]);

  const categories = useMemo(() => groupByCategory(catalog ?? []), [catalog]);
  const filteredCategories = useMemo(() => {
    const needle = catalogQuery.trim().toLocaleLowerCase("fr");
    if (!needle) return categories;
    return categories.map((category) => ({
      ...category,
      products: category.products.filter((product) =>
        `${product.name} ${product.title}`.toLocaleLowerCase("fr").includes(needle)),
    })).filter((category) => category.products.length > 0);
  }, [categories, catalogQuery]);

  if (!isAdmin) {
    return (
      <div class="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-3">
        <div class="w-full max-w-lg">
          <AdminAuthPanel allowPassword />
        </div>
      </div>
    );
  }

  const toggleProduct = (productId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
    setDirty(true);
    setSaveState("idle");
  };

  const selectAll = () => {
    if (catalogQuery.trim()) {
      setSelectedIds((current) => new Set([
        ...current,
        ...filteredCategories.flatMap((category) => category.products.map((product) => product.id)),
      ]));
    } else {
      setSelectedIds(new Set((catalog ?? []).map((product) => product.id)));
    }
    setDirty(true);
    setSaveState("idle");
  };

  const clearSelection = () => {
    if (catalogQuery.trim()) {
      const visibleIds = new Set(filteredCategories.flatMap((category) => category.products.map((product) => product.id)));
      setSelectedIds((current) => new Set([...current].filter((id) => !visibleIds.has(id))));
    } else {
      setSelectedIds(new Set());
    }
    setDirty(true);
    setSaveState("idle");
  };

  const saveSelection = async () => {
    setSaveState("saving");

    try {
      const response = await fetch(apiUrl("catalog-selection"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          productIds: [...selectedIds],
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await refetch();
      setSaveState("saved");
      setDirty(false);
    } catch (error) {
      console.error("Erreur de configuration du catalogue:", error);
      setSaveState("error");
    }
  };

  const openPriceEditor = (product: CatalogSelectionProduct) => {
    if (dirty) {
      setPriceError("Enregistrez d’abord votre sélection de produits avant de modifier un prix.");
      return;
    }
    setEditingPrice(product);
    setPriceDraft(product.price);
    setPriceError(null);
    setPriceNotice(null);
  };

  const savePrice = async () => {
    if (!editingPrice || priceSaving) return;
    const normalized = priceDraft.trim().replace(",", ".");
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
      setPriceError("Saisissez un prix positif avec deux décimales au maximum.");
      return;
    }
    const nextPrice = Number(normalized).toFixed(2);
    if (nextPrice === Number(editingPrice.price).toFixed(2)) {
      setEditingPrice(null);
      return;
    }
    if (!window.confirm(`Changer le prix Fouaille de « ${editingPrice.name} » : ${editingPrice.price} € → ${nextPrice} € ? Ce prix s’appliquera aux prochains achats sur toutes les caisses.`)) return;
    setPriceSaving(true);
    setPriceError(null);
    try {
      const response = await fetch(apiUrl("admin/products/price"), {
        method: "PUT",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adminCardNumber: member.cardNumber,
          productId: editingPrice.id,
          expectedPrice: editingPrice.price,
          price: nextPrice,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || `Modification refusée (${response.status})`);
      }
      await refetch();
      setEditingPrice(null);
      setPriceNotice(`Prix de ${editingPrice.name} modifié : ${nextPrice} €.`);
    } catch (error) {
      setPriceError(error instanceof Error ? error.message : "Impossible de modifier le prix.");
    } finally {
      setPriceSaving(false);
    }
  };

  const closeKiosk = async () => {
    setClosingKiosk(true);
    setKioskExitError(null);
    try {
      const response = await fetch(`${KIOSK_CONTROL_URL}/exit`, {
        method: "POST",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      setClosingKiosk(false);
      setKioskExitError(
        "Impossible de fermer automatiquement. Utilisez Alt+F4.",
      );
    }
  };

  const adminNavigation = (
    <>
      <nav class="flex shrink-0 items-center gap-2 overflow-x-auto border-b bg-card px-3 py-3 sm:gap-3 sm:px-5 lg:px-7">
        <Button
          variant={section === "catalog" ? "default" : "outline"}
          onClick={() => setSection("catalog")}
        >
          <ShoppingBasket class="size-5" /> Catalogue
        </Button>
        <Button variant={section === "fouaille-products" ? "default" : "outline"} onClick={() => setSection("fouaille-products")}>
          <Package class="size-5" /> Produits Fouaille
        </Button>
        <Button
          variant={section === "statistics" ? "default" : "outline"}
          onClick={() => setSection("statistics")}
        >
          <BarChart3 class="size-5" /> Statistiques
        </Button>
        <Button
          variant={section === "accounting" ? "default" : "outline"}
          onClick={() => setSection("accounting")}
        >
          <Calculator class="size-5" /> Compta
        </Button>
        <Button variant={section === "members" ? "default" : "outline"} onClick={() => setSection("members")}>
          <UsersRound class="size-5" /> Membres
        </Button>
        <span class="ml-auto" />
        {ENV_EDITABLE && (
          <Button
            class="shrink-0"
            variant="ghost"
            size="sm"
            title="Installation et configuration"
            onClick={() => setSection("setup")}
          >
            <Server class="size-5" /> Installation
          </Button>
        )}
        <Button
          class="shrink-0"
          variant="outline"
          size="icon"
          title="Recharger l’application"
          aria-label="Recharger l’application"
          onClick={() => window.location.reload()}
        >
          <RefreshCw class="size-5" />
        </Button>
        {kioskControlAvailable && (
          <Button
            class="shrink-0"
            variant="destructive"
            size="icon"
            title="Fermer Marco"
            aria-label="Fermer Marco"
            onClick={() => {
              setKioskExitError(null);
              setShowExitDialog(true);
            }}
          >
            <Power class="size-5" />
          </Button>
        )}
      </nav>

      {showExitDialog && (
        <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4">
          <Card
            class="w-full max-w-lg p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-marco-title"
          >
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 id="close-marco-title" class="text-2xl font-bold">
                  Fermer l’écran Marco ?
                </h2>
                <p class="mt-2 text-muted-foreground">
                  Le navigateur sera fermé et le Bureau réapparaîtra. Le serveur
                  Marco continuera de fonctionner.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Annuler"
                disabled={closingKiosk}
                onClick={() => setShowExitDialog(false)}
              >
                <X />
              </Button>
            </div>
            {kioskExitError && (
              <p class="mt-4 text-destructive">{kioskExitError}</p>
            )}
            <div class="mt-6 flex justify-end gap-3">
              <Button
                variant="outline"
                disabled={closingKiosk}
                onClick={() => setShowExitDialog(false)}
              >
                Rester sur Marco
              </Button>
              <Button
                variant="destructive"
                disabled={closingKiosk}
                onClick={() => void closeKiosk()}
              >
                {closingKiosk ? (
                  <Loader2 class="animate-spin" />
                ) : (
                  <Power />
                )}
                Fermer et revenir au Bureau
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );

  if (section === "statistics") {
    return (
      <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
        {adminNavigation}
        <StatisticsPanel adminCardNumber={member.cardNumber} />
      </div>
    );
  }

  if (section === "members") {
    return <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
      {adminNavigation}
      <MembersPanel adminCardNumber={member.cardNumber} />
    </div>;
  }

  if (section === "fouaille-products") {
    return <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
      {adminNavigation}
      <FouailleProductsPanel adminCardNumber={member.cardNumber} onChanged={() => void refetch()} />
    </div>;
  }

  if (section === "accounting") {
    return (
      <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
        {adminNavigation}
        <AccountingPanel adminCardNumber={member.cardNumber} />
      </div>
    );
  }

  if (section === "setup") {
    return (
      <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
        {adminNavigation}
        <SetupPanel member={member} />
      </div>
    );
  }

  return (
    <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
      {adminNavigation}
      <header class="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-4 sm:gap-5 sm:px-7">
        <div>
          <h1 class="text-2xl font-bold">Produits vendus ce soir</h1>
          <p class="text-sm text-muted-foreground">
            {selectedIds.size} produit{selectedIds.size > 1 ? "s" : ""}{" "}
            sélectionné{selectedIds.size > 1 ? "s" : ""} · {member.firstName}{" "}
            {member.lastName}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {catalogQuery.trim() ? "Cocher les résultats" : "Tout cocher"}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            {catalogQuery.trim() ? "Décocher les résultats" : "Tout décocher"}
          </Button>
          <Button
            onClick={saveSelection}
            disabled={!dirty || saveState === "saving"}
          >
            {saveState === "saving" ? (
              <Loader2 class="size-5 animate-spin" />
            ) : (
              <Save class="size-5" />
            )}
            Enregistrer
          </Button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto px-4 py-5 sm:px-7">
        <div class="mb-5 flex items-center gap-3 rounded border bg-background px-3">
          <Search class="size-5 text-muted-foreground" />
          <input class="min-h-12 min-w-0 flex-1 bg-transparent text-lg outline-none" value={catalogQuery}
            placeholder="Chercher un produit à vendre ce soir" onInput={(event) => setCatalogQuery(event.currentTarget.value)} />
        </div>
        {catalogLoading && (
          <div class="flex h-full items-center justify-center">
            <Loader2 class="size-12 animate-spin text-primary" />
          </div>
        )}

        {catalogError && (
          <CenteredCard>
            <ShieldAlert class="size-12 text-destructive" />
            <h2 class="text-xl font-semibold">Catalogue Fouaille indisponible</h2>
            <Button onClick={refetch}>Réessayer</Button>
          </CenteredCard>
        )}

        {!catalogLoading && !catalogError && catalog?.length === 0 && (
          <CenteredCard>
            <h2 class="text-xl font-semibold">Aucun produit disponible</h2>
            <p class="text-muted-foreground">
              Vérifiez la synchronisation avec Fouaille Manager.
            </p>
          </CenteredCard>
        )}

        {!catalogLoading && !catalogError && catalogQuery.trim() && filteredCategories.length === 0 && (
          <p class="py-8 text-center text-muted-foreground">Aucun produit ne correspond à cette recherche.</p>
        )}

        <div class="flex flex-col gap-7">
          {filteredCategories.map((category) => (
            <section key={category.id}>
              <h2 class="mb-3 text-lg font-semibold">{category.name}</h2>
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {category.products.map((product) => {
                  const selected = selectedIds.has(product.id);
                  return (
                    <div
                      key={product.id}
                      class={cn(
                        "relative min-h-28 border bg-card text-left transition-all hover:bg-accent",
                        selected &&
                          "border-primary bg-primary/10 ring-2 ring-primary/40",
                      )}
                    >
                      <button type="button" aria-pressed={selected} onClick={() => toggleProduct(product.id)} class="block w-full p-4 pb-1 text-left">
                        {selected && (
                          <span class="absolute right-3 top-3 rounded-full bg-primary p-1 text-primary-foreground">
                            <Check class="size-4" />
                          </span>
                        )}
                        <p class="pr-8 text-lg font-semibold">{product.name}</p>
                        <p class="mt-1 text-sm text-muted-foreground">{product.title}</p>
                        <p class="mt-3 font-medium">{product.price} €</p>
                      </button>
                      <button type="button" class="mx-4 mb-3 min-h-10 text-sm font-medium text-primary underline underline-offset-4" onClick={() => openPriceEditor(product)}>
                        Modifier le prix
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {saveState === "saved" && (
        <div class="border-t border-green-500/30 bg-green-500/10 px-4 py-2 text-center text-green-400 sm:px-7">
          Sélection enregistrée. L'écran Achats est déjà à jour.
        </div>
      )}
      {saveState === "error" && (
        <div class="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-center text-destructive sm:px-7">
          Impossible d'enregistrer la sélection. Réessayez.
        </div>
      )}
      {priceError && !editingPrice && <p role="alert" class="border-t border-destructive/30 px-7 py-2 text-center text-destructive">{priceError}</p>}
      {priceNotice && <p role="status" class="border-t border-green-500/30 px-7 py-2 text-center text-green-400">{priceNotice}</p>}
      {editingPrice && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="price-dialog-title" class="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-2xl">
            <h2 id="price-dialog-title" class="text-2xl font-bold">Prix de {editingPrice.name}</h2>
            <p class="text-muted-foreground">Prix actuel dans Fouaille : {editingPrice.price} €</p>
            <label class="block space-y-2">Nouveau prix (€)
              <input inputMode="decimal" class="min-h-14 w-full rounded border bg-background px-3 text-2xl" value={priceDraft} onInput={(event) => setPriceDraft(event.currentTarget.value)} />
            </label>
            <div class="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((key) => (
                <Button key={key} type="button" variant="outline" class="min-h-12 text-xl" onClick={() => setPriceDraft((current) => key === "⌫" ? current.slice(0, -1) : current + key)}>{key}</Button>
              ))}
            </div>
            <Button type="button" variant="outline" class="w-full" onClick={() => setPriceDraft("")}>Effacer le montant saisi</Button>
            {priceError && <p role="alert" class="text-destructive">{priceError}</p>}
            <p class="text-sm text-muted-foreground">Le nouveau tarif sera utilisé pour les prochains paiements sur toutes les Marco. Les ventes passées ne changent pas.</p>
            <div class="flex gap-3">
              <Button variant="outline" class="flex-1" disabled={priceSaving} onClick={() => { setEditingPrice(null); setPriceError(null); }}>Annuler</Button>
              <Button class="flex-1" disabled={priceSaving} onClick={() => void savePrice()}>{priceSaving ? "Enregistrement…" : "Enregistrer le prix"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CenteredCard({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex flex-1 items-center justify-center p-7">
      <Card class="items-center px-10 py-10">{children}</Card>
    </div>
  );
}

function groupByCategory(products: CatalogSelectionProduct[]) {
  const categories = new Map<
    number,
    { id: number; name: string; products: CatalogSelectionProduct[] }
  >();

  for (const product of products) {
    const category = categories.get(product.productTypeId) ?? {
      id: product.productTypeId,
      name: product.productType,
      products: [],
    };
    category.products.push(product);
    categories.set(product.productTypeId, category);
  }

  return [...categories.values()];
}
