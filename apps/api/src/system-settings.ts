import { eq } from "drizzle-orm";
import { db } from "./database.js";
import { systemSettings } from "./schema.js";

export const EXTENSION_RELEASE_SETTINGS_KEY = "extension.release";
export const DEMO_CANVAS_SETTINGS_KEY = "guest.demoCanvas";

export async function getSystemSetting(key: string): Promise<typeof systemSettings.$inferSelect | undefined> {
  const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  return row;
}

export async function saveSystemSetting(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(systemSettings)
    .values({
      key,
      valueJson: JSON.stringify(value),
      createdAt: now,
      updatedAt: now
    })
    .onDuplicateKeyUpdate({
      set: {
        valueJson: JSON.stringify(value),
        updatedAt: now
      }
    });
}
