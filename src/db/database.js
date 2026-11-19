import mysql from "mysql2/promise";
import { readFile, readdir } from "node:fs/promises";
export const openPool = (c) =>
  mysql.createPool({
    host: c.DB_HOST,
    port: c.DB_PORT,
    user: c.DB_USER,
    password: c.DB_PASSWORD,
    database: c.DB_NAME,
    connectionLimit: 5,
    queueLimit: 128,
    connectTimeout: 10000,
  });
export async function health(db) {
  const [[r]] = await db.query("SELECT VERSION() AS version");
  if (!/^8\.4\./.test(r.version)) throw Error("MySQL 8.4 required");
  return true;
}
export async function transaction(pool, work) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const r = await work(db);
    await db.commit();
    return r;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
export async function migrate(pool) {
  const db = await pool.getConnection();
  try {
    const [[{ locked }]] = await db.query(
      "SELECT GET_LOCK('ghostclans_migrate',10) AS locked",
    );
    if (!locked) throw Error("Migration lock unavailable");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(128) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    const dir = new URL("./migrations/", import.meta.url);
    for (const name of (await readdir(dir)).sort()) {
      const [rows] = await db.execute(
        "SELECT name FROM schema_migrations WHERE name=?",
        [name],
      );
      if (rows.length) continue;
      for (const sql of (await readFile(new URL(name, dir), "utf8"))
        .split(";")
        .filter((s) => s.trim()))
        await db.query(sql);
      await db.execute("INSERT INTO schema_migrations(name) VALUES (?)", [
        name,
      ]);
    }
  } finally {
    try {
      await db.query("SELECT RELEASE_LOCK('ghostclans_migrate')");
    } finally {
      db.release();
    }
  }
}
