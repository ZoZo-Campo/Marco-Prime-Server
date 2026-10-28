import { memberSchema } from "../schemas/member.schema";
import type { MemberSchema } from "../schemas/member.schema";

const STORAGE_KEY = "marco.recent-members";
const MAX_RECENT = 6;

function parseRecentMember(value: unknown): MemberSchema | null {
  const parsed = memberSchema.safeParse(value);
  return parsed.success && !parsed.data.admin ? parsed.data : null;
}

export function loadRecentMembers(): MemberSchema[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const safe = parsed
      .map(parseRecentMember)
      .filter((member): member is MemberSchema => member !== null);
    if (safe.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    }
    return safe;
  } catch {
    return [];
  }
}

export function addRecentMember(member: MemberSchema): void {
  if (member.admin) return;
  try {
    const existing = loadRecentMembers().filter((m) => m.id !== member.id);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([member, ...existing].slice(0, MAX_RECENT)),
    );
  } catch {
    /* stockage indisponible */
  }
}