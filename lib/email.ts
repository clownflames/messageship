import { getServerEnv, isProduction } from "@/lib/config";

export type AuthEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendAuthEmail(message: AuthEmail): Promise<void> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    if (isProduction()) {
      throw new Error("RESEND_API_KEY is required for transactional email");
    }
    console.info(`[email] provider not configured for ${message.to}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
}
