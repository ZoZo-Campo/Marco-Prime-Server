import { Skeleton } from "../../ui/skeleton";

interface HistoryNavigationProps {
  total: number | null;
  displayedCount: number;
  loading: boolean;
}

export function HistoryNavigation({
  total,
  displayedCount,
  loading,
}: HistoryNavigationProps) {
  if (loading || total === null) {
    return (
      <header class="flex min-h-14 items-center">
        <Skeleton class="h-8 w-64" />
      </header>
    );
  }

  return (
    <header class="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1 sm:px-2">
      <h1 class="text-xl font-semibold">Historique</h1>
      <span class="w-full text-sm text-muted-foreground sm:w-auto sm:text-right sm:text-base">
        {displayedCount} commande{displayedCount > 1 ? "s" : ""} affichée
        {displayedCount > 1 ? "s" : ""} sur {total}
      </span>
    </header>
  );
}
