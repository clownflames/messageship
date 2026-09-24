# MessageShip TypeScript SDK

The SDK is a small, strongly typed client for the MessageShip API. It uses a scoped API key and never stores credentials.

## Installation

```bash
npm install @messageship/sdk
```

## Usage

```ts
import { Whatsapp } from "@messageship/sdk";

const whatsapp = new Whatsapp("sk_live_xxxxxxxxx", {
  baseUrl: "https://your-app.example.com/api/v1",
  defaultWhatsappAccountId: "acct_123",
});

await whatsapp.messages.sendText({
  to: "15550102000",
  text: "Hello from MessageShip",
});
```

The `baseUrl` option is optional for same-origin browser usage and defaults to `/api/v1`. External applications should provide the HTTPS URL of their MessageShip deployment.

## Resources

- `messages.sendText`, `sendImage`, `sendVideo`, `sendAudio`, `sendDocument`, `sendLocation`, `sendTemplate`, and `list`
- `conversations.list` and `conversations.get`
- `contacts.list`, `contacts.get`, and `contacts.create`
- `templates.list` and `templates.create`
- `webhooks.list` and `webhooks.create`

All methods throw `WhatsappApiError` for API errors and `WhatsappValidationError` for missing required input.
