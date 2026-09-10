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
    <header class="flex min-h-14 items-center justify-between px-2">
      <h1 class="text-xl font-semibold">Historique</h1>
      <span class="text-base text-muted-foreground">
        {displayedCount} commande{displayedCount > 1 ? "s" : ""} affichée
        {displayedCount > 1 ? "s" : ""} sur {total}
      </span>
    </header>
  );
}
