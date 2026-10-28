import { useEffect, useMemo, useState } from "preact/hooks";
import { z } from "zod";
import { apiHeaders, apiUrl } from "../../../config/api";
import { Button } from "../../ui/button";
import { adminJson } from "./admin-api";

type ProductType = { id: number; type: string };
const managedProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  title: z.string(),
  price: z.string(),
  color: z.string(),
  productTypeId: z.number().int().positive(),
  available: z.boolean(),
});
type ManagedProduct = z.infer<typeof managedProductSchema>;

export function FouailleProductsPanel({ adminCardNumber, onChanged }: {
  adminCardNumber: number;
  onChanged: () => void;
}) {
  const [products, setProducts] = useState<ManagedProduct[]>([]);
  const [types, setTypes] = useState<ProductType[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [productTypeId, setProductTypeId] = useState("");
  const [color, setColor] = useState("#64748b");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(apiUrl("products"), { headers: apiHeaders(), cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
          return managedProductSchema.array().parse(await response.json());
        }),
      adminJson<ProductType[]>("admin/product-types", { adminCardNumber }),
    ]).then(([items, categories]) => {
      if (active) { setProducts(items); setTypes(categories); }
    }).catch((cause: Error) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [adminCardNumber, revision]);

  const visible = useMemo(() => products.filter((product) => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return (!needle || `${product.name} ${product.title}`.toLocaleLowerCase("fr").includes(needle))
      && (filter === "all" || product.available === (filter === "available"))
      && (!typeFilter || product.productTypeId === Number(typeFilter));
  }).sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name, "fr")),
  [products, search, filter, typeFilter]);

  const toggleAvailability = async (product: ManagedProduct) => {
    const next = !product.available;
    if (!window.confirm(`${next ? "Rendre disponible" : "Rendre indisponible"} « ${product.name} » dans Fouaille Manager ? Ce changement concerne aussi les autres caisses Marco. La sélection « vendu ce soir » reste séparée.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminJson("admin/products/availability", {
        adminCardNumber, productId: product.id,
        expectedAvailable: product.available, available: next,
      }, "PUT");
      setNotice(`${product.name} : ${next ? "disponible" : "indisponible"} dans Fouaille.`);
      setRevision((value) => value + 1);
      onChanged();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  const createProduct = async () => {
    const normalizedPrice = price.replace(",", ".");
    if (!name.trim() || !title.trim() || !productTypeId || !/^\d{1,8}(?:\.\d{1,2})?$/.test(normalizedPrice) || Number(normalizedPrice) <= 0) {
      setError("Renseignez le nom, le titre court, la catégorie et un prix valide.");
      return;
    }
    if (!window.confirm(`Créer « ${name.trim()} » dans Fouaille Manager à ${normalizedPrice} € ? Le produit sera indisponible jusqu’à son activation explicite.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminJson("admin/products", {
        adminCardNumber, name: name.trim(), title: title.trim(), price: normalizedPrice,
        productTypeId: Number(productTypeId), color,
      });
      setNotice("Produit créé dans Fouaille, indisponible par défaut. Activez-le puis sélectionnez-le dans « Vendu ce soir » si nécessaire.");
      setCreating(false); setName(""); setTitle(""); setPrice("");
      setRevision((value) => value + 1);
      onChanged();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  };

  return <div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-7">
    <h1 class="text-2xl font-bold">Produits Fouaille Manager</h1>
    <p class="mt-1 text-muted-foreground">Disponibilité globale dans Fouaille. La liste « Produits vendus ce soir » de Marco se règle dans Catalogue.</p>
    {error && <p role="alert" class="mt-3 rounded border border-destructive p-3 text-destructive">{error}</p>}
    {notice && <p role="status" class="mt-3 rounded border border-green-500 p-3 text-green-400">{notice}</p>}
    <div class="mt-5 flex flex-wrap gap-3">
      <input class="min-h-12 flex-1 rounded border bg-background px-3 text-lg" value={search} placeholder="Rechercher une boisson ou un produit"
        onInput={(event) => setSearch(event.currentTarget.value)} />
      <select class="min-h-12 rounded border bg-background px-3" value={typeFilter} onChange={(event) => setTypeFilter(event.currentTarget.value)}>
        <option value="">Toutes catégories</option>
        {types.map((type) => <option key={type.id} value={type.id}>{type.type}</option>)}
      </select>
      <select class="min-h-12 rounded border bg-background px-3" value={filter} onChange={(event) => setFilter(event.currentTarget.value)}>
        <option value="all">Tous</option><option value="available">Disponibles</option><option value="unavailable">Indisponibles</option>
      </select>
      <Button onClick={() => { setCreating(!creating); }}>{creating ? "Annuler" : "Créer un produit"}</Button>
    </div>
    {creating ? <div class="mt-5 grid max-w-3xl gap-3 rounded border bg-card p-4 md:grid-cols-2">
      <h2 class="md:col-span-2 text-xl font-semibold">Nouveau produit Fouaille</h2>
      <input class="min-h-12 rounded border bg-background px-3" value={name} placeholder="Nom affiché *" onInput={(event) => setName(event.currentTarget.value)} />
      <input class="min-h-12 rounded border bg-background px-3" value={title} placeholder="Titre court unique *" onInput={(event) => setTitle(event.currentTarget.value)} />
      <select class="min-h-12 rounded border bg-background px-3" value={productTypeId} onChange={(event) => setProductTypeId(event.currentTarget.value)}>
        <option value="">Choisir une catégorie *</option>
        {types.map((type) => <option key={type.id} value={type.id}>{type.type}</option>)}
      </select>
      <input class="min-h-12 rounded border bg-background px-3" inputMode="decimal" value={price} placeholder="Prix en € *" onInput={(event) => setPrice(event.currentTarget.value)} />
      <label class="flex items-center gap-3">Couleur <input type="color" value={color} onInput={(event) => setColor(event.currentTarget.value)} /></label>
      <p class="md:col-span-2 text-sm text-muted-foreground">Créé indisponible par défaut. Le rendre disponible et le vendre ce soir sont deux actions distinctes.</p>
      <Button disabled={busy} onClick={() => void createProduct()}>Créer dans Fouaille</Button>
    </div> : <>
      <p class="mt-4 text-sm text-muted-foreground">{visible.length} produit(s) affiché(s) sur {products.length}</p>
      <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((product) => <div key={product.id} class="flex min-h-24 items-center gap-3 rounded border bg-card p-3" style={{ borderLeftColor: product.color, borderLeftWidth: "6px" }}>
          <div class="min-w-0 flex-1"><p class="font-semibold">{product.name}</p><p class="text-sm text-muted-foreground">{product.title} · {product.price} € · {types.find((type) => type.id === product.productTypeId)?.type ?? "Catégorie inconnue"}</p></div>
          <Button variant={product.available ? "outline" : "default"} disabled={busy} onClick={() => void toggleAvailability(product)}>
            {product.available ? "Désactiver" : "Activer"}
          </Button>
        </div>)}
      </div>
    </>}
  </div>;
}
