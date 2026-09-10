import { useEffect, useRef, useState } from "preact/hooks";
import type z from "zod";
import { apiHeaders } from "../config/api";

interface UseApiOptions {
  immediate?: boolean; // Si true, fetch immédiatement au mount (défaut: true)
  fetchOptions?: RequestInit; // Options fetch supplémentaires
}

interface UseApiState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
  reset: () => void;
}

/**
 * Hook amélioré pour fetcher des données depuis l'API
 * Amélioration de useFetch avec:
 * - Loading state explicite (pas de comparaison d'URL)
 * - Meilleure gestion des erreurs
 * - Paramètre 'immediate' plus clair que 'directFetch'
 * - Validation Zod intégrée
 */
export function useApi<T>(
  schema: z.ZodType<T>,
  url: string,
  options: UseApiOptions = {},
): UseApiState<T> {
  const { immediate = true, fetchOptions = {} } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const refetch = async () => {
    // Annuler la requête précédente si elle existe
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestId = ++requestIdRef.current;
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
        headers: apiHeaders(fetchOptions?.headers),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
      const validatedData = schema.parse(json);

      if (requestId === requestIdRef.current) {
        setData(validatedData);
        setError(null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Requête annulée, ne pas mettre à jour l'état
        return;
      }
      if (requestId === requestIdRef.current) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
        setData(null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const reset = () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    if (immediate) {
      refetch();
    }

    return () => abortRef.current?.abort();
  }, [url, immediate]);

  return { data, loading, error, refetch, reset };
}
