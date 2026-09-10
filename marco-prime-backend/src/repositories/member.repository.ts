import { eq } from "drizzle-orm";
import { db } from "../config/database.js";
import { members } from "../db/schema.js";

export class MemberRepository {
  async findByCardNumber(cardNumber: number) {
    const [member] = await db
      .select({
        id: members.id,
        lastName: members.lastName,
        firstName: members.firstName,
        cardNumber: members.cardNumber,
        balance: members.balance,
        admin: members.admin,
      })
      .from(members)
      .where(eq(members.cardNumber, cardNumber))
      .limit(1);

    return member;
  }

  async findFullByCardNumber(cardNumber: number) {
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.cardNumber, cardNumber))
      .limit(1);

    return member;
  }

}
