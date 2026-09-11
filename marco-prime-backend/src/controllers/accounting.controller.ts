import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { accountingService, accountingView } from "../services/accounting.service.js";
import { auditEvent } from "../config/logger.js";
import type { accountingReadSchema, accountingUpdateSchema } from "../validators/accounting.validator.js";

type ReadRequest = z.infer<typeof accountingReadSchema>;
type UpdateRequest = z.infer<typeof accountingUpdateSchema>;

export class AccountingController {
  private members = new MemberRepository();

  async get(c: Context) {
    const request = c.req.valid("json" as never) as ReadRequest;
    await this.requireAdmin(request.adminCardNumber);
    return c.json(accountingView(await accountingService.get()));
  }

  async update(c: Context) {
    const request = c.req.valid("json" as never) as UpdateRequest;
    const admin = await this.requireAdmin(request.adminCardNumber);
    const saved = await accountingService.replace(request);
    auditEvent("accounting.updated", { adminMemberId: admin.id, rows: saved.rows.length, eventDate: saved.eventDate });
    return c.json(accountingView(saved));
  }

  private async requireAdmin(cardNumber: number) {
    const member = await this.members.findFullByCardNumber(cardNumber);
    if (!member?.admin) throw new HTTPException(403, { message: "An administrator card is required" });
    return member;
  }
}
