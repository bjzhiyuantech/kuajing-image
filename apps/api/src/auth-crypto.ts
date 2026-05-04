import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { authConfig, modelConfig } from "./runtime.js";

const PASSWORD_KEY_LENGTH = 64;
const JWT_ALGORITHM = "HS256";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const SECRET_ENCRYPTION_VERSION = "enc:v1";

export interface JwtPayload {
  sub: string;
  workspaceId: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [algorithm, salt, expectedHash] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHash) {
    return false;
  }

  const actual = Buffer.from(scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("base64url"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signJwt(input: Omit<JwtPayload, "iat" | "exp">): string {
  const secret = requireJwtSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    ...input,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedHeader = base64UrlJson({
    alg: JWT_ALGORITHM,
    typ: "JWT"
  });
  const encodedPayload = base64UrlJson(payload);
  const signature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token: string): JwtPayload | undefined {
  const secret = authConfig.jwtSecret;
  if (!secret) {
    return undefined;
  }

  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    return undefined;
  }

  const expectedSignature = sign(`${encodedHeader}.${encodedPayload}`, secret);
  if (!safeEqual(signature, expectedSignature)) {
    return undefined;
  }

  const payload = parseJson(decodeBase64Url(encodedPayload));
  if (!isJwtPayload(payload) || payload.exp <= Math.floor(Date.now() / 1000)) {
    return undefined;
  }

  return payload;
}

export function requireJwtSecret(): string {
  if (!authConfig.jwtSecret) {
    throw new Error("JWT_SECRET is required for authentication.");
  }

  return authConfig.jwtSecret;
}

export function encryptSecret(plainText: string): string {
  if (!plainText) {
    return "";
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_ENCRYPTION_VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const parts = value.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== SECRET_ENCRYPTION_VERSION) {
    return value;
  }

  const decipher = createDecipheriv("aes-256-gcm", secretEncryptionKey(), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8");
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function secretEncryptionKey(): Buffer {
  return createHash("sha256").update(modelConfig.encryptionKey || requireJwtSecret()).digest();
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isJwtPayload(value: unknown): value is JwtPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<JwtPayload>;
  return (
    typeof payload.sub === "string" &&
    typeof payload.workspaceId === "string" &&
    (payload.role === "user" || payload.role === "admin") &&
    typeof payload.iat === "number" &&
    typeof payload.exp === "number"
  );
}
