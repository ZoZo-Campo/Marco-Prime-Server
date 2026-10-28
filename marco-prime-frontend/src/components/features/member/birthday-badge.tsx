export function BirthdayBadge({ firstName }: { firstName: string }) {
  return <div role="status" class="mt-2 flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-amber-200">
    <span aria-hidden="true" class="inline-block text-3xl motion-safe:animate-bounce motion-reduce:animate-none">🎂</span>
    <span class="font-semibold">Joyeux anniversaire {firstName} !</span>
  </div>;
}
