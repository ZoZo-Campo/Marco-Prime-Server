import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();

export const correctionListSchema = z.object({
  adminCardNumber,
  limit: z.number().int().min(1).max(200).default(50),
});

export const correctionRequestSchema = z.object({
  adminCardNumber,
  originalOrderId: z.number().int().positive(),
  replacementProductId: z.number().int().positive().nullable(),
  replacementAmount: z.number().int().min(0).max(1000),
  reason: z.string().trim().min(3).max(250),
}).superRefine((value, context) => {
  if ((value.replacementProductId === null) !== (value.replacementAmount === 0)) {
    context.addIssue({ code: "custom", path: ["replacementAmount"], message: "Cancellation requires no product and amount 0" });
  }
});
