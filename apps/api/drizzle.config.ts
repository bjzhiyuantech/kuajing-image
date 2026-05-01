import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      `mysql://${process.env.MYSQL_USER ?? "gpt_image_canvas"}:${process.env.MYSQL_PASSWORD ?? "gpt_image_canvas"}@${
        process.env.MYSQL_HOST ?? "127.0.0.1"
      }:${process.env.MYSQL_PORT ?? "3306"}/${process.env.MYSQL_DATABASE ?? "gpt_image_canvas"}`
  }
});
