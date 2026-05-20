import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type DesktopAction = "install" | "start" | "stop" | "status" | "logs" | "smoke";
type LogStream = "stdout" | "stderr" | "system";

const MUTABLE_TOP_LEVEL = new Set([".env", "backups", "data", "downloads", "images", "secrets"]);
const DOCKER_CANDIDATES =
  process.platform === "win32"
    ? [
        "docker.exe",
        "docker",
        "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
        "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker"
      ]
    : ["/usr/local/bin/docker", "/opt/homebrew/bin/docker", "/Applications/Docker.app/Contents/Resources/bin/docker", "docker"];

const DESKTOP_ENV_DEFAULTS: Record<string, string> = {
  DEPLOYMENT_PROFILE: "local",
  DEPLOYMENT_PROFILE_NAME: "商图 AI 单机版",
  DEPLOYMENT_TARGET: "desktop",
  HOST: "127.0.0.1",
  PORT: "8787",
  PUBLIC_PORT: "8787",
  DATA_DIR: "./data",
  OPENAI_IMAGE_MODEL: "gpt-image-2",
  OPENAI_IMAGE_TIMEOUT_MS: "1200000",
  SEEDANCE_MODEL: "doubao-seedance-2-0-fast-260128",
  MYSQL_HOST: "mysql",
  MYSQL_PORT: "3306",
  MYSQL_USER: "gpt_image_canvas",
  MYSQL_PASSWORD: "gpt_image_canvas",
  MYSQL_DATABASE: "gpt_image_canvas",
  MYSQL_ROOT_PASSWORD: "root",
  JWT_SECRET: "",
  ADMIN_EMAIL: "",
  ADMIN_PASSWORD: "",
  ADMIN_DISPLAY_NAME: "Administrator",
  ALLOW_DEMO_AUTH: "false"
};

const CONFIG_FIELDS = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_IMAGE_MODEL",
  "ARK_API_KEY",
  "ARK_BASE_URL",
  "SEEDANCE_MODEL",
  "PORT",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_DISPLAY_NAME",
  "JWT_SECRET",
  "MYSQL_PASSWORD"
];

let mainWindow: BrowserWindow | null = null;
let activeProcess: ReturnType<typeof spawn> | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 980,
    minHeight: 720,
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
  await normalizeDesktopEnv(envFile);

  return { sourceDir, targetDir, envFile };
}

function extendedPath() {
  const extra = ["/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin"].join(path.delimiter);
  return `${process.env.PATH || ""}${path.delimiter}${extra}`;
}

function commandResult(command: string, args: string[], cwd = serviceDir()) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, PATH: extendedPath() },
    encoding: "utf8",
    timeout: 10_000
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    output: (result.stdout || result.stderr || result.error?.message || "").trim(),
    error: result.error?.message
  };
}

function resolveDockerCommand() {
  for (const candidate of DOCKER_CANDIDATES) {
    const result = commandResult(candidate, ["--version"]);
    if (result.ok) {
      return { command: candidate, version: result.output };
    }
  }
  return null;
}

function checkDocker() {
  const docker = resolveDockerCommand();
  if (!docker) {
    return {
      cliAvailable: false,
      engineAvailable: false,
      error: "未找到 Docker 命令。请安装 Docker Desktop，或确认 Docker 命令行工具已启用。"
    };
  }

  const engine = commandResult(docker.command, ["info", "--format", "{{.ServerVersion}}"]);
  return {
    cliAvailable: true,
    engineAvailable: engine.ok,
    command: docker.command,
    version: docker.version,
    engineVersion: engine.ok ? engine.output : undefined,
    error: engine.ok ? undefined : engine.output || "Docker Engine 未启动。请先打开 Docker Desktop。"
  };
}

