import { Router } from "express";
import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { authMiddleware } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { prisma } from "../lib/prisma.js";

const assistantRouter = Router();

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8090";
const buildAgentUrl = (path: string) =>
  `${AGENT_SERVICE_URL.replace(/\/+$/, "")}${path}`;
let assistantSchemaReady = false;

type AgentResponsePayload = {
  answer?: string;
  citations?: unknown;
  used_tools?: unknown;
  debug?: unknown;
  loops?: unknown;
};

const getBodyRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const getRequiredMessage = (body: Record<string, unknown>): string | null => {
  const raw = body.message;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureAssistantSchema = async () => {
  if (assistantSchemaReady) return;
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssistantMessageRole') THEN
        CREATE TYPE "AssistantMessageRole" AS ENUM ('user', 'assistant', 'tool', 'system');
      END IF;
    END
    $$;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AssistantThread" (
      "id" TEXT PRIMARY KEY,
      "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "title" TEXT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "lastMessageAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AssistantMessage" (
      "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "threadId" TEXT NOT NULL REFERENCES "AssistantThread"("id") ON DELETE CASCADE,
      "role" "AssistantMessageRole" NOT NULL,
      "content" TEXT NOT NULL,
      "citations" JSONB NULL,
      "toolCalls" JSONB NULL,
      "model" TEXT NULL,
      "inputTokens" INTEGER NULL,
      "outputTokens" INTEGER NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AssistantThread_userId_updatedAt_idx"
    ON "AssistantThread"("userId", "updatedAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AssistantThread_userId_lastMessageAt_idx"
    ON "AssistantThread"("userId", "lastMessageAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AssistantMessage_threadId_createdAt_idx"
    ON "AssistantMessage"("threadId", "createdAt");
  `);

  assistantSchemaReady = true;
};

const createUpstreamThread = async (): Promise<string> => {
  const upstream = await fetch(buildAgentUrl("/threads"), { method: "POST" });
  const text = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`Upstream thread creation failed: ${text || upstream.statusText}`);
  }
  const contentType = upstream.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const parsed = JSON.parse(text) as { thread_id?: string };
    if (!parsed.thread_id) throw new Error("Upstream did not return thread_id");
    return parsed.thread_id;
  }
  const threadId = text.trim();
  if (!threadId) throw new Error("Upstream thread response empty");
  return threadId;
};

const ensureOwnedThread = async (
  userId: number,
  body: Record<string, unknown>,
  title?: string
): Promise<{ threadId: string; created: boolean }> => {
  const requested = body.conversation_id;
  if (typeof requested === "string" && requested.trim().length > 0) {
    const existing = await prisma.assistantThread.findFirst({
      where: { id: requested, userId },
      select: { id: true },
    });
    if (!existing) {
      const err = new Error("conversation_id not found");
      (err as Error & { status?: number }).status = 404;
      throw err;
    }
    return { threadId: existing.id, created: false };
  }

  const threadId = await createUpstreamThread();
  await prisma.assistantThread.create({
    data: { id: threadId, userId, title: title?.trim() || null },
  });
  return { threadId, created: true };
};

const persistUserMessage = async (threadId: string, message: string) => {
  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        threadId,
        role: "user",
        content: message,
      },
    }),
    prisma.assistantThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
};

const persistAssistantMessage = async (
  threadId: string,
  payload: AgentResponsePayload | null,
  fallbackContent: string
) => {
  const answer =
    (payload && typeof payload.answer === "string" ? payload.answer : "") ||
    fallbackContent;
  const cleanAnswer = answer.trim();
  if (!cleanAnswer) return;

  await prisma.$transaction([
    prisma.assistantMessage.create({
      data: {
        threadId,
        role: "assistant",
        content: cleanAnswer,
        citations: payload?.citations ?? undefined,
        toolCalls: payload?.used_tools ?? undefined,
        model: null,
      },
    }),
    prisma.assistantThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
};

assistantRouter.get(
  "/threads",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureAssistantSchema();
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const threads = await prisma.assistantThread.findMany({
        where: { userId },
        orderBy: { lastMessageAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          lastMessageAt: true,
          _count: { select: { messages: true } },
        },
      });

      return res.status(200).json({
        items: threads.map((t) => ({
          thread_id: t.id,
          title: t.title,
          created_at: t.createdAt.toISOString(),
          updated_at: t.updatedAt.toISOString(),
          last_message_at: t.lastMessageAt.toISOString(),
          message_count: t._count.messages,
        })),
      });
    } catch (error) {
      logger.error("Assistant thread list failed:", error);
      return res.status(500).json({ message: "Assistant thread list failed" });
    }
  }
);

assistantRouter.get(
  "/threads/:threadId/messages",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureAssistantSchema();
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const threadId = req.params.threadId;
      const thread = await prisma.assistantThread.findFirst({
        where: { id: threadId, userId },
        select: { id: true },
      });
      if (!thread) {
        return res.status(404).json({ message: "thread not found" });
      }

      const limitRaw = Number(req.query.limit ?? 200);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 500)
        : 200;

      const messages = await prisma.assistantMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: {
          id: true,
          role: true,
          content: true,
          citations: true,
          toolCalls: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          createdAt: true,
        },
      });

      return res.status(200).json({
        thread_id: threadId,
        items: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          tool_calls: m.toolCalls,
          model: m.model,
          input_tokens: m.inputTokens,
          output_tokens: m.outputTokens,
          created_at: m.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      logger.error("Assistant message list failed:", error);
      return res.status(500).json({ message: "Assistant message list failed" });
    }
  }
);

assistantRouter.post(
  "/threads",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureAssistantSchema();
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const body = getBodyRecord(req.body);
      const title =
        typeof body.title === "string" && body.title.trim().length > 0
          ? body.title.trim()
          : undefined;

      const threadId = await createUpstreamThread();
      const thread = await prisma.assistantThread.create({
        data: { id: threadId, userId, title: title || null },
        select: { id: true, createdAt: true },
      });

      return res.status(200).json({
        thread_id: thread.id,
        created_at: thread.createdAt.toISOString(),
      });
    } catch (error) {
      logger.error("Assistant thread creation failed:", error);
      return res.status(500).json({ message: "Assistant thread creation failed" });
    }
  }
);

assistantRouter.post(
  "/query",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await ensureAssistantSchema();
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const body = getBodyRecord(req.body);
      const message = getRequiredMessage(body);
      if (!message) {
        return res.status(400).json({ message: "message is required" });
      }

      const { threadId } = await ensureOwnedThread(userId, body);
      await persistUserMessage(threadId, message);

      const upstreamBody = { ...body, message, conversation_id: threadId };
      const upstream = await fetch(buildAgentUrl("/query"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upstreamBody),
      });

      const text = await upstream.text();
      const contentType = upstream.headers.get("content-type") || "";

      if (!upstream.ok) {
        return res.status(upstream.status).json({
          message: "Assistant query failed",
          details: text || upstream.statusText,
          conversation_id: threadId,
        });
      }

      if (!contentType.includes("application/json")) {
        await persistAssistantMessage(threadId, null, text);
        return res.status(200).json({ answer: text, conversation_id: threadId });
      }

      const parsed = JSON.parse(text) as AgentResponsePayload;
      await persistAssistantMessage(threadId, parsed, "");
      return res.status(200).json({
        ...parsed,
        conversation_id: threadId,
      });
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status) {
        return res.status(status).json({ message: (error as Error).message });
      }
      logger.error("Assistant query proxy failed:", error);
      return res.status(500).json({ message: "Assistant query proxy failed" });
    }
  }
);

assistantRouter.post(
  "/stream",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    let threadId: string | null = null;
    try {
      await ensureAssistantSchema();
      const userId = req.user?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const body = getBodyRecord(req.body);
      const message = getRequiredMessage(body);
      if (!message) {
        return res.status(400).json({ message: "message is required" });
      }

      const ensured = await ensureOwnedThread(userId, body);
      threadId = ensured.threadId;
      await persistUserMessage(threadId, message);

      const upstreamBody = { ...body, message, conversation_id: threadId };
      const abortController = new AbortController();
      req.on("close", () => abortController.abort());

      const upstream = await fetch(buildAgentUrl("/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(upstreamBody),
        signal: abortController.signal,
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        return res.status(upstream.status).json({
          message: "Assistant stream failed",
          details: text || upstream.statusText,
          conversation_id: threadId,
        });
      }

      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Conversation-Id", threadId);
      res.flushHeaders();

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let assistantText = "";
      let finalPayload: AgentResponsePayload | null = null;

      const consumeSseBlock = (block: string) => {
        const lines = block.split("\n");
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }
        if (dataLines.length === 0) return;
        const dataRaw = dataLines.join("\n");
        let parsed: any = null;
        try {
          parsed = JSON.parse(dataRaw);
        } catch {
          parsed = null;
        }

        if (eventName === "message_delta" && parsed && typeof parsed.content === "string") {
          assistantText += parsed.content;
          return;
        }
        if (eventName === "message_complete" && parsed && typeof parsed === "object") {
          finalPayload = parsed as AgentResponsePayload;
          if (typeof finalPayload.answer === "string" && finalPayload.answer.trim().length > 0) {
            assistantText = finalPayload.answer;
          }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            res.write(value);
            sseBuffer += decoder.decode(value, { stream: true });
            while (true) {
              const idx = sseBuffer.indexOf("\n\n");
              if (idx === -1) break;
              const block = sseBuffer.slice(0, idx);
              sseBuffer = sseBuffer.slice(idx + 2);
              consumeSseBlock(block);
            }
          }
        }
        sseBuffer += decoder.decode();
        if (sseBuffer.trim().length > 0) {
          consumeSseBlock(sseBuffer);
        }
      } finally {
        reader.releaseLock();
      }

      await persistAssistantMessage(threadId, finalPayload, assistantText);
      res.end();
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status && !res.headersSent) {
        return res.status(status).json({ message: (error as Error).message });
      }
      logger.error("Assistant stream proxy failed:", error);
      if (!res.headersSent) {
        return res.status(500).json({ message: "Assistant stream proxy failed" });
      }
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: "Assistant stream proxy failed",
          conversation_id: threadId,
        })}\n\n`
      );
      res.end();
    }
  }
);

export default assistantRouter;
