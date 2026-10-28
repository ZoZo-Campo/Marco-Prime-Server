import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Upload,
  X,
} from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { apiHeaders, apiUrl } from "../../../config/api";
import {
  envImportResultSchema,
  envStatusSchema,
  envValidationSchema,
  type EnvStatus,
  type EnvValidation,
} from "../../../schemas/env.schema";
import type { MemberSchema } from "../../../schemas/member.schema";
import { cn } from "../../../utils/cn";
import { ConfigPasswordSettings } from "./config-auth-panel";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";

type Props = { member: MemberSchema };
type ConfirmStep = 0 | 1 | 2;

export function SetupPanel({ member }: Props) {
  const adminCardNumber = member.cardNumber;
  const [status, setStatus] = useState<EnvStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [validation, setValidation] = useState<EnvValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartTimedOut, setRestartTimedOut] = useState(false);

  const loadStatus = async () => {
    setStatusError(null);
    try {
      const response = await fetch(apiUrl("system/env/status"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(envStatusSchema.parse(await response.json()));
    } catch {
      setStatusError("Impossible de lire la configuration actuelle.");
    }
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCardNumber]);

  const updateContent = (value: string) => {
    setContent(value);
    setValidation(null);
    setError(null);
    setMessage(null);
  };

  const readFile = async (file: File) => {
    if (file.size > 20_000) {
      setError("Le fichier est trop volumineux (20 Ko maximum).");
      return;
    }
    try {
      const text = await file.text();
      setFileName(file.name);
      setShowContent(false);
      updateContent(text);
    } catch {
      setError("Impossible de lire le fichier sélectionné.");
    }
  };

  const validate = async () => {
    setChecking(true);
    setValidation(null);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(apiUrl("system/env/validate"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber, content }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || `Vérification impossible (${response.status})`);
      }
      setValidation(envValidationSchema.parse(body));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Vérification impossible.");
    } finally {
      setChecking(false);
    }
  };

  const confirmImport = async () => {
    setConfirmStep(0);
    setImporting(true);
    setError(null);
    setMessage(null);
    setRestartTimedOut(false);
    let shouldPoll = false;
    let reloadOnSuccess = true;
    let receivedResponse = false;

    try {
      const response = await fetch(apiUrl("system/env"), {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ adminCardNumber, content, restart: true }),
      });
      receivedResponse = true;
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          body?.errors?.join(" ") || body?.error || `Import refusé (${response.status})`,
        );
      }
      const result = envImportResultSchema.parse(body);
      if (!result.imported) {
        throw new Error(result.errors?.join(" ") || "Import refusé.");
      }

      setMessage(
        `Configuration importée${result.backup ? ` (sauvegarde : ${result.backup})` : ""}.`,
      );
      setContent("");
      setFileName(null);
      setShowContent(false);
      setValidation(null);
      reloadOnSuccess = result.authEnabled !== true;
      if (result.authEnabled) {
        setError(
          "Authentification activée : après le redémarrage, reconstruisez l’écran avec « sh ~/build-front.sh » puis « sh ~/relance-marco.sh --force » pour que le frontend utilise le même API_TOKEN (visible dans ~/marco-tablet/marco-prime-backend/.env).",
        );
      }
      if (result.restartScheduled) {
        shouldPoll = true;
        setMessage((current) => `${current ?? ""} Marco redémarre automatiquement…`);
      } else {
        setRestartTimedOut(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import impossible.");
      if (!receivedResponse) {
        setMessage("Le serveur a peut-être redémarré pendant l’import. Vérification…");
        shouldPoll = true;
      }
    } finally {
      setImporting(false);
      if (shouldPoll) {
        setRestarting(true);
        pollRestart(reloadOnSuccess);
      }
    }
  };

  const pollRestart = (reloadOnSuccess = true) => {
    const startedAt = Date.now();
    let sawDown = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(healthUrl(), { cache: "no-store" });
        if (response.ok) {
          if (sawDown || Date.now() - startedAt > 6_000) {
            window.clearInterval(timer);
            setRestarting(false);
            setRestartTimedOut(false);
            setMessage(
              reloadOnSuccess
                ? "Marco a redémarré avec la nouvelle configuration. Rechargement de l’écran…"
                : "Marco a redémarré. Reconstruisez le frontend avec le même token, puis rechargez l’application.",
            );
            if (reloadOnSuccess) {
              window.setTimeout(() => window.location.reload(), 1_800);
            }
            return;
          }
        } else {
          sawDown = true;
        }
      } catch {
        sawDown = true;
      }

      if (Date.now() - startedAt > 60_000) {
        window.clearInterval(timer);
        setRestarting(false);
        setRestartTimedOut(true);
        setError(
          "Marco ne répond pas après le redémarrage. Redémarrez la tablette (appui long sur Power → Redémarrer) ou lancez « sh ~/relance-marco.sh --force » dans Termux.",
        );
      }
    }, 2_000);
  };

  const selectedAuth = validation?.authEnabled === true;

  return (
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7">
      <div class="mx-auto flex max-w-6xl flex-col gap-5">
        <ConfigPasswordSettings member={member} />
        <Card class="p-6">
          <div class="flex items-start gap-4">
            <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Server class="size-8" />
            </span>
            <div>
              <h1 class="text-2xl font-bold">Installation et configuration</h1>
              <p class="mt-1 max-w-4xl text-muted-foreground">
                Importez le fichier <code>.env</code> fourni pour cette tablette. Il remplace
                l’ancien fichier ou le crée s’il est absent. Une sauvegarde de l’ancien
                fichier est créée automatiquement.
              </p>
            </div>
          </div>
        </Card>

        <div class="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card class="flex flex-col gap-4 p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-xl font-bold">Configuration actuelle</h2>
              <Button variant="ghost" size="sm" onClick={() => void loadStatus()}>
                <RefreshCw class="size-4" /> Actualiser
              </Button>
            </div>

            {statusError && <p class="text-sm text-destructive">{statusError}</p>}
            {!status && !statusError && (
              <p class="flex items-center gap-2 text-muted-foreground">
                <Loader2 class="size-5 animate-spin" /> Lecture…
              </p>
            )}
            {status && (
              <dl class="space-y-2 text-sm">
                <InfoRow
                  label="Fichier .env"
                  value={status.configured ? "Présent" : "Absent — à importer"}
                  tone={status.configured ? "normal" : "warning"}
                />
                <InfoRow
                  label="Base MySQL"
                  value={
                    status.database
                      ? `${status.database.host}:${status.database.port} / ${status.database.name}`
                      : "Non configurée"
                  }
                />
                <InfoRow label="Utilisateur MySQL" value={status.database?.user ?? "—"} />
                <InfoRow label="Port du serveur" value={status.apiPort ?? "3000 (défaut)"} />
                <InfoRow
                  label="Authentification API"
                  value={status.authEnabled ? "Activée" : "Désactivée"}
                  tone={status.authEnabled ? "warning" : "normal"}
                />
                <InfoRow label="Données locales" value={status.dataDir ?? "./data"} />
                <InfoRow
                  label="Dernière modification"
                  value={
                    status.updatedAt
                      ? new Date(status.updatedAt).toLocaleString("fr-FR")
                      : "—"
                  }
                />
              </dl>
            )}

            {status?.authEnabled && (
              <Warning>
                L’authentification API est activée. Le frontend doit être reconstruit avec le
                même token (<code>sh ~/build-front.sh</code>) après tout changement de token.
              </Warning>
            )}

            <div class="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              Le modèle à remplir se trouve dans le dépôt Git :
              <code class="ml-1">marco-prime-backend/.env.example</code>. Ne jamais
              publier le fichier <code>.env</code> réel.
            </div>
          </Card>

          <Card class="flex flex-col gap-4 p-5">
            <div>
              <h2 class="text-xl font-bold">Importer un fichier .env</h2>
              <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Copiez le modèle <code>.env.example</code> et remplissez les valeurs.</li>
                <li>Choisissez le fichier ci-dessous (ou collez son contenu).</li>
                <li>Vérifiez la connexion MySQL, puis confirmez deux fois.</li>
              </ol>
            </div>

            <label class="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed p-4 text-center hover:bg-accent/40">
              <Upload class="mx-auto size-7 text-primary" />
              <span class="font-semibold">
                {fileName ? `Fichier sélectionné : ${fileName}` : "Choisir le fichier .env"}
              </span>
              <span class="text-xs text-muted-foreground">
                Le fichier reste sur la tablette et n’est jamais envoyé sur Internet.
              </span>
              <input
                type="file"
                class="sr-only"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void readFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowContent((current) => !current)}
              >
                <FileText class="size-4" />
                {showContent ? "Masquer le contenu" : "Coller ou modifier le contenu"}
              </Button>
              {content && (
                <span class="self-center text-xs text-muted-foreground">
                  {content.length} caractères
                </span>
              )}
            </div>

            {showContent && (
              <div class="space-y-2">
                <p class="text-xs font-semibold text-amber-300">
                  Le contenu peut contenir le mot de passe MySQL. Ne le laissez pas visible.
                </p>
                <textarea
                  class="min-h-48 w-full rounded-lg border bg-background p-3 font-mono text-xs"
                  value={content}
                  spellcheck={false}
                  autocomplete="off"
                  placeholder={`API_PORT=3001\nAPI_AUTH_ENABLED=false\nDATABASE_URL="mysql://..."\n...`}
                  onInput={(event) => updateContent(event.currentTarget.value)}
                />
              </div>
            )}

            {validation && (
              <div
                class={cn(
                  "rounded-lg border p-3 text-sm",
                  validation.valid
                    ? "border-green-500/40 bg-green-500/10"
                    : "border-destructive/40 bg-destructive/10",
                )}
              >
                {validation.valid ? (
                  <div class="space-y-1">
                    <p class="flex items-center gap-2 font-semibold text-green-400">
                      <CheckCircle2 class="size-5" /> Fichier valide, connexion MySQL testée.
                    </p>
                    {validation.database && (
                      <p class="flex items-center gap-2 text-muted-foreground">
                        <Database class="size-4" />
                        {validation.database.host}:{validation.database.port} /{" "}
                        {validation.database.name} ({validation.database.user})
                      </p>
                    )}
                    {selectedAuth && (
                      <Warning>
                        L’authentification API est activée dans ce fichier. Le frontend devra
                        être reconstruit avec le même token.
                      </Warning>
                    )}
                  </div>
                ) : (
                  <div>
                    <p class="flex items-center gap-2 font-semibold text-destructive">
                      <AlertTriangle class="size-5" /> Le fichier contient des erreurs.
                    </p>
                    <ul class="mt-2 list-disc space-y-1 pl-5">
                      {validation.errors.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {message && <p class="text-sm text-green-400">{message}</p>}
            {error && <p class="text-sm text-destructive">{error}</p>}
            {restartTimedOut && !restarting && (
              <div class="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p class="font-semibold text-destructive">Redémarrage à vérifier</p>
                <p class="mt-1 text-muted-foreground">
                  La configuration a été écrite. Redémarrez la tablette (appui long sur Power
                  → Redémarrer) ou lancez{" "}
                  <code>sh ~/relance-marco.sh --force</code> dans Termux. Vérifiez ensuite que
                  Marco revient sur cet écran.
                </p>
                <Button
                  class="mt-3"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRestartTimedOut(false);
                    setError(null);
                    setRestarting(true);
                    pollRestart();
                  }}
                >
                  <RefreshCw class="size-4" /> Vérifier à nouveau
                </Button>
              </div>
            )}

            <div class="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap gap-2 border-t bg-card/95 px-5 py-4 backdrop-blur">
              <Button
                variant="outline"
                disabled={!content || checking || importing}
                onClick={() => void validate()}
              >
                {checking ? <Loader2 class="size-4 animate-spin" /> : <ShieldCheck class="size-4" />}
                Vérifier le fichier
              </Button>
              <Button
                disabled={!validation?.valid || importing || restarting}
                onClick={() => setConfirmStep(1)}
              >
                <Upload class="size-4" /> Importer ce .env
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {confirmStep === 1 && (
        <Dialog title="Remplacer la configuration ?" onClose={() => setConfirmStep(0)}>
          <p class="text-muted-foreground">
            Le fichier <code>.env</code> actuel sera remplacé par le nouveau. Une sauvegarde
            horodatée est créée avant l’écriture.
          </p>
          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <div class="rounded-lg border p-3">
              <p class="text-xs font-semibold uppercase text-muted-foreground">Base actuelle</p>
              <p class="mt-1 font-medium">
                {status?.database
                  ? `${status.database.host}:${status.database.port} / ${status.database.name}`
                  : "Non configurée"}
              </p>
            </div>
            <div class="rounded-lg border p-3">
              <p class="text-xs font-semibold uppercase text-muted-foreground">Nouvelle base</p>
              <p class="mt-1 font-medium">
                {validation?.database
                  ? `${validation.database.host}:${validation.database.port} / ${validation.database.name}`
                  : "—"}
              </p>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmStep(0)}>Annuler</Button>
            <Button onClick={() => setConfirmStep(2)}>Continuer</Button>
          </div>
        </Dialog>
      )}

      {confirmStep === 2 && (
        <Dialog title="Confirmation définitive" tone="danger" onClose={() => setConfirmStep(0)}>
          <p class="font-semibold">
            Le serveur Marco va redémarrer avec la nouvelle configuration.
          </p>
          <ul class="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Le fichier <code>.env</code> actuel est sauvegardé.</li>
            <li>La tablette n’a pas besoin d’être redémarrée en entier.</li>
            <li>
              Si Marco ne revient pas après 60 secondes, redémarrez la tablette (appui long
              sur Power → Redémarrer) ou lancez{" "}
              <code>sh ~/relance-marco.sh --force</code> dans Termux.
            </li>
          </ul>
          {selectedAuth && (
            <Warning>
              L’authentification est activée : reconstruisez aussi le frontend avec le même
              token après l’import.
            </Warning>
          )}
          <p class="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
            Voulez-vous vraiment remplacer la configuration et redémarrer Marco ?
          </p>
          <div class="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmStep(0)}>Non, annuler</Button>
            <Button variant="destructive" disabled={importing} onClick={() => void confirmImport()}>
              {importing ? <Loader2 class="size-4 animate-spin" /> : null}
              Oui, importer et redémarrer
            </Button>
          </div>
        </Dialog>
      )}

      {importing && (
        <Dialog title="Import en cours" closable={false} onClose={() => undefined}>
          <p class="flex items-center gap-3 text-lg">
            <Loader2 class="size-6 animate-spin text-primary" />
            Écriture du fichier .env et test de la configuration…
          </p>
        </Dialog>
      )}

      {restarting && (
        <Dialog title="Redémarrage de Marco" closable={false} onClose={() => undefined}>
          <p class="flex items-center gap-3 text-lg">
            <Loader2 class="size-6 animate-spin text-primary" />
            Le serveur redémarre avec la nouvelle configuration…
          </p>
          <p class="mt-3 text-sm text-muted-foreground">
            L’écran va se recharger automatiquement. Si Marco ne revient pas après 60
            secondes, redémarrez la tablette (appui long sur Power → Redémarrer).
          </p>
        </Dialog>
      )}
    </div>
  );
}

function healthUrl() {
  try {
    const configured = import.meta.env.VITE_API_URL || "/api/v1";
    return new URL("/health", new URL(configured, window.location.origin).origin).toString();
  } catch {
    return `${window.location.origin}/health`;
  }
}

function InfoRow({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "warning";
}) {
  return (
    <div class="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1 last:border-0">
      <dt class="text-muted-foreground">{label}</dt>
      <dd class={cn("text-right font-medium", tone === "warning" && "text-amber-300")}>
        {value}
      </dd>
    </div>
  );
}

function Warning({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
      <AlertTriangle class="mt-0.5 size-5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function Dialog({
  title,
  tone = "normal",
  onClose,
  closable = true,
  children,
}: {
  title: string;
  tone?: "normal" | "danger";
  onClose: () => void;
  closable?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div class="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        class={cn(
          "w-full max-w-xl rounded-2xl border bg-card p-6 shadow-2xl",
          tone === "danger" && "border-destructive/60",
        )}
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <h2 class={cn("text-2xl font-bold", tone === "danger" && "text-destructive")}>
            {title}
          </h2>
          {closable && (
            <Button size="icon" variant="ghost" aria-label="Fermer" onClick={onClose}>
              <X />
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
