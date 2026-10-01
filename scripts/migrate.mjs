import { neon } from "@neondatabase/serverless";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est requis pour exécuter la migration.");
  process.exit(1);
}
const sql = neon(url);
await sql`CREATE TABLE IF NOT EXISTS app_users (id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
await sql`CREATE TABLE IF NOT EXISTS workspaces (user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE, version INTEGER NOT NULL DEFAULT 1, state JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
await sql`CREATE INDEX IF NOT EXISTS app_users_email_lower_idx ON app_users (LOWER(email))`;
console.log("Migration SYCEBNL terminée.");
