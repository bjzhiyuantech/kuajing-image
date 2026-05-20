import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

type DesktopAction = "install" | "start" | "stop" | "status" | "logs" | "smoke";
type LogStream = "stdout" | "stderr" | "system";

const SERVICE_URL = process.env.SHANGTU_DESKTOP_SERVICE_URL || "http://127.0.0.1:8787";
const MUTABLE_TOP_LEVEL = new Set([".env", "backups", "data", "downloads", "images", "secrets"]);

let mainWindow: BrowserWindow | null = null;
let activeProcess: ReturnType<typeof spawn> | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 940,
    minHeight: 640,
    title: "Shangtu AI Standalone",
    backgroundColor: "#f6f7f8",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      sandbox: false
    }
  });

  void mainWindow.loadFile(path.join(app.getAppPath(), "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function emitLog(stream: LogStream, text: string) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send("desktop:log", { stream, text });
}

function emitSnapshot(snapshot: unknown) {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send("desktop:snapshot", snapshot);
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function serviceDir() {
  return path.join(app.getPath("userData"), "standalone");
}

function bundledStandaloneDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  return process.env.SHANGTU_STANDALONE_SOURCE || path.resolve(__dirname, "../../../dist/standalone/shangtu-ai-standalone");
}

async function syncStandaloneEntry(sourcePath: string, targetPath: string, relativePath = "") {
  const topLevel = relativePath.split(path.sep)[0];
  if (topLevel && MUTABLE_TOP_LEVEL.has(topLevel)) return;

  const sourceStat = await stat(sourcePath);
  if (sourceStat.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await readdir(sourcePath);
    for (const entry of entries) {
      await syncStandaloneEntry(path.join(sourcePath, entry), path.join(targetPath, entry), path.join(relativePath, entry));
    }
    return;
  }

  if (sourceStat.isFile()) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
}

async function ensureStandalone() {
  const sourceDir = bundledStandaloneDir();
  const targetDir = serviceDir();
  if (!(await isDirectory(sourceDir))) {
    throw new Error(`standalone resources not found: ${sourceDir}`);
  }

  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir);
  for (const entry of entries) {
    await syncStandaloneEntry(path.join(sourceDir, entry), path.join(targetDir, entry), entry);
  }

  const envFile = path.join(targetDir, ".env");
  const envExample = path.join(targetDir, ".env.example");
  if (!(await pathExists(envFile)) && (await pathExists(envExample))) {
    await copyFile(envExample, envFile);
  }
  await mkdir(path.join(targetDir, "data"), { recursive: true });
  await mkdir(path.join(targetDir, "downloads"), { recursive: true });
  await mkdir(path.join(targetDir, "secrets", "apns"), { recursive: true });

  return { sourceDir, targetDir, envFile };
}

function runProbe(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000
  });
  return {
    ok: result.status === 0,
    output: (result.stdout || result.stderr || result.error?.message || "").trim()
  };
}

function checkDocker() {
  const version = runProbe("docker", ["--version"]);
  if (!version.ok) {
    return {
      cliAvailable: false,
      engineAvailable: false,
      error: version.output || "docker command is unavailable"
    };
  }

  const engine = runProbe("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return {
    cliAvailable: true,
    engineAvailable: engine.ok,
    version: version.output,
    engineVersion: engine.ok ? engine.output : undefined,
    error: engine.ok ? undefined : engine.output || "Docker Engine is not running"
  };
}

async function snapshot() {
  const targetDir = serviceDir();
  const sourceDir = bundledStandaloneDir();
  const installed = await pathExists(path.join(targetDir, "docker-compose.yml"));
  const bundled = await isDirectory(sourceDir);
  return {
    appVersion: app.getVersion(),
    serviceUrl: SERVICE_URL,
    sourceDir,
    serviceDir: targetDir,
    configFile: path.join(targetDir, ".env"),
    busy: activeProcess !== null,
    docker: checkDocker(),
    standalone: {
      bundled,
      installed
    }
  };
}

function scriptCommand(action: DesktopAction, targetDir: string) {
  const scriptBase = action === "logs" ? "logs" : action;
  const extraArgs = action === "logs" ? ["--no-follow", "--tail", "240"] : [];

  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(targetDir, `${scriptBase}.ps1`), ...extraArgs]
    };
  }

  return {
    command: "sh",
    args: [path.join(targetDir, `${scriptBase}.sh`), ...extraArgs]
  };
}

async function runAction(action: DesktopAction) {
  if (activeProcess) {
    return { ok: false, message: "A desktop task is already running." };
  }

  const { targetDir } = await ensureStandalone();
  const { command, args } = scriptCommand(action, targetDir);
  emitLog("system", `\n$ ${[command, ...args].join(" ")}\n`);

  return await new Promise<{ ok: boolean; code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    const child = spawn(command, args, {
      cwd: targetDir,
      env: {
        ...process.env,
        ENV_FILE: ".env",
        NO_COLOR: "1"
      }
    });
    activeProcess = child;

    child.stdout?.on("data", (chunk: Buffer) => emitLog("stdout", chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => emitLog("stderr", chunk.toString("utf8")));
    child.on("error", (error) => {
      emitLog("stderr", `${error.message}\n`);
    });
    child.on("close", async (code, signal) => {
      activeProcess = null;
      emitLog("system", `\nTask ${action} finished with code ${String(code)}.\n`);
      emitSnapshot(await snapshot());
      resolve({ ok: code === 0, code, signal });
    });
  });
}

ipcMain.handle("desktop:getSnapshot", async () => snapshot());
ipcMain.handle("desktop:runAction", async (_event, action: DesktopAction) => runAction(action));
ipcMain.handle("desktop:openService", async () => {
  await shell.openExternal(SERVICE_URL);
  return { ok: true };
});
ipcMain.handle("desktop:openServiceDir", async () => {
  const { targetDir } = await ensureStandalone();
  await shell.openPath(targetDir);
  return { ok: true };
});
ipcMain.handle("desktop:openConfigFile", async () => {
  const { envFile } = await ensureStandalone();
  await shell.openPath(envFile);
  return { ok: true };
});

void app.whenReady().then(async () => {
  createWindow();
  try {
    await ensureStandalone();
    emitSnapshot(await snapshot());
  } catch (error) {
    emitLog("stderr", `${error instanceof Error ? error.message : String(error)}\n`);
    emitSnapshot(await snapshot());
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
