import axiosInstance from "@/lib/axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
const ASSISTANT_BASE_URL = `${BACKEND_URL.replace(/\/+$/, "")}/api/assistant`;

export type AssistantRole = "user" | "assistant" | "tool" | "system";

export interface AssistantThread {
  thread_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  message_count: number;
}

export interface AssistantThreadsResponse {
  items: AssistantThread[];
}

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  citations?: unknown;
  tool_calls?: unknown;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  created_at: string;
}

export interface AssistantMessagesResponse {
  thread_id: string;
  items: AssistantMessage[];
}

export interface CreateAssistantThreadRequest {
  title?: string;
}

export interface CreateAssistantThreadResponse {
  thread_id: string;
  created_at: string;
}

export interface AssistantQueryRequest {
  message: string;
  conversation_id?: string;
}

export interface AssistantQueryResponse {
  answer: string;
  citations?: unknown;
  used_tools?: unknown;
  debug?: unknown;
  loops?: unknown;
  conversation_id: string;
}

export interface AssistantStreamRequest {
  message: string;
  conversation_id?: string;
}

export interface AssistantStreamEvent {
  event: string;
  data: unknown;
}

export interface AssistantStreamResult {
  conversationId: string | null;
  answer: string;
  completion: unknown;
}

interface StreamOptions {
  signal?: AbortSignal;
  onEvent?: (event: AssistantStreamEvent) => void;
}

const parseSseBlock = (block: string): AssistantStreamEvent | null => {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  const dataRaw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(dataRaw) as unknown };
  } catch {
    return { event, data: dataRaw };
  }
};

const readErrorMessage = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text.trim()) return `Request failed (${response.status})`;
  try {
    const parsed = JSON.parse(text) as { message?: string; details?: string };
    if (parsed.message) return parsed.message;
    if (parsed.details) return parsed.details;
    return text;
  } catch {
    return text;
  }
};

export const getAssistantThreads = async (): Promise<AssistantThreadsResponse> => {
  const response = await axiosInstance.get<AssistantThreadsResponse>("/api/assistant/threads");
  return response.data;
};

export const getAssistantMessages = async (
  threadId: string,
  limit = 200
): Promise<AssistantMessagesResponse> => {
  const response = await axiosInstance.get<AssistantMessagesResponse>(
    `/api/assistant/threads/${threadId}/messages`,
    { params: { limit } }
  );
  return response.data;
};

export const createAssistantThread = async (
  payload: CreateAssistantThreadRequest = {}
): Promise<CreateAssistantThreadResponse> => {
  const response = await axiosInstance.post<CreateAssistantThreadResponse>(
    "/api/assistant/threads",
    payload
  );
  return response.data;
};

export const queryAssistant = async (
  payload: AssistantQueryRequest
): Promise<AssistantQueryResponse> => {
  const response = await axiosInstance.post<AssistantQueryResponse>("/api/assistant/query", payload);
  return response.data;
};

export const streamAssistant = async (
  payload: AssistantStreamRequest,
  options: StreamOptions = {}
): Promise<AssistantStreamResult> => {
  const response = await fetch(`${ASSISTANT_BASE_URL}/stream`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Origin": "Info",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  const conversationId =
    response.headers.get("x-conversation-id") || payload.conversation_id || null;

  if (!response.ok || !response.body) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let completion: unknown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      while (true) {
        const index = buffer.indexOf("\n\n");
        if (index < 0) break;
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        const parsed = parseSseBlock(block);
        if (!parsed) continue;

        options.onEvent?.(parsed);

        if (
          parsed.event === "message_delta" &&
          parsed.data &&
          typeof parsed.data === "object" &&
          "content" in parsed.data &&
          typeof parsed.data.content === "string"
        ) {
          answer += parsed.data.content;
          continue;
        }

        if (
          parsed.event === "message_complete" &&
          parsed.data &&
          typeof parsed.data === "object"
        ) {
          completion = parsed.data;
          if ("answer" in parsed.data && typeof parsed.data.answer === "string") {
            answer = parsed.data.answer;
          }
        }
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const trailing = parseSseBlock(buffer);
      if (trailing) options.onEvent?.(trailing);
    }
  } finally {
    reader.releaseLock();
  }

  return {
    conversationId,
    answer: answer.trim(),
    completion,
  };
};

