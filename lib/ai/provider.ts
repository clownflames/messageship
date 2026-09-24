import { AppError } from "@/lib/errors";

export type AIProviderConfig = {
  apiKey: string;
  baseUrl?: string | null;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string | null;
};

export type AIGenerateInput = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
};

export type AIGenerateResult = {
  text: string;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};

export interface AIProvider {
  generateText(input: AIGenerateInput): Promise<AIGenerateResult>;
  streamText(input: AIGenerateInput): Promise<ReadableStream<Uint8Array>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireText(value: string | undefined, provider: string): string {
  if (!value) throw new AppError("EXTERNAL_SERVICE_ERROR", `${provider} returned an empty response`, 502);
  return value;
}

async function requestJson(url: string, init: RequestInit, provider: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new AppError("EXTERNAL_SERVICE_ERROR", `${provider} could not be reached`, 502);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : undefined;
    throw new AppError("EXTERNAL_SERVICE_ERROR", readString(error?.message) ?? `${provider} returned ${response.status}`, 502);
  }
  return body;
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); } });
}

export class OpenAICompatibleProvider implements AIProvider {
  protected readonly config: AIProviderConfig;
  protected readonly defaultBaseUrl: string;
  protected readonly providerName: string;

  constructor(config: AIProviderConfig, defaultBaseUrl: string, providerName: string) {
    this.config = config;
    this.defaultBaseUrl = defaultBaseUrl;
    this.providerName = providerName;
  }

  protected endpoint(): string {
    return `${(this.config.baseUrl ?? this.defaultBaseUrl).replace(/\/$/, "")}/chat/completions`;
  }

  protected headers(): HeadersInit {
    return { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" };
  }

  async generateText(input: AIGenerateInput): Promise<AIGenerateResult> {
    const body = await requestJson(this.endpoint(), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: this.config.model, messages: input.messages, temperature: input.temperature ?? this.config.temperature ?? 0.7, max_tokens: input.maxTokens ?? this.config.maxTokens }) }, this.providerName);
    const record = isRecord(body) ? body : {};
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const message = isRecord(choices[0]) && isRecord(choices[0].message) ? choices[0].message : undefined;
    const text = requireText(readString(message?.content), this.providerName);
    const usage = isRecord(record.usage) ? record.usage : undefined;
    return { text, model: this.config.model, usage: { inputTokens: readNumber(usage?.prompt_tokens), outputTokens: readNumber(usage?.completion_tokens) } };
  }

  async streamText(input: AIGenerateInput): Promise<ReadableStream<Uint8Array>> {
    const result = await this.generateText(input);
    return streamFromText(result.text);
  }
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: AIProviderConfig) { super(config, "https://api.deepseek.com/v1", "DeepSeek"); }
}

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(config: AIProviderConfig) { super(config, "https://openrouter.ai/api/v1", "OpenRouter"); }
}

export class OllamaProvider implements AIProvider {
  constructor(private readonly config: AIProviderConfig) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateResult> {
    const baseUrl = (this.config.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    const body = await requestJson(`${baseUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model, messages: input.messages, stream: false, options: { temperature: input.temperature ?? this.config.temperature ?? 0.7 } }) }, "Ollama");
    const record = isRecord(body) ? body : {};
    const message = isRecord(record.message) ? record.message : undefined;
    return { text: requireText(readString(message?.content), "Ollama"), model: this.config.model };
  }

  async streamText(input: AIGenerateInput): Promise<ReadableStream<Uint8Array>> {
    const result = await this.generateText(input);
    return streamFromText(result.text);
  }
}

export class AnthropicProvider implements AIProvider {
  constructor(private readonly config: AIProviderConfig) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateResult> {
    const baseUrl = (this.config.baseUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    const system = input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const messages = input.messages.filter((message) => message.role !== "system").map(({ role, content }) => ({ role, content }));
    const body = await requestJson(`${baseUrl}/v1/messages`, { method: "POST", headers: { "x-api-key": this.config.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: this.config.model, max_tokens: input.maxTokens ?? this.config.maxTokens ?? 1024, temperature: input.temperature ?? this.config.temperature ?? 0.7, system: system || undefined, messages }) }, "Anthropic");
    const record = isRecord(body) ? body : {};
    const content = Array.isArray(record.content) ? record.content : [];
    const text = content.map((item) => isRecord(item) ? readString(item.text) ?? "" : "").join("");
    const usage = isRecord(record.usage) ? record.usage : undefined;
    return { text: requireText(text, "Anthropic"), model: this.config.model, usage: { inputTokens: readNumber(usage?.input_tokens), outputTokens: readNumber(usage?.output_tokens) } };
  }

  async streamText(input: AIGenerateInput): Promise<ReadableStream<Uint8Array>> {
    return streamFromText((await this.generateText(input)).text);
  }
}

export class GeminiProvider implements AIProvider {
  constructor(private readonly config: AIProviderConfig) {}

  async generateText(input: AIGenerateInput): Promise<AIGenerateResult> {
    const baseUrl = (this.config.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const system = input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const contents = input.messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
    const body = await requestJson(`${baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": this.config.apiKey }, body: JSON.stringify({ contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature: input.temperature ?? this.config.temperature ?? 0.7, maxOutputTokens: input.maxTokens ?? this.config.maxTokens } }) }, "Gemini");
    const record = isRecord(body) ? body : {};
    const candidates = Array.isArray(record.candidates) ? record.candidates : [];
    const content = isRecord(candidates[0]) && isRecord(candidates[0].content) ? candidates[0].content : undefined;
    const parts = content && Array.isArray(content.parts) ? content.parts : [];
    const text = parts.map((part) => isRecord(part) ? readString(part.text) ?? "" : "").join("");
    return { text: requireText(text, "Gemini"), model: this.config.model };
  }

  async streamText(input: AIGenerateInput): Promise<ReadableStream<Uint8Array>> {
    return streamFromText((await this.generateText(input)).text);
  }
}

export function createAIProvider(kind: string, config: AIProviderConfig): AIProvider {
  if (kind === "anthropic") return new AnthropicProvider(config);
  if (kind === "gemini") return new GeminiProvider(config);
  if (kind === "ollama") return new OllamaProvider(config);
  if (kind === "deepseek") return new DeepSeekProvider(config);
  if (kind === "openrouter") return new OpenRouterProvider(config);
  return new OpenAICompatibleProvider(config, "https://api.openai.com/v1", "OpenAI");
}
