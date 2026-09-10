import { Loader2, RefreshCw, Signal, WifiOff } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

interface WifiNetwork {
  ssid: string;
  signal: number;
  secure: boolean;
  active: boolean;
}

export function WifiPanel({ adminCardNumber }: { adminCardNumber: number }) {
  const [networks, setNetworks] = useState<WifiNetwork[]>([]);
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const call = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: apiHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ adminCardNumber, ...body }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof result.error === "string" ? result.error : `Erreur ${response.status}`,
      );
    }
    return result;
  };

  const scan = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await call("system/wifi/scan", {});
      setNetworks(Array.isArray(result.networks) ? result.networks : []);
    } catch (error) {
      setNetworks([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "Gestion Wi-Fi indisponible sur cet appareil.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => void scan(), []);

  const connect = async () => {
    if (!selected) return;
    setConnecting(true);
    setMessage(null);
    try {
      await call("system/wifi/connect", { ssid: selected.ssid, password });
      setPassword("");
      setSelected(null);
      setMessage(`Connexion à « ${selected.ssid} » réussie.`);
      await scan();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Connexion impossible.");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-7">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Connexion Wi-Fi</h1>
          <p class="text-sm text-muted-foreground">
            Configuration locale du Raspberry Pi. Le mot de passe n’est pas conservé par Marco.
          </p>
        </div>
        <Button variant="outline" onClick={() => void scan()} disabled={loading}>
          {loading ? <Loader2 class="size-5 animate-spin" /> : <RefreshCw class="size-5" />}
          Actualiser
        </Button>
      </div>

      {message && <div class="rounded-lg border bg-card px-4 py-3">{message}</div>}

      <div class="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {networks.map((network) => (
          <button
            type="button"
            key={network.ssid}
            onClick={() => { setSelected(network); setPassword(""); }}
            class="flex min-h-20 items-center gap-4 rounded-lg border bg-card px-5 text-left hover:bg-accent"
          >
            {network.signal > 0 ? <Signal class="size-6" /> : <WifiOff class="size-6" />}
            <span class="min-w-0 flex-1">
              <span class="block truncate text-lg font-medium">{network.ssid}</span>
              <span class="text-sm text-muted-foreground">
                {network.active ? "Connecté" : `${network.signal} %`}
                {network.secure ? " · Sécurisé" : " · Réseau ouvert"}
              </span>
            </span>
          </button>
        ))}
      </div>

      {!loading && networks.length === 0 && !message && (
        <Card class="items-center py-10 text-muted-foreground">Aucun réseau détecté.</Card>
      )}

      {selected && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <Card class="w-full max-w-lg p-6">
            <h2 class="text-2xl font-bold">{selected.ssid}</h2>
            {selected.secure && (
              <label class="flex flex-col gap-2">
                <span>Mot de passe Wi-Fi</span>
                <input
                  type="password"
                  value={password}
                  autocomplete="new-password"
                  onInput={(event) => setPassword(event.currentTarget.value)}
                  class="min-h-14 rounded-md border bg-background px-4 text-lg"
                />
              </label>
            )}
            <div class="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelected(null)}>Annuler</Button>
              <Button
                onClick={() => void connect()}
                disabled={connecting || (selected.secure && password.length < 8)}
              >
                {connecting && <Loader2 class="size-5 animate-spin" />}
                Se connecter
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
