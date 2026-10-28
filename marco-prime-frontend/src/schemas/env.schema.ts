import z from "zod";

export const envDatabaseSchema = z.object({
  host: z.string(),
  port: z.string(),
  name: z.string(),
  user: z.string(),
});

export type EnvDatabase = z.infer<typeof envDatabaseSchema>;

export const envStatusSchema = z.object({
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
  apiPort: z.string().nullable(),
  authEnabled: z.boolean(),
  database: envDatabaseSchema.nullable(),
  dataDir: z.string().nullable(),
  nodeEnv: z.string().nullable(),
});

export type EnvStatus = z.infer<typeof envStatusSchema>;

export const envValidationSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  database: envDatabaseSchema.optional(),
  authEnabled: z.boolean().optional(),
});

export type EnvValidation = z.infer<typeof envValidationSchema>;

export const envImportResultSchema = z.object({
  imported: z.boolean(),
  restartScheduled: z.boolean(),
  backup: z.string().nullable(),
  database: envDatabaseSchema.optional(),
  authEnabled: z.boolean().optional(),
  errors: z.array(z.string()).optional(),
});

export type EnvImportResult = z.infer<typeof envImportResultSchema>;
