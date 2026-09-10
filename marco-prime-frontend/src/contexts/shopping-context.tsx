import { computed, signal } from "@preact/signals";

// Type pour un produit dans le panier (exporté pour réutilisation)
export type ProductInCart = {
  id: number;
  name: string;
  title: string;
  price: string;
  amount: number;
  color: string;
};

// Signal global pour le panier
const selectedProductsSignal = signal<Array<ProductInCart>>([]);

// Computed signal pour le total
const totalSignal = computed(() =>
  selectedProductsSignal.value.reduce(
    (total, product) => total + Number(product.price) * product.amount,
    0,
  ),
);

// Computed signal pour vérifier si le panier est vide
const isEmptySignal = computed(() => selectedProductsSignal.value.length === 0);

/**
 * Ajoute un produit au panier ou incrémente sa quantité
 */
function append(product: Omit<ProductInCart, "amount">) {
  const idx = selectedProductsSignal.value.findIndex((p) => p.id === product.id);

  if (idx === -1) {
    selectedProductsSignal.value = [
      ...selectedProductsSignal.value,
      { ...product, amount: 1 },
    ];
  } else {
    selectedProductsSignal.value = selectedProductsSignal.value.map((p, i) =>
      i === idx ? { ...p, amount: p.amount + 1 } : p,
    );
  }
}

/**
 * Supprime un produit du panier
 */
function remove(productId: number) {
  selectedProductsSignal.value = selectedProductsSignal.value.filter(
    (p) => p.id !== productId,
  );
}

/**
 * Incrémente la quantité d'un produit
 */
function increment(productId: number) {
  selectedProductsSignal.value = selectedProductsSignal.value.map((p) =>
    p.id === productId ? { ...p, amount: p.amount + 1 } : p,
  );
}

/**
 * Décrémente la quantité d'un produit (retire si quantité = 0)
 */
function decrement(productId: number) {
  selectedProductsSignal.value = selectedProductsSignal.value
    .map((p) => (p.id === productId ? { ...p, amount: p.amount - 1 } : p))
    .filter((p) => p.amount > 0);
}

/**
 * Met à jour la quantité d'un produit (retire si quantité = 0)
 */
function updateAmount(productId: number, amount: number) {
  if (amount <= 0) {
    remove(productId);
    return;
  }

  selectedProductsSignal.value = selectedProductsSignal.value.map((p) =>
    p.id === productId ? { ...p, amount } : p,
  );
}

/**
 * Vide le panier
 */
function reset() {
  selectedProductsSignal.value = [];
}

// Export du "store" shopping avec tous les signaux et fonctions
export const shopping = {
  selected: selectedProductsSignal,
  total: totalSignal,
  isEmpty: isEmptySignal,
  append,
  remove,
  increment,
  decrement,
  updateAmount,
  reset,
};
