import { createConnection } from "node:net";

const socketPath = process.env.WIFI_CONTROL_SOCKET
  ?? "/run/marco-wifi/control.sock";

export interface WifiNetwork {
  ssid: string;
  signal: number;
  secure: boolean;
  active: boolean;
}

export async function requestWifiControl<T>(
  request: Record<string, unknown>,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Le contrôle Wi-Fi ne répond pas"));
    }, request.action === "connect" ? 35_000 : 20_000);

    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      callback();
    };
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.length > 64_000) socket.destroy();
    });
    socket.on("error", (error) => finish(() => reject(error)));
    socket.on("end", () => finish(() => {
      try {
        const parsed = JSON.parse(response) as {
          ok: boolean;
          result?: T;
          error?: string;
        };
        if (!parsed.ok || parsed.result === undefined) {
          reject(new Error(parsed.error || "Opération Wi-Fi refusée"));
          return;
        }
        resolve(parsed.result);
      } catch {
        reject(new Error("Réponse Wi-Fi invalide"));
      }
    }));
  });
}
