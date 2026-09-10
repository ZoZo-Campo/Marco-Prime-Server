import { HOME_ROUTE_URL } from "./home";

export function NotFoundPage() {
  return (
    <div class="grid grid-rows-[auto_1fr] flex-1 gap-1">
      <a href={HOME_ROUTE_URL} class="flex flex-1 justify-center items-center">
        Not Found Page
      </a>
    </div>
  );
}
