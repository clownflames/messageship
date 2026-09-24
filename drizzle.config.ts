import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { defineConfig } from "drizzle-kit";

const configuredUrl = process.env.DATABASE_URL;
if (configuredUrl && !/^postgres(?:ql)?:\/\//.test(configuredUrl)) {
  throw new Error("DATABASE_URL must start with postgresql:// or postgres://");
}
const databaseUrl = configuredUrl ?? "postgresql://localhost/messageship";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
