export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

const TOKEN_KEY = "frontdesk.token";

export type Priority = "low" | "normal" | "urgent";

export type Triage = {
  category: string;
  priority: Priority;
  summary: string;
  confidence: number;
  promptVersion: string;
  attempts: number;
};

export type Ticket = {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  preview: string;
  channel: string;
  status: string;
  receivedAt: string;
  triage: Triage | null;
  draft: { body: string; approved: boolean } | null;
};

export type LlmCall = {
  id: string;
  purpose: string;
  attempt: number;
  outcome: string;
  promptVersion: string;
  model: string;
  cacheHit: boolean;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number;
  ttfbMs: number | null;
  error: string | null;
  createdAt: string;
};

export type TicketDetail = Ticket & { body: string; calls: LlmCall[] };

export type Usage = {
  calls: number;
  spentMicros: number;
  savedMicros: number;
  cacheHits: number;
  retries: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  recent: Pick<LlmCall, "id" | "purpose" | "outcome" | "attempt" | "cacheHit" | "costMicros" | "latencyMs" | "promptVersion" | "createdAt">[];
};

export type PromptOption = { version: string; label: string; note: string };

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  organizationId: string;
  organizationName: string;
};

export type AuthResponse = { accessToken: string; user: AuthUser };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const tokenStore = {
  read: () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY)),
  write: (token: string) => window.localStorage.setItem(TOKEN_KEY, token),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = tokenStore.read();

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) throw new ApiError(response.status, await readErrorMessage(response));
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    return message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export type StreamHandlers = {
  onToken?: (token: string) => void;
  onAttempt?: (attempt: { attempt: number; outcome: string; error?: string; delayMs?: number }) => void;
  onDone?: (payload: unknown) => void;
  onFailed?: (message: string) => void;
};

/**
 * Consumes a server-sent event stream.
 *
 * The buffering matters as much on this side as it does on the server: a single
 * event is not guaranteed to arrive in one chunk, and a reader that parses each
 * chunk independently drops whatever straddles the boundary. The failure is
 * intermittent and looks like the server sending corrupt data.
 */
export async function streamEvents(
  path: string,
  handlers: StreamHandlers,
  init?: RequestInit,
): Promise<void> {
  const token = tokenStore.read();

  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) throw new ApiError(response.status, await readErrorMessage(response));
  if (!response.body) throw new ApiError(500, "The server sent no stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Events are separated by a blank line; keep the trailing fragment.
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      let event = "message";
      let data = "";

      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }

      if (!data) continue;

      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }

      if (event === "token") handlers.onToken?.((payload as { token: string }).token);
      else if (event === "attempt") handlers.onAttempt?.(payload as never);
      else if (event === "done") handlers.onDone?.(payload);
      else if (event === "failed") handlers.onFailed?.((payload as { message: string }).message);
    }
  }
}

/** Dollars, from the integer micros the API reports. */
export function dollars(micros: number, fractionDigits = 4): string {
  return `$${(micros / 1_000_000).toFixed(fractionDigits)}`;
}
