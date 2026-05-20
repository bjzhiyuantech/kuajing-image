#!/usr/bin/env node

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BACKUP_ROOT = "backups";
const DEFAULT_ENV_FILE = ".env";

const HELP = `Usage:
  node scripts/deployment-backup.mjs backup [--env-file <path>] [--output-dir <dir>] [--data-dir <dir>] [--downloads-dir <dir>]
  node scripts/deployment-backup.mjs restore --backup-dir <dir> [--env-file <path>] [--data-dir <dir>] [--downloads-dir <dir>]

Options:
  --env-file <path>       Env file to snapshot or read. Defaults to ${DEFAULT_ENV_FILE}.
  --output-dir <dir>      Backup root for backup mode. Defaults to ${DEFAULT_BACKUP_ROOT}.
  --backup-dir <dir>      Existing backup directory for restore mode.
  --data-dir <dir>        Data directory. Defaults to DATA_DIR from env or ./data.
  --downloads-dir <dir>   Downloads directory. Defaults to ./downloads.
  --skip-mysql            Skip optional mysqldump/mysql restore.
  --help, -h              Show this help.

Examples:
  node scripts/deployment-backup.mjs backup --env-file .env
  node scripts/deployment-backup.mjs restore --backup-dir backups/20260520-120000
`;

function parseArgs(argv) {
  if (argv[0] === "--help" || argv[0] === "-h") {
    return { help: true };
  }

  const [command, ...rest] = argv;
  const options = {
    command,
    envFile: DEFAULT_ENV_FILE,
    outputDir: DEFAULT_BACKUP_ROOT,
    skipMysql: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--skip-mysql") {
      options.skipMysql = true;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      options.envFile = arg.slice("--env-file=".length);
      continue;
    }
    if (arg === "--env-file") {
      options.envFile = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      options.backupDir = arg.slice("--backup-dir=".length);
      continue;
    }
    if (arg === "--backup-dir") {
      options.backupDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--data-dir=")) {
      options.dataDir = arg.slice("--data-dir=".length);
      continue;
    }
    if (arg === "--data-dir") {
      options.dataDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--downloads-dir=")) {
      options.downloadsDir = arg.slice("--downloads-dir=".length);
      continue;
    }
    if (arg === "--downloads-dir") {
      options.downloadsDir = readNextValue(rest, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readNextValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(REPO_ROOT, filePath);
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

function parseEnv(text) {
  const values = new Map();
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

async function copyFileStreaming(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await new Promise((resolve, reject) => {
    const reader = createReadStream(source);
    const writer = createWriteStream(target);
    reader.on("error", reject);
    writer.on("error", reject);
    writer.on("finish", resolve);
    reader.pipe(writer);
  });
}

async function copyDir(source, target) {
  if (!(await isDirectory(source))) return [];
  const copied = [];
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copied.push(...(await copyDir(sourcePath, targetPath)));
    } else if (entry.isFile()) {
      await copyFileStreaming(sourcePath, targetPath);
      copied.push(path.relative(target, targetPath));
    }
  }
  return copied;
}

function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[-:]/gu, "").replace(/\..+$/u, "").replace("T", "-");
}

function mysqlConfig(env) {
  return {
    host: env.get("MYSQL_HOST") || "127.0.0.1",
    port: env.get("MYSQL_PORT") || "3306",
    user: env.get("MYSQL_USER") || "gpt_image_canvas",
    password: env.get("MYSQL_PASSWORD") || "gpt_image_canvas",
    database: env.get("MYSQL_DATABASE") || "gpt_image_canvas"
  };
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return result.status === 0 || result.status === 1;
}

function mysqlEnv(config) {
  return {
    ...process.env,
    MYSQL_PWD: config.password
  };
}

async function pipeChildToFile(command, args, outputFile, env) {
  await mkdir(path.dirname(outputFile), { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    const writer = createWriteStream(outputFile);
    const stderr = [];

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    writer.on("error", (error) => {
      child.kill();
      reject(error);
    });
    child.stdout.pipe(writer);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}`));
    });
  });
}

async function pipeFileToChild(command, args, inputFile, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["pipe", "ignore", "pipe"] });
    const reader = createReadStream(inputFile);
    const stderr = [];

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    reader.on("error", (error) => {
      child.kill();
      reject(error);
    });
    child.stdin.on("error", reject);
    reader.pipe(child.stdin);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} exited with ${code}`));
    });
  });
}

async function dumpMysql(env, outputFile) {
  if (!commandAvailable("mysqldump")) {
    return { ok: false, reason: "mysqldump is not available" };
  }
  const config = mysqlConfig(env);
  const args = [
    `--host=${config.host}`,
    `--port=${config.port}`,
    `--user=${config.user}`,
    "--single-transaction",
    "--routines",
    "--triggers",
    config.database
  ];
  try {
    await pipeChildToFile("mysqldump", args, outputFile, mysqlEnv(config));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || "mysqldump failed" };
  }
}

