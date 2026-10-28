import { spawn } from "node:child_process";
import { constants, existsSync } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createConnection } from "mysql2/promise";

const ALLOWED_KEYS = new Set([
  "API_PORT",
  "API_HOST",
  "API_AUTH_ENABLED",
  "API_TOKEN",
  "DATABASE_URL",
  "NODE_ENV",
  "FRONTEND_URL",
  "FOUAILLE_API_URL",
  "FOUAILLE_SYNC_ENABLED",
  "FOUAILLE_SYNC_INTERVAL_MS",
  "MARCO_DATA_DIR",
  "MARCO_DEPLOYMENT",
  "MARCO_HOST_PORT",
  "PUBLIC_API_URL",
]);

const PLACEHOLDERS = [
  "REPLACE_HERE",
  "MOT_DE_PASSE",
  "NOM_DE_LA_BASE",
  "UTILISATEUR:",
];

type ParsedEnv = {
  values: Record<string, string>;
  errors: string[];
};

export type EnvDatabase = {
  host: string;
  port: string;
  name: string;
  user: string;
};

export type EnvValidation = {
  valid: boolean;
  errors: string[];
  database?: EnvDatabase;
  authEnabled?: boolean;
};

export type EnvImportResult = {
  imported: boolean;
  restartScheduled: boolean;
  backup: string | null;
  database?: EnvDatabase;
  authEnabled?: boolean;
  errors?: string[];
};

export function envFilePath() {
  return process.env.MARCO_ENV_FILE || path.join(process.cwd(), ".env");
}

export async function readEnvStatus() {
  const file = envFilePath();
  try {
    const info = await stat(file);
    const content = await readFile(file, "utf8");
    const { values } = parseEnv(content);
    return {
      configured: true,
      updatedAt: info.mtime.toISOString(),
      apiPort: values.API_PORT ?? null,
      authEnabled: values.API_AUTH_ENABLED !== "false",
      database: describeDatabase(values.DATABASE_URL),
      dataDir: values.MARCO_DATA_DIR ?? null,
      nodeEnv: values.NODE_ENV ?? null,
    };
  } catch {
    return {
      configured: false,
      updatedAt: null,
      apiPort: null,
      authEnabled: true,
      database: null,
      dataDir: null,
      nodeEnv: null,
    };
  }
}

