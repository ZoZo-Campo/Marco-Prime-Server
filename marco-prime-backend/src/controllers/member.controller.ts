import type { Context } from "hono";
import type { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { MemberRepository } from "../repositories/member.repository.js";
import { cardNumberParamSchema } from "../validators/members.validator.js";

type MemberParamRequest = z.infer<typeof cardNumberParamSchema>;

export class MemberController {
  private memberRepository = new MemberRepository();

  async getMemberByCardNumber(c: Context) {
    const { card_number } = c.req.valid("param" as never) as MemberParamRequest;

    const member = await this.memberRepository.findByCardNumber(card_number);

    if (!member) {
      throw new HTTPException(404, {
        message: "Carte membre inconnue",
      });
    }

    return c.json(member);
  }
}
