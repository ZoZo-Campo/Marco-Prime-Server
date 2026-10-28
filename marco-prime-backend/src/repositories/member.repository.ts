import { and, asc, eq, isNotNull, like, or, sql } from "drizzle-orm";
import { db } from "../config/database.js";
import { members } from "../db/schema.js";
import { isBirthdayToday } from "../utils/birthday.js";

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
        contributor: members.contributor,
        birthMonthDay: sql<string | null>`DATE_FORMAT(${members.birthDate}, '%m-%d')`,
      })
      .from(members)
      .where(eq(members.cardNumber, cardNumber))
      .limit(1);

    if (!member) return undefined;
    const { birthMonthDay, ...publicMember } = member;
    return { ...publicMember, isBirthday: isBirthdayToday(birthMonthDay) };
  }

  async findFullByCardNumber(cardNumber: number) {
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.cardNumber, cardNumber))
      .limit(1);

    return member;
  }

  async search(query: string, limit = 12, promotion?: number) {
    const trimmed = query.trim();
    const pattern = `%${trimmed}%`;
    const cardPattern = /^\d+$/.test(trimmed)
      ? like(sql`cast(${members.cardNumber} as char)`, pattern)
      : undefined;
    const found = await db
      .select({
        id: members.id,
        lastName: members.lastName,
        firstName: members.firstName,
        cardNumber: members.cardNumber,
        balance: members.balance,
        admin: members.admin,
        contributor: members.contributor,
        class: members.class,
        birthMonthDay: sql<string | null>`DATE_FORMAT(${members.birthDate}, '%m-%d')`,
      })
      .from(members)
      .where(
        and(
          isNotNull(members.cardNumber),
          promotion === undefined ? undefined : eq(members.class, promotion),
          trimmed.length < 1 ? undefined : or(
          like(members.firstName, pattern),
          like(members.lastName, pattern),
          sql`concat(${members.firstName}, ' ', ${members.lastName}) like ${pattern}`,
          sql`concat(${members.lastName}, ' ', ${members.firstName}) like ${pattern}`,
          cardPattern,
          ),
        ),
      )
      .orderBy(asc(members.lastName), asc(members.firstName))
      .limit(limit);
    return found.map(({ birthMonthDay, ...member }) => ({
      ...member,
      isBirthday: isBirthdayToday(birthMonthDay),
    }));
  }

  async listPromotions(limit = 100) {
    const rows = await db
      .selectDistinct({ class: members.class })
      .from(members)
      .where(and(isNotNull(members.class), isNotNull(members.cardNumber)))
      .orderBy(asc(members.class))
      .limit(limit);
    return rows
      .map((row) => row.class)
      .filter((year): year is number => typeof year === "number" && year >= 2000 && year <= 2100);
  }

}
