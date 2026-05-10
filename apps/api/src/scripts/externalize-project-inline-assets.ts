import { and, eq } from "drizzle-orm";
import { db, closeDatabase, initializeDatabase } from "../database.js";
import { externalizeInlineImageAssets } from "../project-store.js";
import { projects } from "../schema.js";

function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function projectWorkspaceId(project: typeof projects.$inferSelect): string {
  return project.workspaceId;
}

function projectUserId(project: typeof projects.$inferSelect): string {
  return project.createdByUserId;
}

async function main(): Promise<void> {
  await initializeDatabase();

  const rows = await db.select().from(projects);
  let scanned = 0;
  let migrated = 0;
  let unchanged = 0;
  let failed = 0;
  let beforeBytes = 0;
  let afterBytes = 0;

  for (const project of rows) {
    scanned += 1;
    const before = project.snapshotJson;
    beforeBytes += byteLength(before);

    try {
      const snapshot = JSON.parse(before) as unknown;
      const migratedSnapshot = await externalizeInlineImageAssets(
        {
          workspaceId: projectWorkspaceId(project),
          userId: projectUserId(project)
        },
        snapshot
      );
      const next = JSON.stringify(migratedSnapshot);
      afterBytes += byteLength(next);

      if (next === before) {
        unchanged += 1;
        console.log(`[${project.id}] unchanged (${byteLength(before)} bytes)`);
        continue;
      }

      await db.update(projects)
        .set({
          snapshotJson: next,
          updatedAt: new Date().toISOString()
        })
        .where(and(eq(projects.id, project.id), eq(projects.workspaceId, project.workspaceId)));

      migrated += 1;
      console.log(`[${project.id}] migrated ${byteLength(before)} -> ${byteLength(next)} bytes`);
    } catch (error) {
      failed += 1;
      afterBytes += byteLength(before);
      console.error(`[${project.id}] failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `Done. scanned=${scanned} migrated=${migrated} unchanged=${unchanged} failed=${failed} bytes=${beforeBytes}->${afterBytes}`
  );
}

void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
