/**
 * Multi-provider LLM abstraction for Grasp.
 *
 * Design principle: LOCAL-FIRST, CLOUD OPT-IN.
 * - Nothing here is ever called for code parsing (that stays deterministic AST).
 * - Semantic passes (doc/media extraction, NL graph Q&A, ADR generation) are the
 *   only callers, and they degrade gracefully to deterministic output when no
 *   provider is configured.
 * - When no provider is explicitly selected, we auto-detect a local Ollama daemon
 *   before ever reaching for a cloud key, so the default posture stays local.
 *
 * Backends: anthropic, openai, gemini, deepseek, kimi (moonshot), azure (openai),
 * bedrock (aws), ollama (local). All calls use the global `fetch` (Node >=18) —
 * no vendor SDKs, so this adds zero install weight.
 */

import * as crypto from 'crypto';

export type LLMRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMCompleteOptions {
  /** Optional system prompt (merged into provider-native slot). */
  system?: string;
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Ask the provider for strict JSON output where supported. */
  json?: boolean;
  signal?: AbortSignal;
}

export interface LLMResult {
  text: string;
  provider: string;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(opts: LLMCompleteOptions): Promise<LLMResult>;
}

export interface ProviderConfig {
  /** anthropic | openai | gemini | deepseek | kimi | azure | bedrock | ollama */
  provider?: string;
  model?: string;
  apiKey?: string;
  /** Base URL override (ollama host, azure endpoint, self-hosted gateways). */
  baseUrl?: string;
  /** AWS region for bedrock. */
  region?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  kimi: 'moonshot-v1-8k',
  azure: 'gpt-4o-mini',
  bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  ollama: 'llama3.1',
};

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function splitSystem(opts: LLMCompleteOptions): { system?: string; messages: LLMMessage[] } {
  const systemFromMessages = opts.messages.filter((m) => m.role === 'system').map((m) => m.content);
  const rest = opts.messages.filter((m) => m.role !== 'system');
  const system = [opts.system, ...systemFromMessages].filter(Boolean).join('\n\n') || undefined;
  return { system, messages: rest };
}

async function readError(res: Response): Promise<string> {
  let body = '';
  try {
    body = await res.text();
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 400)}` : ''}`;
}

// ---------------------------------------------------------------------------
// Anthropic (native Messages API)
// ---------------------------------------------------------------------------
class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  constructor(readonly model: string, private apiKey: string, private baseUrl = 'https://api.anthropic.com') {}

  async complete(opts: LLMCompleteOptions): Promise<LLMResult> {
    const { system, messages } = splitSystem(opts);
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
        ...(system ? { system } : {}),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`anthropic: ${await readError(res)}`);
    const json = (await res.json()) as any;
    const text = (json.content || []).map((b: any) => b.text || '').join('') || '';
    return { text, provider: this.name, model: this.model };
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible family: openai, deepseek, kimi, ollama, azure, custom
// ---------------------------------------------------------------------------
class OpenAICompatProvider implements LLMProvider {
  constructor(
    readonly name: string,
    readonly model: string,
    private endpoint: string,
    private headers: Record<string, string>,
  ) {}

  async complete(opts: LLMCompleteOptions): Promise<LLMResult> {
    const { system, messages } = splitSystem(opts);
    const msgs = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const res = await fetch(this.endpoint, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify({
        model: this.model,
        messages: msgs,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`${this.name}: ${await readError(res)}`);
    const json = (await res.json()) as any;
    const text = json.choices?.[0]?.message?.content ?? '';
    return { text, provider: this.name, model: this.model };
  }
}

// ---------------------------------------------------------------------------
// Google Gemini (generateContent)
// ---------------------------------------------------------------------------
class GeminiProvider implements LLMProvider {
  readonly name = 'gemini';
  constructor(readonly model: string, private apiKey: string) {}

  async complete(opts: LLMCompleteOptions): Promise<LLMResult> {
    const { system, messages } = splitSystem(opts);
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          maxOutputTokens: opts.maxTokens ?? 1024,
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`gemini: ${await readError(res)}`);
    const json = (await res.json()) as any;
    const text = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || '').join('') || '';
    return { text, provider: this.name, model: this.model };
  }
}

// ---------------------------------------------------------------------------
// AWS Bedrock (SigV4-signed InvokeModel, Anthropic message body)
// ---------------------------------------------------------------------------
class BedrockProvider implements LLMProvider {
  readonly name = 'bedrock';
  constructor(
    readonly model: string,
    private accessKey: string,
    private secretKey: string,
    private region: string,
    private sessionToken?: string,
  ) {}

  async complete(opts: LLMCompleteOptions): Promise<LLMResult> {
    const { system, messages } = splitSystem(opts);
    const host = `bedrock-runtime.${this.region}.amazonaws.com`;
    const path = `/model/${encodeURIComponent(this.model)}/invoke`;
    const payload = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.2,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const headers = sigV4Sign({
      method: 'POST',
      host,
      path,
      region: this.region,
      service: 'bedrock',
      payload,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      sessionToken: this.sessionToken,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
    });
    const res = await fetch(`https://${host}${path}`, {
      method: 'POST',
      signal: opts.signal,
      headers,
      body: payload,
    });
    if (!res.ok) throw new Error(`bedrock: ${await readError(res)}`);
    const json = (await res.json()) as any;
    const text = (json.content || []).map((b: any) => b.text || '').join('') || '';
    return { text, provider: this.name, model: this.model };
  }
}

