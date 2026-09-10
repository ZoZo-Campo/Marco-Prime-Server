import { render } from "preact";
import { Providers } from "./components/providers.tsx";
import { Router } from "./router.tsx";
import "./styles/index.css";

render(
  <Providers>
    <Router />
  </Providers>,
  document.getElementById("app")!,
);
