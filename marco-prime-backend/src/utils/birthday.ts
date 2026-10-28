const parisDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  month: "2-digit",
  day: "2-digit",
});

export function isBirthdayToday(monthDay: string | null, now = new Date()): boolean {
  if (!monthDay || !/^\d{2}-\d{2}$/.test(monthDay)) return false;
  const parts = parisDay.formatToParts(now);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return monthDay === `${month}-${day}`;
}
