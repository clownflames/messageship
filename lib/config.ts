import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().trim().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const urlWithDefault = (value: string) => z.preprocess(emptyToUndefined, z.url().default(value));
const nodeEnv = z.preprocess(emptyToUndefined, z.enum(["development", "test", "production"]).default("development"));
const appName = z.preprocess(emptyToUndefined, z.string().trim().min(1).default("MessageShip"));
const graphVersion = z.preprocess(emptyToUndefined, z.string().regex(/^v\d+\.\d+$/).default("v21.0"));
const graphUrl = urlWithDefault("https://graph.facebook.com");
const emailFrom = z.preprocess(emptyToUndefined, z.string().email().default("MessageShip <noreply@example.com>"));
const databasePoolMax = z.preprocess(emptyToUndefined, z.coerce.number().int().positive().max(100).default(10));

const serverEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  APP_NAME: appName,
  NEXT_PUBLIC_APP_URL: urlWithDefault("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  BETTER_AUTH_URL: optionalUrl,
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  META_GRAPH_API_VERSION: graphVersion,
  META_GRAPH_API_URL: graphUrl,
  ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  QUEUE_WORKER_SECRET: z.preprocess(emptyToUndefined, z.string().min(24).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  EMAIL_FROM: emailFrom,
  DATABASE_POOL_MAX: databasePoolMax,
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && env.META_WEBHOOK_VERIFY_TOKEN && env.META_WEBHOOK_VERIFY_TOKEN.length < 8) {
    ctx.addIssue({
      code: "custom",
      path: ["META_WEBHOOK_VERIFY_TOKEN"],
      message: "META_WEBHOOK_VERIFY_TOKEN must be at least 8 characters in production",
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(): ServerEnv {
  return serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    META_GRAPH_API_VERSION: process.env.META_GRAPH_API_VERSION,
    META_GRAPH_API_URL: process.env.META_GRAPH_API_URL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    QUEUE_WORKER_SECRET: process.env.QUEUE_WORKER_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
  });
}

export function getAppUrl(): string {
  return getServerEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

export function getMetaConfig(): { version: string; apiUrl: string } {
  const env = getServerEnv();
  return {
    version: env.META_GRAPH_API_VERSION,
    apiUrl: env.META_GRAPH_API_URL,
  };
}

export function isProduction(): boolean {
  return getServerEnv().NODE_ENV === "production";
}
