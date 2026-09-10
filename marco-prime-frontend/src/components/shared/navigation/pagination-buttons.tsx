import { ArrowLeft, ArrowRight } from "lucide-preact";
import type { ComponentProps } from "preact";
import { useSafeSearchParams } from "../../../hooks/use-safe-search-params";
import { pageSearchParamsSchema } from "../../../schemas/pagination.schema";
import { Button } from "../../ui/button";

export function PrevPageButton(props: ComponentProps<typeof Button>) {
  const { route, url, searchParams } = useSafeSearchParams(
    pageSearchParamsSchema,
  );

  const prevPage = new URL(url, window.location.origin);
  prevPage.searchParams.set("page", (searchParams.page - 1).toString());

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => route(prevPage.pathname + prevPage.search)}
      {...props}
    >
      <ArrowLeft />
    </Button>
  );
}

export function NextPageButton(props: ComponentProps<typeof Button>) {
  const { searchParams, route, url } = useSafeSearchParams(
    pageSearchParamsSchema,
  );

  const nextPage = new URL(url, window.location.origin);
  nextPage.searchParams.set("page", (searchParams.page + 1).toString());

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => route(nextPage.pathname + nextPage.search)}
      {...props}
    >
      <ArrowRight />
    </Button>
  );
}
