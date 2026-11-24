import "dotenv/config";

import { z } from "zod";

const chatId = z.string().regex(/^-?\d+$/, "Chat IDs must be integer strings");

const envSchema = z.object({
  RPC_URLS: z.string().min(1).transform((value) =>
    value
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
  ),
  OPENSEA_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_AUTHORIZED_CHAT_IDS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(",")
        .map((chatIdValue) => chatId.parse(chatIdValue.trim()))
        .map((chatIdValue) => BigInt(chatIdValue)),
    ),
  WALLET_ENCRYPTION_KEY: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

export const env = envSchema.parse(process.env);
