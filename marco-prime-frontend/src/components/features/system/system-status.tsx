import { useEffect, useState } from "preact/hooks";
import z from "zod";
import { apiHeaders, apiUrl } from "../../../config/api";

const statusSchema = z.object({
  backend: z.object({ available: z.boolean() }),
  database: z.object({ available: z.boolean(), latencyMs: z.number() }),
  fouaille: z.object({ available: z.boolean(), latencyMs: z.number() }),
});

type Status = z.infer<typeof statusSchema>;

export function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(apiUrl("system/status"), {
          headers: apiHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const parsed = statusSchema.parse(await response.json());
        if (active) setStatus(parsed);
      } catch {
        if (active) setStatus(null);
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div class="flex shrink-0 items-center gap-3 px-2 text-xs" aria-label="État du système">
      <StatusDot
        label="Base"
        available={status?.database.available ?? false}
        waiting={status === null}
        latency={status?.database.latencyMs}
      />
      <StatusDot
        label="Fouaille"
        available={status?.fouaille.available ?? false}
        waiting={status === null}
        latency={status?.fouaille.latencyMs}
      />
    </div>
  );
}

function StatusDot({
  label,
  available,
  waiting,
  latency,
}: {
  label: string;
  available: boolean;
  waiting: boolean;
  latency?: number;
}) {
  const color = waiting
    ? "bg-amber-400"
    : available
      ? "bg-green-500"
      : "bg-destructive";
  const title = waiting
    ? `${label} : vérification…`
    : `${label} : ${available ? "connecté" : "indisponible"}${latency !== undefined ? ` (${latency} ms)` : ""}`;

  return (
    <span class="flex items-center gap-1.5 text-muted-foreground" title={title}>
      <span class={`size-2.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}
