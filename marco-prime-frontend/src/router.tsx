import { ErrorBoundary, Router as NativeRouter, Route } from "preact-iso";
import { Layout } from "./layout";
import { CONFIG_ROUTE_URL, ConfigPage } from "./pages/config";
import { HOME_ROUTE_URL, HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/not-found";
import { HISTORY_ROUTE_URL, HistoryPage } from "./pages/history";
import { BUY_ROUTE_URL, BuyPage } from "./pages/buy";
import { RECHARGE_ROUTE_URL, RechargePage } from "./pages/recharge";
import { TICKET_ROUTE_URL, TicketPage } from "./pages/ticket";

export function Router() {
  return (
    <Layout>
      <ErrorBoundary onError={(e) => console.error(e)}>
        <NativeRouter>
          <Route path={BUY_ROUTE_URL} component={BuyPage} />
          <Route path={RECHARGE_ROUTE_URL} component={RechargePage} />
          <Route path={HOME_ROUTE_URL} component={HomePage} />
          <Route path={HISTORY_ROUTE_URL} component={HistoryPage} />
          <Route path={CONFIG_ROUTE_URL} component={ConfigPage} />
          <Route path={TICKET_ROUTE_URL} component={TicketPage} />
          <Route default component={NotFoundPage} />
        </NativeRouter>
      </ErrorBoundary>
    </Layout>
  );
}
