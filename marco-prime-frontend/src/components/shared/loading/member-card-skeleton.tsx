import { Alert } from "../../ui/alert";
import { Skeleton } from "../../ui/skeleton";

export function MemberCardSkeleton() {
  return (
    <Alert class="flex flex-col gap-3.5 py-4">
      <Skeleton class="h-5 w-28" />
      <Skeleton class="h-4 w-16" />
    </Alert>
  );
}