function parseEnv(text: string) {
  const values = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function formatEnvValue(value: string) {
  if (!/[#\n\r]/u.test(value)) return value;
  return JSON.stringify(value);
}

function serializeEnv(values: Map<string, string>) {
  const known = new Set([...Object.keys(DESKTOP_ENV_DEFAULTS), ...CONFIG_FIELDS]);
  const groups: Array<[string, string[]]> = [
    ["# 桌面单机版常用配置", ["DEPLOYMENT_PROFILE", "DEPLOYMENT_PROFILE_NAME", "DEPLOYMENT_TARGET", "HOST", "PORT", "PUBLIC_PORT", "DATA_DIR"]],
    ["# 模型配置", ["OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_IMAGE_MODEL", "OPENAI_IMAGE_TIMEOUT_MS", "ARK_API_KEY", "ARK_BASE_URL", "SEEDANCE_MODEL"]],
    ["# 管理员账号", ["JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_DISPLAY_NAME", "ALLOW_DEMO_AUTH"]],
    ["# 内置 MySQL", ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE", "MYSQL_ROOT_PASSWORD"]],
    ["# 其他高级配置", [...values.keys()].filter((key) => !known.has(key)).sort()]
  ];

  const lines = [
    "# 由商图 AI 单机版桌面应用生成。",
    "# 常用配置请优先在桌面应用内修改；高级配置仍可手动编辑本文件。",
    ""
  ];
  const written = new Set<string>();

  for (const [title, keys] of groups) {
    const present = keys.filter((key) => values.has(key) || Object.hasOwn(DESKTOP_ENV_DEFAULTS, key));
    if (present.length === 0) continue;
    lines.push(title);
    for (const key of present) {
      written.add(key);
      lines.push(`${key}=${formatEnvValue(values.get(key) ?? "")}`);
    }
    lines.push("");
  }

  for (const [key, value] of values) {
    if (!written.has(key)) lines.push(`${key}=${formatEnvValue(value)}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function applyDesktopDefaults(env: Map<string, string>) {
  let changed = false;
  for (const [key, value] of Object.entries(DESKTOP_ENV_DEFAULTS)) {
    if (!env.has(key)) {
      env.set(key, value);
      changed = true;
    }
  }

  const mysqlHost = (env.get("MYSQL_HOST") || "").trim();
  if (!mysqlHost || mysqlHost === "127.0.0.1" || mysqlHost === "localhost") {
    env.set("MYSQL_HOST", "mysql");
    changed = true;
  }

  const port = normalizePort(env.get("PORT"));
  if (env.get("PORT") !== port || env.get("PUBLIC_PORT") !== port) {
    env.set("PORT", port);
    env.set("PUBLIC_PORT", port);
    changed = true;
  }

  if (!env.get("JWT_SECRET")) {
    env.set("JWT_SECRET", randomBytes(32).toString("hex"));
    changed = true;
  }

  return changed;
}

async function normalizeDesktopEnv(envFile: string) {
  const text = (await pathExists(envFile)) ? await readFile(envFile, "utf8") : "";
  const env = parseEnv(text);
  if (applyDesktopDefaults(env)) {
    await writeFile(envFile, serializeEnv(env), "utf8");
  }
}

async function readEnvFile() {
  const { envFile } = await ensureStandaloneWithoutEnvNormalization();
  const text = (await pathExists(envFile)) ? await readFile(envFile, "utf8") : "";
  const env = parseEnv(text);
  applyDesktopDefaults(env);
  return { envFile, env };
}

async function ensureStandaloneWithoutEnvNormalization() {
  const sourceDir = bundledStandaloneDir();
  const targetDir = serviceDir();
  if (!(await isDirectory(sourceDir))) {
    throw new Error(`standalone resources not found: ${sourceDir}`);
  }
  await mkdir(targetDir, { recursive: true });
  const envFile = path.join(targetDir, ".env");
  return { sourceDir, targetDir, envFile };
}

async function writeEnvFile(values: Map<string, string>) {
  const { envFile } = await ensureStandaloneWithoutEnvNormalization();
  await writeFile(envFile, serializeEnv(values), "utf8");
  return envFile;
}

async function getConfig() {
  await ensureStandalone();
  const { envFile, env } = await readEnvFile();
  const values: Record<string, string> = {};
  for (const key of CONFIG_FIELDS) values[key] = env.get(key) ?? "";
  return { envFile, values };
}

async function saveConfig(values: Record<string, string>) {
  await ensureStandalone();
  const { env } = await readEnvFile();
  for (const [key, value] of Object.entries(DESKTOP_ENV_DEFAULTS)) env.set(key, value);
  for (const key of CONFIG_FIELDS) {
    if (Object.hasOwn(values, key)) env.set(key, String(values[key] ?? "").trim());
  }
  applyDesktopDefaults(env);
  await writeEnvFile(env);
  emitSnapshot(await snapshot());
  return getConfig();
}

function normalizePort(value: string | undefined) {
  const parsed = Number(value || DESKTOP_ENV_DEFAULTS.PORT);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return DESKTOP_ENV_DEFAULTS.PORT;
  return String(parsed);
}

function serviceUrlFromEnv(env: Map<string, string>) {
  return `http://127.0.0.1:${normalizePort(env.get("PUBLIC_PORT") || env.get("PORT"))}`;
}

function dockerArgs(composeArgs: string[], envFile: string) {
  return ["compose", "-f", path.join(serviceDir(), "docker-compose.yml"), "--env-file", envFile, ...composeArgs];
}

function processEnvFromMap(env: Map<string, string>) {
  return {
    ...process.env,
    ...Object.fromEntries(env.entries()),
    PATH: extendedPath(),
    NO_COLOR: "1"
  };
}

async function smoke(baseUrl: string) {
  const checks = [
    ["/api/health", "health"],
    ["/api/deployment-profile", "deployment-profile"],
    ["/api/config", "config"]
  ] as const;
  for (const [route, label] of checks) {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}`);
    emitLog("stdout", `OK ${label}\n`);
  }
  emitLog("stdout", `自检通过：${baseUrl}\n`);
}

async function snapshot() {
  const targetDir = serviceDir();
  const sourceDir = bundledStandaloneDir();
  const installed = await pathExists(path.join(targetDir, "docker-compose.yml"));
  const bundled = await isDirectory(sourceDir);
  const { env } = await readEnvFile();
  return {
    appVersion: app.getVersion(),
    serviceUrl: serviceUrlFromEnv(env),
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

async function runAction(action: DesktopAction) {
  if (activeProcess) {
    return { ok: false, message: "A desktop task is already running." };
  }

  const { targetDir, envFile } = await ensureStandalone();
  const { env } = await readEnvFile();
  const docker = checkDocker();
  if (!docker.cliAvailable || !docker.engineAvailable || !docker.command) {
    emitLog("stderr", `${docker.error}\n`);
    return { ok: false, code: 1, signal: null };
  }

  if (action === "smoke") {
    try {
      await smoke(serviceUrlFromEnv(env));
      return { ok: true, code: 0, signal: null };
    } catch (error) {
      emitLog("stderr", `${error instanceof Error ? error.message : String(error)}\n`);
      return { ok: false, code: 1, signal: null };
    }
  }

  const argsByAction: Record<Exclude<DesktopAction, "smoke">, string[]> = {
    install: ["up", "-d", "--remove-orphans", "--build"],
    start: ["up", "-d", "--remove-orphans"],
    stop: ["down"],
    status: ["ps"],
    logs: ["logs", "--tail", "240"]
  };
  const command = docker.command;
  const args = dockerArgs(argsByAction[action], envFile);
  emitLog("system", `\n$ ${[command, ...args].join(" ")}\n`);

  return await new Promise<{ ok: boolean; code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    const child = spawn(command, args, {
      cwd: targetDir,
      env: processEnvFromMap(env)
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
ipcMain.handle("desktop:getConfig", async () => getConfig());
ipcMain.handle("desktop:saveConfig", async (_event, values: Record<string, string>) => saveConfig(values));
ipcMain.handle("desktop:generateSecret", async () => randomBytes(32).toString("hex"));
ipcMain.handle("desktop:runAction", async (_event, action: DesktopAction) => runAction(action));
ipcMain.handle("desktop:openService", async () => {
  const { env } = await readEnvFile();
  await shell.openExternal(serviceUrlFromEnv(env));
  return { ok: true };
});
ipcMain.handle("desktop:openDockerDownload", async () => {
  await shell.openExternal("https://www.docker.com/products/docker-desktop/");
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
