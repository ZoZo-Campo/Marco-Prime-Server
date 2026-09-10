import { ErrorBoundary, Router as NativeRouter, Route } from "preact-iso";
import { Layout } from "./layout";
import { BILL_ROUTE_URL, BillPage } from "./pages/bill";
import { CONFIG_ROUTE_URL, ConfigPage } from "./pages/config";
import { CREDITS_ROUTE_URL, CreditsPage } from "./pages/credits";
import { HOME_ROUTE_URL, HomePage } from "./pages/home";
import { NotFoundPage } from "./pages/not-found";
import { HISTORY_ROUTE_URL, HistoryPage } from "./pages/history";
import { BUY_ROUTE_URL, BuyPage } from "./pages/buy";
import { RECHARGE_ROUTE_URL, RechargePage } from "./pages/recharge";
import { TICKET_ROUTE_URL, TicketPage } from "./pages/ticket";
import { WIFI_ROUTE_URL, WifiPage } from "./pages/wifi";

export function Router() {
  return (
    <Layout>
      <ErrorBoundary onError={(e) => console.error(e)}>
        <NativeRouter>
          <Route path={BUY_ROUTE_URL} component={BuyPage} />
          <Route path={RECHARGE_ROUTE_URL} component={RechargePage} />
          <Route path={HOME_ROUTE_URL} component={HomePage} />
          <Route path={WIFI_ROUTE_URL} component={WifiPage} />
          <Route path={HISTORY_ROUTE_URL} component={HistoryPage} />
          <Route path={CREDITS_ROUTE_URL} component={CreditsPage} />
          <Route path={CONFIG_ROUTE_URL} component={ConfigPage} />
          <Route path={BILL_ROUTE_URL} component={BillPage} />
          <Route path={TICKET_ROUTE_URL} component={TicketPage} />
          <Route default component={NotFoundPage} />
        </NativeRouter>
      </ErrorBoundary>
    </Layout>
  );
}
