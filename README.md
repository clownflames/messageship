# MessageShip

MessageShip is a multi-tenant WhatsApp Cloud API management SaaS. It provides one secure workspace for multiple business numbers, conversations, contacts, templates, campaigns, AI workflows, and a scoped developer API.

## Product capabilities

- Better Auth email/password authentication with secure sessions, recovery, and verification hooks.
- Automatic workspace provisioning and server-side tenant authorization.
- Multiple WhatsApp Cloud API accounts with encrypted access tokens.
- Meta Graph API service layer for messages, media, templates, phone numbers, and business profiles.
- Signed, idempotent Meta webhook processing with inbound messages and delivery status updates.
- Real-time inbox updates over authenticated SSE.
- Customer-service window enforcement: free-form replies are blocked outside the open window and require an approved template.
- Contacts, CSV preview/import, template lifecycle management, and WhatsApp-style template preview.
- Queue-backed campaigns with recipient state, retries, scheduling, and Meta delivery statistics.
- Provider-agnostic AI adapters for OpenAI, DeepSeek, Anthropic, Gemini, OpenRouter, Ollama, and OpenAI-compatible endpoints.
- Database-backed automation engine with incoming-message, condition, AI, message, HTTP, delay, and data nodes.
- Hashed, show-once, scoped API keys and signed customer webhook deliveries.
- SDK, API documentation, analytics, audit logs, usage records, and operational notifications foundation.

## Architecture

```text
src-equivalent application layout
app/                    App Router pages, Server Actions, and Route Handlers
components/             shadcn-style UI and product components
lib/auth/               session, workspace, and tenant resolution
lib/whatsapp/           Meta client, policy, webhook verification/processing
lib/ai/                 provider interface and adapters
lib/queue/              database-backed job queue
services/               business services; UI does not call Meta or AI directly
db/schema.ts            normalized Drizzle PostgreSQL schema
sdk/                    strongly typed Whatsapp.ts client
```

The application is intentionally provider-agnostic. Meta access tokens, AI keys, webhook secrets, and automation secrets are encrypted or hashed at rest and are not returned by list/read APIs.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer
- A Meta app with WhatsApp Cloud API configured for production use
- A Resend API key for transactional email in production
- A queue worker process or scheduled HTTP worker for campaigns, webhooks, and automations

## Installation

```bash
npm install
cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

`db:seed` is optional. It creates a clearly marked demo workspace with demo contacts, conversations, messages, templates, a campaign, and an automation. Demo records are not sent through Meta and demo messages are prefixed with `[DEMO DATA]`.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string beginning with `postgresql://` or `postgres://` |
| `BETTER_AUTH_SECRET` | Better Auth signing secret, at least 32 characters |
| `BETTER_AUTH_URL` | Canonical auth URL when different from the public app URL |
| `NEXT_PUBLIC_APP_URL` | Public application origin |
| `APP_NAME` | Product display name |
| `META_APP_ID` | Meta app ID used for media upload |
| `META_APP_SECRET` | Meta app secret used to verify webhook signatures |
| `META_WEBHOOK_VERIFY_TOKEN` | Token used during Meta webhook verification; at least 8 characters |
| `META_GRAPH_API_VERSION` | Graph API version, for example `v21.0` |
| `META_GRAPH_API_URL` | Graph API origin; defaults to `https://graph.facebook.com` |
| `ENCRYPTION_KEY` | 32-byte key encoded as 64 hex characters or base64 |
| `QUEUE_WORKER_SECRET` | Secret for the internal queue worker route |
| `RESEND_API_KEY` | Resend key for verification and reset email |
| `EMAIL_FROM` | Verified sender address |
| `DATABASE_POOL_MAX` | Maximum PostgreSQL pool size |

Generate an encryption key with:

```bash
openssl rand -base64 32
```

## Better Auth setup

The auth handler is mounted at `/api/auth/*` through `app/api/auth/[...all]/route.ts`. The Drizzle adapter uses the `user`, `session`, `account`, and `verification` tables in `db/schema.ts`.

For production:

1. Set a high-entropy `BETTER_AUTH_SECRET`.
2. Set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the HTTPS origin.
3. Configure `RESEND_API_KEY` and `EMAIL_FROM`.
4. Run the database migration before enabling registration.

New users receive a workspace through the Better Auth user-creation hook. Workspace IDs supplied by clients are never trusted; all protected services derive the organization from the authenticated session or API key.

## Meta WhatsApp setup

1. Create a Meta app and add the WhatsApp product.
2. Create or select a WhatsApp Business Account and phone number.
3. Create a permanent System User access token with the required WhatsApp permissions.
4. In MessageShip, open **WhatsApp accounts** and enter the account name, business ID, WABA ID, phone number ID, and token.
5. Configure the webhook callback URL as:

```text
https://your-app.example.com/api/webhooks/whatsapp
```

6. Subscribe to messages and message status events.
7. Set the same verification token in Meta and `META_WEBHOOK_VERIFY_TOKEN`.