export async function validateEnv(content: string): Promise<EnvValidation> {
  const { values, errors } = parseEnv(content);
  if (errors.length > 0) return { valid: false, errors };

  const issues: string[] = [];
  if (PLACEHOLDERS.some((placeholder) => content.includes(placeholder))) {
    issues.push("Le fichier contient encore des valeurs d’exemple à remplacer.");
  }

  const databaseUrl = values.DATABASE_URL;
  if (!databaseUrl) {
    issues.push("DATABASE_URL est obligatoire.");
  } else {
    try {
      const url = new URL(databaseUrl);
      if (url.protocol !== "mysql:") {
        issues.push("DATABASE_URL doit commencer par mysql://.");
      }
      if (!url.hostname) issues.push("DATABASE_URL doit contenir un hôte.");
      if (!url.username) issues.push("DATABASE_URL doit contenir un utilisateur.");
      if (!url.pathname || url.pathname === "/") {
        issues.push("DATABASE_URL doit contenir le nom de la base.");
      }
    } catch {
      issues.push("DATABASE_URL est invalide (format mysql://utilisateur:motdepasse@hote:port/base).");
    }
  }

  if (values.API_PORT !== undefined) {
    const port = Number.parseInt(values.API_PORT, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      issues.push("API_PORT doit être un numéro de port valide.");
    }
  }

  if (values.API_AUTH_ENABLED === undefined) {
    issues.push("API_AUTH_ENABLED est obligatoire.");
  } else if (!["true", "false"].includes(values.API_AUTH_ENABLED)) {
    issues.push("API_AUTH_ENABLED doit valoir true ou false.");
  }

  if (
    values.MARCO_DEPLOYMENT !== undefined &&
    !["server", "local"].includes(values.MARCO_DEPLOYMENT)
  ) {
    issues.push("MARCO_DEPLOYMENT doit valoir server ou local.");
  }

  if (values.FOUAILLE_SYNC_ENABLED !== undefined && !["true", "false"].includes(values.FOUAILLE_SYNC_ENABLED)) {
    issues.push("FOUAILLE_SYNC_ENABLED doit valoir true ou false.");
  }

  if (values.API_AUTH_ENABLED !== "false") {
    if (!values.API_TOKEN || values.API_TOKEN.length < 8) {
      issues.push("API_TOKEN est obligatoire (8 caractères minimum) quand l’authentification est active.");
    }
  }

  if (values.MARCO_DATA_DIR) {
    if (values.MARCO_DATA_DIR.includes("..")) {
      issues.push("MARCO_DATA_DIR ne doit pas contenir « .. ».");
    }
  }

  if (values.NODE_ENV !== "production") {
    issues.push("NODE_ENV doit être production (sinon le frontend n’est pas servi).");
  }

  if (issues.length > 0) return { valid: false, errors: issues };

  const database = describeDatabase(databaseUrl)!;
  const check = await testDatabase(databaseUrl!);
  if (!check.ok) {
    return { valid: false, errors: [`Connexion MySQL impossible : ${check.error}`], database };
  }

  const dataDir = resolveDataDir(values.MARCO_DATA_DIR);
  if (dataDir) {
    try {
      await mkdir(dataDir, { recursive: true, mode: 0o700 });
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Impossible de créer le dossier de données ${dataDir} : ${error instanceof Error ? error.message : "erreur inconnue"}`,
        ],
        database,
      };
    }
  }

  return {
    valid: true,
    errors: [],
    database,
    authEnabled: values.API_AUTH_ENABLED !== "false",
  };
}

export async function importEnv(content: string, restart = true): Promise<EnvImportResult> {
  const validation = await validateEnv(content);
  if (!validation.valid) {
    return { imported: false, restartScheduled: false, backup: null, errors: validation.errors };
  }

  const file = envFilePath();
  const normalized = `${content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd()}\n`;
  const backup = `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  let backupName: string | null = null;

  try {
    await access(file, constants.F_OK);
    await copyFile(file, backup);
    await chmod(backup, 0o600);
    backupName = path.basename(backup);
  } catch {
    // Aucun fichier existant : l'import le crée.
  }

  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, normalized, { mode: 0o600 });
  await rename(temporary, file);
  await chmod(file, 0o600);

  const restartScheduled = restart ? scheduleMarcoRestart() : false;
  return {
    imported: true,
    restartScheduled,
    backup: backupName,
    database: validation.database,
    authEnabled: validation.authEnabled,
  };
}

export function scheduleMarcoRestart() {
  const home = process.env.HOME;
  if (!home) return false;
  const script = path.join(home, "relance-marco.sh");
  if (!existsSync(script)) return false;

  try {
    const child = spawn("sh", ["-c", `sleep 1; sh "${script}" --force`], {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function parseEnv(content: string): ParsedEnv {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  const seen = new Set<string>();
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#")) return;

    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Ligne ${index + 1} : format attendu CLE=valeur.`);
      return;
    }

    const key = match[1];
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Ligne ${index + 1} : clé inconnue « ${key} ».`);
      return;
    }
    if (seen.has(key)) {
      errors.push(`Ligne ${index + 1} : la clé « ${key} » est présente plusieurs fois.`);
      return;
    }
    seen.add(key);
    values[key] = parseValue(match[2]);
  });

  return { values, errors };
}

function parseValue(raw: string) {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  const comment = value.indexOf(" #");
  return (comment >= 0 ? value.slice(0, comment) : value).trim();
}

function describeDatabase(databaseUrl: string | undefined): EnvDatabase | null {
  if (!databaseUrl) return null;
  try {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: url.port || "3306",
      name: decodeURIComponent(url.pathname.replace(/^\//, "")),
      user: decodeURIComponent(url.username),
    };
  } catch {
    return null;
  }
}

async function testDatabase(databaseUrl: string) {
  let connection: Awaited<ReturnType<typeof createConnection>> | null = null;
  try {
    connection = await createConnection({
      uri: databaseUrl,
      connectTimeout: 5_000,
    });
    await connection.query("SELECT 1");
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "erreur inconnue",
    };
  } finally {
    await connection?.end().catch(() => undefined);
  }
}

function resolveDataDir(value: string | undefined) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
