export const BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) ||
  "https://interview-bot-b.vercel.app";
export const PROJECT_ID = "AI-Interview";

function url(path: string) {
  return `${BACKEND_URL}${path}`;
}

export type Language = "ru" | "en" | "tr";

export type DimensionKey =
  | "D1" | "D2" | "D3" | "D4" | "D5"
  | "D6" | "D7" | "D8" | "D9" | "D10";

export interface SessionState {
  token: string;
  projectId: string;
  language: Language | null;
  finished: boolean;
  currentDimension: DimensionKey | null;
  turnCount: number;
  coverage: Record<DimensionKey, { covered: boolean; turnCount: number }>;
}

export async function createSession(): Promise<{ token: string }> {
  const res = await fetch(url("/survey/public-session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: PROJECT_ID }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Failed to create session");
  }
  return res.json();
}

export async function setLanguage(
  token: string,
  language: Language
): Promise<{ intro?: string }> {
  const res = await fetch(url(`/survey/${token}/language`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Failed to set language");
  }
  return res.json();
}

export async function submitDemographics(
  token: string,
  data: Record<string, string>
): Promise<{ intro?: string }> {
  const res = await fetch(url(`/survey/${token}/demographics`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Failed to submit demographics");
  }
  return res.json();
}

// ── Streaming send ────────────────────────────────────────────────────────────
export interface StreamResult {
  dimension: DimensionKey | null;
  finished: boolean;
}

export async function sendMessageStream(
  token: string,
  message: string,
  onChunk: (chunk: string) => void
): Promise<StreamResult> {
  const res = await fetch(url(`/survey/${token}/message/stream`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Server error");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: StreamResult = { dimension: null, finished: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.chunk) onChunk(data.chunk);
        if (data.done) {
          result = {
            dimension: data.dimension ?? null,
            finished: data.finished ?? false,
          };
        }
      } catch (e) {
        console.warn("[SSE] Failed to parse line:", line, e);
      }    }
  }

  return result;
}

export async function getSession(token: string): Promise<SessionState> {
  const res = await fetch(url(`/survey/${token}`));
  if (!res.ok) throw new Error("Session not found");
  return res.json();
}
