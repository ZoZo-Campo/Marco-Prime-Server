import { LocationProvider } from "preact-iso";
import type { PropsWithChildren } from "preact/compat";

export function Providers({ children }: PropsWithChildren) {
  return <LocationProvider>{children}</LocationProvider>;
}
