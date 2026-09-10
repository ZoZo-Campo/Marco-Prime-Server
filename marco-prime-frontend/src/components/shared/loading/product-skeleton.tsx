import { Skeleton } from "../../ui/skeleton";

export function ProductSkeleton() {
  return (
    <div class="text-card-foreground bg-card border flex flex-col justify-center items-center gap-3">
      <Skeleton class="h-6 w-24" />
      <Skeleton class="h-5 w-12" />
    </div>
  );
}
