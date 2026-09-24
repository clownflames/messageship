import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { authSchema } from "@/db/schema";
import { getServerEnv, isProduction } from "@/lib/config";
import { ensureWorkspaceForUser } from "@/lib/auth/workspace";
import { recordAudit } from "@/lib/security/audit";
import { sendAuthEmail } from "@/lib/email";

const env = getServerEnv();

export const auth = betterAuth({
  appName: env.APP_NAME,
  baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  trustedOrigins: Array.from(new Set([env.NEXT_PUBLIC_APP_URL, env.BETTER_AUTH_URL].filter((origin): origin is string => Boolean(origin)))),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Reset your MessageShip password",
        text: `Use this link to reset your password: ${url}`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "Verify your MessageShip email",
        text: `Verify your email address using this link: ${url}`,
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "memory",
  },
  advanced: {
    useSecureCookies: isProduction(),
    cookiePrefix: "messageship",
  },
  account: {
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await ensureWorkspaceForUser(createdUser.id, createdUser.email, createdUser.name);
        },
      },
    },
    session: {
      create: {
        after: async (createdSession) => {
          try {
            await recordAudit({ userId: createdSession.userId, action: "auth.login", resource: "session", resourceId: createdSession.id });
          } catch {
            return;
          }
        },
      },
      delete: {
        after: async (deletedSession) => {
          try {
            await recordAudit({ userId: deletedSession.userId, action: "auth.logout", resource: "session", resourceId: deletedSession.id });
          } catch {
            return;
          }
        },
      },
    },
  },
  plugins: [nextCookies()],
});
