import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import { MemberRepository } from "../repositories/member.repository.js";
import { requestWifiControl, type WifiNetwork } from "../services/wifi-control.service.js";
import type { wifiAdminSchema, wifiConnectSchema } from "../validators/wifi.validator.js";

export class WifiController {
  private memberRepository = new MemberRepository();

  async getStatus(c: Context) {
    const request = c.req.valid("json" as never) as z.infer<typeof wifiAdminSchema>;
    await this.requireAdmin(request.adminCardNumber);
    return c.json(await this.callHelper<Record<string, unknown>>({ action: "status" }));
  }

  async scan(c: Context) {
    const request = c.req.valid("json" as never) as z.infer<typeof wifiAdminSchema>;
    await this.requireAdmin(request.adminCardNumber);
    return c.json(await this.callHelper<{ networks: WifiNetwork[] }>({ action: "scan" }));
  }

  async connect(c: Context) {
    const request = c.req.valid("json" as never) as z.infer<typeof wifiConnectSchema>;
    await this.requireAdmin(request.adminCardNumber);
    return c.json(await this.callHelper<Record<string, unknown>>({
      action: "connect",
      ssid: request.ssid,
      password: request.password,
    }));
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.memberRepository.findFullByCardNumber(cardNumber);
    if (!member?.admin) {
      throw new HTTPException(403, { message: "Administrator card required" });
    }
  }

  private async callHelper<T>(request: Record<string, unknown>) {
    try {
      return await requestWifiControl<T>(request);
    } catch (error) {
      throw new HTTPException(503, {
        message: error instanceof Error ? error.message : "Wi-Fi indisponible",
      });
    }
  }
}
