import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./src/schema.ts", "./src/schema-server.ts"],
  out: "./migrations",
});
