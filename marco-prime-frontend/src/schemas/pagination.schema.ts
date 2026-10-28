import z from "zod";

// Les paramètres d'URL ne doivent jamais faire planter l'écran : une valeur
// absente ou invalide retombe sur la première page / catégorie.
export const pageParamSchema = z.coerce.number().int().min(1).catch(1);

export const pageSearchParamsSchema = z.object({
  page: pageParamSchema,
});

export const buySearchParamsSchema = z.object({
  page: pageParamSchema,
  categoryId: z.coerce.number().int().min(1).catch(1),
});
