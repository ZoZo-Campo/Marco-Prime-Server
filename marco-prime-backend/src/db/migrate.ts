import "dotenv/config";
import mysql from "mysql2/promise";

/**
 * Migration idempotente pour une base Marco Prime déjà existante (BdeData).
 *
 * `drizzle-kit migrate` rejoue l'historique complet et échouerait sur une
 * base créée hors Drizzle. Ce script ajoute uniquement les objets introduits
 * par le durcissement : clés d'idempotence, garde anti-double-correction,
 * index de lecture et unicité des badges.
 *
 * Il ne supprime ni ne modifie aucune donnée métier. En cas de doublons de
 * badges, il s'arrête avant de créer l'index unique et indique quoi corriger.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL est absente.");
  process.exit(1);
}
const connectionString: string = databaseUrl;

let target: URL;
try {
  target = new URL(databaseUrl);
} catch {
  console.error("DATABASE_URL est invalide.");
  process.exit(1);
}
const databaseName = target.pathname.replace(/^\//, "");
if (!databaseName) {
  console.error("DATABASE_URL ne contient pas de nom de base.");
  process.exit(1);
}

type Row = Record<string, unknown>;

async function main() {
  const connection = await mysql.createConnection(connectionString);

  async function tableExists(table: string) {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?
       LIMIT 1`,
      [table],
    );
    return (rows as Row[]).length > 0;
  }

  async function indexExists(table: string, index: string) {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
       LIMIT 1`,
      [table, index],
    );
    return (rows as Row[]).length > 0;
  }

  async function addIndex(
    table: string,
    index: string,
    columns: string,
  ) {
    if (await indexExists(table, index)) {
      console.log(`= index ${index} déjà présent`);
      return;
    }
    await connection.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (${columns})`,
    );
    console.log(`+ index ${index}`);
  }

  try {
    console.log(
      `Migration de ${target.hostname}${target.port ? `:${target.port}` : ""}/${databaseName}`,
    );

    if (!(await tableExists("members"))) {
      throw new Error(
        "La table members est absente. Base vide ou non initialisée : utilisez d'abord la migration Drizzle (pnpm db:migrate) ou importez BdeData.",
      );
    }

    const hadIdempotencyTable = await tableExists("idempotency_keys");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        transaction_id varchar(36) NOT NULL,
        scope varchar(20) NOT NULL,
        request_hash varchar(64) NOT NULL,
        response_json longtext NOT NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (transaction_id),
        KEY idempotency_keys_created_at_idx (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(
      hadIdempotencyTable
        ? "= table idempotency_keys déjà présente"
        : "+ table idempotency_keys",
    );

    const hadCorrectionsTable = await tableExists("order_corrections");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_corrections (
        id bigint unsigned NOT NULL AUTO_INCREMENT,
        original_order_id bigint unsigned NOT NULL,
        kind varchar(20) NOT NULL,
        admin_member_id bigint unsigned NOT NULL,
        reason varchar(250) NOT NULL,
        refund_order_id bigint unsigned NOT NULL,
        replacement_order_id bigint unsigned NULL,
        created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY order_corrections_original_unique (original_order_id),
        KEY order_corrections_refund_idx (refund_order_id),
        KEY order_corrections_replacement_idx (replacement_order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log(
      hadCorrectionsTable
        ? "= table order_corrections déjà présente"
        : "+ table order_corrections",
    );

    // Un badge partagé par deux membres rendrait les débits et crédits
    // ambigus : on refuse la migration tant que les doublons existent.
    const [duplicateCards] = await connection.query(
      `SELECT card_number, COUNT(*) AS total
       FROM members
       WHERE card_number IS NOT NULL
       GROUP BY card_number
       HAVING COUNT(*) > 1
       LIMIT 20`,
    );
    if ((duplicateCards as Row[]).length > 0) {
      const details = (duplicateCards as Row[])
        .map((row) => `${String(row.card_number)} (${String(row.total)} membres)`)
        .join(", ");
      throw new Error(
        `Des numéros de carte sont partagés par plusieurs membres : ${details}. Corrigez-les avant de relancer la migration.`,
      );
    }

    if (!(await indexExists("members", "members_card_number_unique"))) {
      await connection.query(
        "ALTER TABLE members ADD UNIQUE INDEX members_card_number_unique (card_number)",
      );
      console.log("+ index unique members_card_number_unique");
    } else {
      console.log("= index members_card_number_unique déjà présent");
    }

    // La table peut exister dans une base partiellement migrée : on vérifie
    // aussi sa contrainte d'unicité anti-double-correction.
    if (
      !(await indexExists(
        "order_corrections",
        "order_corrections_original_unique",
      ))
    ) {
      const [duplicateCorrections] = await connection.query(
        `SELECT original_order_id, COUNT(*) AS total
         FROM order_corrections
         GROUP BY original_order_id
         HAVING COUNT(*) > 1
         LIMIT 1`,
      );
      if ((duplicateCorrections as Row[]).length > 0) {
        throw new Error(
          "La table order_corrections contient des doublons : corrigez-les avant d'ajouter la contrainte d'unicité.",
        );
      }
      await connection.query(
        "ALTER TABLE order_corrections ADD UNIQUE INDEX order_corrections_original_unique (original_order_id)",
      );
      console.log("+ index unique order_corrections_original_unique");
    }

    await addIndex("members", "members_class_idx", "class");
    await addIndex("orders", "orders_date_idx", "date");
    await addIndex("orders", "orders_member_idx", "member_id");
    await addIndex("orders", "orders_product_idx", "product_id");
    await addIndex(
      "products",
      "products_product_type_idx",
      "product_type_id",
    );
    await addIndex(
      "idempotency_keys",
      "idempotency_keys_created_at_idx",
      "created_at",
    );
    await addIndex(
      "order_corrections",
      "order_corrections_refund_idx",
      "refund_order_id",
    );
    await addIndex(
      "order_corrections",
      "order_corrections_replacement_idx",
      "replacement_order_id",
    );

    console.log("Migration terminée : schéma à jour, données métier intactes.");
  } finally {
    await connection.end();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    `Migration interrompue : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
