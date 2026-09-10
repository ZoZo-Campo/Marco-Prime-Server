import z from "zod";

// Schema de base pour le paramètre page
export const pageParamSchema = z.coerce.number().min(1).default(1);

// Schema pour les search params avec seulement page
export const pageSearchParamsSchema = z.object({
  page: pageParamSchema,
});

// Schema pour les search params de la page buy (page + categoryId)
export const buySearchParamsSchema = z.object({
  page: pageParamSchema,
  categoryId: z.coerce.number().min(1).default(1),
});

// Types exportés
export type PageSearchParams = z.infer<typeof pageSearchParamsSchema>;
export type BuySearchParams = z.infer<typeof buySearchParamsSchema>;
