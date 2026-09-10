import { useEffect } from "preact/hooks";
import { useLocation } from "preact-iso";
import type z from "zod";

interface UseSafeSearchParamsOptions {
  fallbackPath?: string; // Chemin de redirection si la validation échoue
}

/**
 * Hook amélioré pour valider et utiliser les search params
 * Amélioration de useSafeLocation avec:
 * - Fallback optionnel au lieu de toujours throw
 * - Redirection automatique si fallbackPath fourni
 * - Meilleur nom (plus spécifique)
 */
export function useSafeSearchParams<T>(
  validator: z.ZodType<T>,
  options: UseSafeSearchParamsOptions = {},
) {
  const location = useLocation();
  const { fallbackPath } = options;

  const result = validator.safeParse(location.query);

  useEffect(() => {
    if (!result.success && fallbackPath) {
      location.route(fallbackPath);
    }
  }, [result.success, fallbackPath]);

  // Si validation échoue et pas de fallback, on throw
  if (!result.success && !fallbackPath) {
    throw result.error;
  }

  return {
    searchParams: result.data!,
    ...location,
  };
}
