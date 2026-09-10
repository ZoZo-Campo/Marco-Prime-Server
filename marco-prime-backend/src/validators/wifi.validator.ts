import { z } from "zod";

const adminCardNumber = z.number().int().positive().safe();

export const wifiAdminSchema = z.object({ adminCardNumber });

export const wifiConnectSchema = z.object({
  adminCardNumber,
  ssid: z.string().min(1).max(32).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "Wi-Fi name contains invalid characters",
  }),
  password: z
    .string()
    .max(64)
    .refine(
      (value) =>
        !/[\u0000-\u001f\u007f]/.test(value)
        && (value.length === 0 || value.length >= 8),
      { message: "Wi-Fi password must contain 8 to 64 printable characters" },
    ),
});