async function restoreMysql(env, inputFile) {
  if (!commandAvailable("mysql")) {
    return { ok: false, reason: "mysql client is not available" };
  }
  const config = mysqlConfig(env);
  try {
    await pipeFileToChild("mysql", [`--host=${config.host}`, `--port=${config.port}`, `--user=${config.user}`, config.database], inputFile, mysqlEnv(config));
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message || "mysql restore failed" };
  }
}

async function backup(options) {
  const envFile = resolvePath(options.envFile);
  const envText = (await exists(envFile)) ? await readFile(envFile, "utf8") : "";
  const env = parseEnv(envText);
  const dataDir = resolvePath(options.dataDir || env.get("DATA_DIR") || "data");
  const downloadsDir = resolvePath(options.downloadsDir || "downloads");
  const backupDir = resolvePath(path.join(options.outputDir, timestamp()));
  const copied = [];

  await mkdir(backupDir, { recursive: true });
  if (await exists(envFile)) {
    await copyFileStreaming(envFile, path.join(backupDir, "config", path.basename(envFile)));
    copied.push(`config/${path.basename(envFile)}`);
  }
  if (await isDirectory(dataDir)) {
    await copyDir(dataDir, path.join(backupDir, "data"));
    copied.push("data/");
  }
  if (await isDirectory(downloadsDir)) {
    await copyDir(downloadsDir, path.join(backupDir, "downloads"));
    copied.push("downloads/");
  }

  let mysqlDump = null;
  if (!options.skipMysql) {
    const dumpResult = await dumpMysql(env, path.join(backupDir, "mysql.sql"));
    if (dumpResult.ok) {
      mysqlDump = "mysql.sql";
      copied.push(mysqlDump);
    } else {
      mysqlDump = { skipped: dumpResult.reason };
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    envFile: path.relative(REPO_ROOT, envFile),
    dataDir: path.relative(REPO_ROOT, dataDir),
    downloadsDir: path.relative(REPO_ROOT, downloadsDir),
    mysqlDump,
    files: copied
  };
  await writeFile(path.join(backupDir, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`OK backup: ${path.relative(REPO_ROOT, backupDir)}`);
  for (const item of copied) console.log(`- ${item}`);
  if (mysqlDump && typeof mysqlDump === "object") console.log(`WARN MySQL dump skipped: ${mysqlDump.skipped}`);
}

async function restore(options) {
  if (!options.backupDir) throw new Error("restore requires --backup-dir");
  const backupDir = resolvePath(options.backupDir);
  if (!(await isDirectory(backupDir))) throw new Error(`backup directory not found: ${backupDir}`);

  const envFile = resolvePath(options.envFile);
  const envText = (await exists(envFile)) ? await readFile(envFile, "utf8") : "";
  const env = parseEnv(envText);
  const dataDir = resolvePath(options.dataDir || env.get("DATA_DIR") || "data");
  const downloadsDir = resolvePath(options.downloadsDir || "downloads");

  const backupConfigDir = path.join(backupDir, "config");
  if (await isDirectory(backupConfigDir)) {
    console.log(`INFO config snapshot exists at ${path.relative(REPO_ROOT, backupConfigDir)}; restore it manually after reviewing secrets.`);
  }
  if (await isDirectory(path.join(backupDir, "data"))) {
    await copyDir(path.join(backupDir, "data"), dataDir);
    console.log(`OK restored data to ${path.relative(REPO_ROOT, dataDir)}`);
  }
  if (await isDirectory(path.join(backupDir, "downloads"))) {
    await copyDir(path.join(backupDir, "downloads"), downloadsDir);
    console.log(`OK restored downloads to ${path.relative(REPO_ROOT, downloadsDir)}`);
  }

  const mysqlDumpFile = path.join(backupDir, "mysql.sql");
  if (!options.skipMysql && (await exists(mysqlDumpFile))) {
    const result = await restoreMysql(env, mysqlDumpFile);
    if (result.ok) console.log("OK restored MySQL dump");
    else console.log(`WARN MySQL restore skipped: ${result.reason}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.command) {
    process.stdout.write(HELP);
    return;
  }
  if (options.command === "backup") {
    await backup(options);
    return;
  }
  if (options.command === "restore") {
    await restore(options);
    return;
  }
  throw new Error(`Unknown command: ${options.command}`);
}

main().catch((error) => {
  console.error(`Deployment backup failed: ${error.message}`);
  console.error("");
  console.error(HELP.trimEnd());
  process.exit(1);
});