The account connection flow calls Meta before saving the token. Tokens are encrypted with `ENCRYPTION_KEY` and are never returned to the browser.

## Messaging policy

MessageShip models the customer-service window as 24 hours from the most recent inbound message. Free-form text, media, location, and contact messages are only attempted inside that window. Outside it, the service returns a clear error requiring an approved template. Meta status webhooks are the source of truth for `sent`, `delivered`, `read`, and `failed` states.

## Queue worker

Campaign sends, automation runs, and outbound webhook deliveries are persisted in the `jobs` table. Run the worker from a trusted scheduler or worker host:

```bash
curl -X POST http://localhost:3000/api/internal/queue/process \
  -H "x-queue-secret: $QUEUE_WORKER_SECRET"
```

The included database queue is a safe single-instance baseline. For multi-instance production deployments, replace `claimNextJob` with a Redis/BullMQ, Cloud Tasks, or another distributed queue while retaining the service interfaces.

## Public API

Create a key under **Settings → Developer → API keys** or `POST /api/developer/api-keys`. Keys use the `sk_live_` prefix, are hashed with SHA-256, and are shown once.

All `/api/v1/*` routes use:

```text
Authorization: Bearer sk_live_xxxxxxxxx
```

Supported scopes include `messages:read`, `messages:write`, `contacts:read`, `contacts:write`, `templates:read`, `templates:write`, `campaigns:read`, `campaigns:write`, `webhooks:read`, and `webhooks:write`.

Core routes:

- `POST /api/v1/messages/send`
- `GET /api/v1/messages`
- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:id`
- `GET|POST /api/v1/contacts`
- `GET|PATCH|DELETE /api/v1/contacts/:id`
- `GET|POST /api/v1/templates`
- `GET|PATCH|DELETE /api/v1/templates/:id`
- `GET|POST /api/v1/campaigns`
- `GET|PATCH /api/v1/campaigns/:id`
- `GET|POST /api/v1/webhooks`
- `GET|PATCH|DELETE /api/v1/webhooks/:id`
- `GET|POST /api/v1/whatsapp-accounts`

Responses use this shape:

```json
{
  "success": true,
  "data": {}
}
```

Errors use this shape:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "A clear error message"
  }
}
```

Full examples are available at `/docs` and `/dashboard/developer/docs`.

## Whatsapp.ts SDK

The typed SDK source lives in `sdk/` and can be downloaded from **Settings → Developer → SDK**. It supports messages, conversations, contacts, templates, webhooks, typed errors, and runtime required-field validation.

```ts
import { Whatsapp } from "./Whatsapp";

const whatsapp = new Whatsapp("sk_live_xxxxxxxxx", {
  baseUrl: "https://your-app.example.com/api/v1",
});

await whatsapp.messages.sendText({
  whatsappAccountId: "acct_123",
  to: "15550102000",
  text: "Hello",
});
```

## AI providers

Provider keys are encrypted before storage. The automation engine depends only on the `AIProvider` interface, so adding a provider does not require changes to workflow components. Provider requests are made server-side and usage records are persisted for analytics.

## Webhook signatures

Customer webhooks include:

```text
X-Webhook-Signature: sha256=<hmac>
X-Webhook-Event: message.received
```

Verify the raw request body with the endpoint secret using constant-time HMAC-SHA256 comparison. Meta inbound webhooks are verified with `META_APP_SECRET` before processing and deduplicated using a provider event hash.

## Security checklist

- Server-side session and API-key authorization on every data path.
- Organization IDs derived from authenticated context, never request payloads.
- Zod validation at API, Server Action, webhook, and service boundaries.
- Encrypted Meta, AI, and automation credentials.
- Hashed API keys and show-once secrets.
- HTTPS-only customer webhook URLs and private-host blocking for automation HTTP nodes.
- Secure cookie configuration through Better Auth.
- Security headers in `next.config.ts`.
- Audit records for sensitive actions.
- No fabricated Meta delivery states or demo messages presented as real sends.

## Development commands

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
npm run db:seed
```

## Production deployment

1. Provision PostgreSQL and run `npm run db:migrate` during deployment.
2. Set every production environment variable from `.env.example`.
3. Use HTTPS for the public app, Meta callback, and customer webhook endpoints.
4. Run a persistent or scheduled queue worker with `QUEUE_WORKER_SECRET`.
5. Configure a transactional email provider and verified sender.
6. Use a distributed queue and shared SSE/event infrastructure when running multiple application instances.
7. Monitor webhook failures, queue depth, delivery errors, and database pool saturation.
8. Rotate `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, API keys, and webhook secrets according to your incident-response policy.

## Current implementation notes

The repository contains the complete vertical foundation rather than a UI-only prototype. External Meta and AI calls are intentionally not replaced with fake responses. Features that require a Meta app, provider account, email provider, or distributed queue return explicit configuration/external-service errors until those dependencies are supplied.
