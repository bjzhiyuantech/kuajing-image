import { pathToFileURL } from "node:url";

const host = process.env.HOST ?? "127.0.0.1";
const parsedPort = Number.parseInt(process.env.PORT ?? "8787", 10);

export const serverConfig = {
  host,
  port: Number.isNaN(parsedPort) ? 8787 : parsedPort
};

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entryUrl && import.meta.url === entryUrl) {
  console.log(`API scaffold ready at ${serverConfig.host}:${serverConfig.port}`);
}
