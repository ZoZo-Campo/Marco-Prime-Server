import type { ComponentChildren } from "preact";
import {
  AlertCircle,
  BarChart3,
  Check,
  CreditCard,
  Loader2,
  Save,
  ShieldAlert,
  ShoppingBasket,
} from "lucide-preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../config/api";
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

export const CONFIG_ROUTE_URL = "/config";

type SaveState = "idle" | "saving" | "saved" | "error";
type AdminSection = "catalog" | "statistics";

export function ConfigPage() {
  return (
    <MemberProvider>
      <ConfigContent />
    </MemberProvider>
  );
}

function ConfigContent() {
  const {
    data: member,
    loading: memberLoading,
    error: memberError,
    inputLength,
    retry,
    clear,
  } = useMember();
  const isAdmin = member?.admin === true;
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    refetch,
  } = useApi(catalogSelectionSchema, apiUrl("catalog-selection"), {
    immediate: isAdmin,
  });
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [section, setSection] = useState<AdminSection>("catalog");

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

  if (!member) {
    return (
      <CenteredCard>
        {memberLoading ? (
          <Loader2 class="size-14 animate-spin text-primary" />
        ) : memberError ? (
          <AlertCircle class="size-16 text-destructive" />
        ) : (
          <CreditCard class="size-16 text-primary" />
        )}
        <h1 class="text-3xl font-bold">Configuration des ventes</h1>
        {memberError ? (
          <>
            <p class="max-w-xl text-center text-lg text-destructive">
              Carte inconnue ou serveur indisponible.
            </p>
            <div class="flex gap-3">
              <Button variant="outline" onClick={() => void retry()}>
                Réessayer
              </Button>
              <Button onClick={clear}>Saisir une autre carte</Button>
            </div>
          </>
        ) : (
          <p class="max-w-xl text-center text-lg text-muted-foreground">
            {inputLength > 0
              ? `Saisie en cours : ${inputLength} chiffre${inputLength > 1 ? "s" : ""}. Appuyez sur Entrée.`
              : "Scannez une carte administrateur, ou saisissez son numéro puis appuyez sur Entrée."}
          </p>
        )}
      </CenteredCard>
    );
  }

  if (!isAdmin) {
    return (
      <CenteredCard>
        <ShieldAlert class="size-16 text-destructive" />
        <h1 class="text-3xl font-bold">Accès administrateur requis</h1>
        <p class="text-lg text-muted-foreground">
          La carte de {member.firstName} {member.lastName} n'est pas autorisée.
        </p>
        <Button onClick={clear}>Scanner une autre carte</Button>
      </CenteredCard>
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
    setSelectedIds(new Set((catalog ?? []).map((product) => product.id)));
    setDirty(true);
    setSaveState("idle");
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
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

  const adminNavigation = (
    <nav class="flex items-center gap-3 border-b bg-card px-7 py-3">
      <Button
        variant={section === "catalog" ? "default" : "outline"}
        onClick={() => setSection("catalog")}
      >
        <ShoppingBasket class="size-5" /> Catalogue
      </Button>
      <Button
        variant={section === "statistics" ? "default" : "outline"}
        onClick={() => setSection("statistics")}
      >
        <BarChart3 class="size-5" /> Statistiques
      </Button>
      <span class="ml-auto text-sm text-muted-foreground">
        {member.firstName} {member.lastName}
      </span>
    </nav>
  );

  if (section === "statistics") {
    return (
      <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
        {adminNavigation}
        <StatisticsPanel adminCardNumber={member.cardNumber} />
      </div>
    );
  }

  return (
    <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
      {adminNavigation}
      <header class="flex items-center justify-between gap-5 border-b bg-card px-7 py-4">
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
            Tout cocher
          </Button>
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Tout décocher
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

      <div class="flex-1 overflow-y-auto px-7 py-5">
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

        <div class="flex flex-col gap-7">
          {categories.map((category) => (
            <section key={category.id}>
              <h2 class="mb-3 text-lg font-semibold">{category.name}</h2>
              <div class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                {category.products.map((product) => {
                  const selected = selectedIds.has(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleProduct(product.id)}
                      class={cn(
                        "relative min-h-28 border bg-card p-4 text-left transition-all hover:bg-accent",
                        selected &&
                          "border-primary bg-primary/10 ring-2 ring-primary/40",
                      )}
                    >
                      {selected && (
                        <span class="absolute right-3 top-3 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check class="size-4" />
                        </span>
                      )}
                      <p class="pr-8 text-lg font-semibold">{product.name}</p>
                      <p class="mt-1 text-sm text-muted-foreground">
                        {product.title}
                      </p>
                      <p class="mt-3 font-medium">{product.price} €</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {saveState === "saved" && (
        <div class="border-t border-green-500/30 bg-green-500/10 px-7 py-2 text-center text-green-400">
          Sélection enregistrée. L'écran Achats est déjà à jour.
        </div>
      )}
      {saveState === "error" && (
        <div class="border-t border-destructive/30 bg-destructive/10 px-7 py-2 text-center text-destructive">
          Impossible d'enregistrer la sélection. Réessayez.
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