/** Minimal AWS Signature V4 for a single JSON POST. */
function sigV4Sign(p: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  payload: string;
  accessKey: string;
  secretKey: string;
  sessionToken?: string;
  headers: Record<string, string>;
}): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const hash = (data: string) => crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  const hmac = (key: crypto.BinaryLike | Buffer, data: string) =>
    crypto.createHmac('sha256', key).update(data, 'utf8').digest();

  const allHeaders: Record<string, string> = {
    ...p.headers,
    host: p.host,
    'x-amz-date': amzDate,
    ...(p.sessionToken ? { 'x-amz-security-token': p.sessionToken } : {}),
  };
  const sortedKeys = Object.keys(allHeaders)
    .map((k) => k.toLowerCase())
    .sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${allHeaders[Object.keys(allHeaders).find((h) => h.toLowerCase() === k)!].trim()}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const payloadHash = hash(p.payload);
  const canonicalRequest = [p.method, p.path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${p.region}/${p.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${p.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, p.region);
  const kService = hmac(kRegion, p.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  return {
    ...allHeaders,
    Authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ---------------------------------------------------------------------------
// Resolution / auto-detection
// ---------------------------------------------------------------------------

function ollamaHost(cfg?: ProviderConfig): string {
  return (cfg?.baseUrl || env('OLLAMA_HOST') || 'http://localhost:11434').replace(/\/$/, '');
}

/** Probe a local Ollama daemon; returns true if reachable. */
export async function ollamaAvailable(cfg?: ProviderConfig): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 600);
    const res = await fetch(`${ollamaHost(cfg)}/api/tags`, { signal: ctl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

function buildProvider(name: string, cfg: ProviderConfig): LLMProvider | null {
  const model = cfg.model || env('GRASP_LLM_MODEL') || DEFAULT_MODELS[name] || 'unknown';
  switch (name) {
    case 'anthropic': {
      const key = cfg.apiKey || env('ANTHROPIC_API_KEY');
      return key ? new AnthropicProvider(model, key, cfg.baseUrl) : null;
    }
    case 'openai': {
      const key = cfg.apiKey || env('OPENAI_API_KEY');
      const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      return key ? new OpenAICompatProvider('openai', model, `${base}/chat/completions`, { Authorization: `Bearer ${key}` }) : null;
    }
    case 'deepseek': {
      const key = cfg.apiKey || env('DEEPSEEK_API_KEY');
      const base = (cfg.baseUrl || 'https://api.deepseek.com/v1').replace(/\/$/, '');
      return key ? new OpenAICompatProvider('deepseek', model, `${base}/chat/completions`, { Authorization: `Bearer ${key}` }) : null;
    }
    case 'kimi':
    case 'moonshot': {
      const key = cfg.apiKey || env('MOONSHOT_API_KEY') || env('KIMI_API_KEY');
      const base = (cfg.baseUrl || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
      return key ? new OpenAICompatProvider('kimi', model, `${base}/chat/completions`, { Authorization: `Bearer ${key}` }) : null;
    }
    case 'azure': {
      const key = cfg.apiKey || env('AZURE_OPENAI_API_KEY');
      const endpoint = (cfg.baseUrl || env('AZURE_OPENAI_ENDPOINT') || '').replace(/\/$/, '');
      const apiVersion = env('AZURE_OPENAI_API_VERSION') || '2024-06-01';
      const deployment = env('AZURE_OPENAI_DEPLOYMENT') || model;
      if (!key || !endpoint) return null;
      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      return new OpenAICompatProvider('azure', model, url, { 'api-key': key });
    }
    case 'bedrock': {
      const accessKey = cfg.apiKey || env('AWS_ACCESS_KEY_ID');
      const secretKey = env('AWS_SECRET_ACCESS_KEY');
      const region = cfg.region || env('AWS_REGION') || env('AWS_DEFAULT_REGION') || 'us-east-1';
      if (!accessKey || !secretKey) return null;
      return new BedrockProvider(model, accessKey, secretKey, region, env('AWS_SESSION_TOKEN'));
    }
    case 'gemini':
    case 'google': {
      const key = cfg.apiKey || env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
      return key ? new GeminiProvider(model, key) : null;
    }
    case 'ollama': {
      const base = ollamaHost(cfg);
      return new OpenAICompatProvider('ollama', model, `${base}/v1/chat/completions`, { Authorization: 'Bearer ollama' });
    }
    default:
      return null;
  }
}

/**
 * Resolve an LLM provider from explicit config, then env, then local auto-detect.
 * Returns null when no provider is available — callers MUST handle this and fall
 * back to deterministic behaviour (keeps Grasp usable with zero credentials).
 */
export async function resolveProvider(cfg: ProviderConfig = {}): Promise<LLMProvider | null> {
  const explicit = cfg.provider || env('GRASP_LLM_PROVIDER');
  if (explicit) return buildProvider(explicit.toLowerCase(), cfg);

  // Auto-detect: prefer a locally-running Ollama (local-first) before cloud keys.
  if (await ollamaAvailable(cfg)) return buildProvider('ollama', cfg);

  // Then fall back to whichever cloud key is present.
  for (const name of ['anthropic', 'openai', 'gemini', 'deepseek', 'kimi', 'azure', 'bedrock']) {
    const p = buildProvider(name, cfg);
    if (p) return p;
  }
  return null;
}

/** Human-readable list of which backends are currently usable (for diagnostics). */
export async function availableProviders(cfg: ProviderConfig = {}): Promise<string[]> {
  const out: string[] = [];
  if (await ollamaAvailable(cfg)) out.push('ollama');
  for (const name of ['anthropic', 'openai', 'gemini', 'deepseek', 'kimi', 'azure', 'bedrock']) {
    if (buildProvider(name, cfg)) out.push(name);
  }
  return out;
}
