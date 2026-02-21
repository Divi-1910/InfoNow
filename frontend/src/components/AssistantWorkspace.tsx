import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Loader2,
  Menu,
  MessageSquarePlus,
  Send,
  Sparkles,
  User,
  X,
  Hash,
  Wrench,
} from "lucide-react";
import {
  createAssistantThread,
  getAssistantMessages,
  getAssistantThreads,
  streamAssistant,
  type AssistantMessage,
  type AssistantRole,
  type AssistantThread,
} from "@/api/assistant";
import { getApiErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/useToast";

interface LocalAssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  created_at?: string;
}

const mapMessages = (items: AssistantMessage[]): LocalAssistantMessage[] =>
  items.map((item) => ({
    id: item.id,
    role: item.role,
    content: item.content,
    created_at: item.created_at,
  }));

const formatThreadTitle = (thread: AssistantThread): string => {
  if (thread.title && thread.title.trim().length > 0) return thread.title.trim();
  const stamp = new Date(thread.last_message_at || thread.created_at);
  return `Conversation · ${stamp.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
};

const getStreamText = (data: unknown): string | null => {
  if (!data || typeof data !== "object" || !("content" in data)) return null;
  return typeof data.content === "string" ? data.content : null;
};

const getToolName = (data: unknown): string => {
  if (!data || typeof data !== "object" || !("name" in data)) return "tool";
  return typeof data.name === "string" ? data.name.replace(/_/g, " ") : "tool";
};

// Markdown component for assistant messages
const MarkdownContent = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      h1: ({ children }) => <h1 className="text-[15px] font-semibold text-zinc-100 mt-3 mb-1 first:mt-0">{children}</h1>,
      h2: ({ children }) => <h2 className="text-[14px] font-semibold text-zinc-200 mt-3 mb-1 first:mt-0">{children}</h2>,
      h3: ({ children }) => <h3 className="text-[13px] font-semibold text-zinc-200 mt-2.5 mb-1 first:mt-0">{children}</h3>,
      p: ({ children }) => <p className="text-[13px] text-zinc-300 leading-relaxed mb-2 last:mb-0">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
      em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
      ul: ({ children }) => <ul className="list-disc list-outside pl-4 space-y-0.5 mb-2 text-[13px] text-zinc-300">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal list-outside pl-4 space-y-0.5 mb-2 text-[13px] text-zinc-300">{children}</ol>,
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      code: ({ children, className }) => {
        const isBlock = className?.includes("language-");
        return isBlock ? (
          <code className="block bg-zinc-950/80 border border-zinc-800/60 rounded-lg px-3 py-2 text-[12px] font-mono text-zinc-300 my-2 overflow-x-auto whitespace-pre">
            {children}
          </code>
        ) : (
          <code className="bg-zinc-800/60 rounded px-1.5 py-0.5 text-[12px] font-mono text-zinc-300">{children}</code>
        );
      },
      pre: ({ children }) => <pre className="my-2">{children}</pre>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-zinc-700 pl-3 my-2 text-zinc-400 italic">{children}</blockquote>
      ),
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:text-sky-300 underline underline-offset-2">
          {children}
        </a>
      ),
      hr: () => <hr className="border-zinc-800 my-3" />,
    }}
  >
    {content}
  </ReactMarkdown>
);

export const AssistantWorkspace = () => {
  const toast = useToast();
  const showErrorToast = toast.error;
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalAssistantMessage[]>([]);
  const [query, setQuery] = useState("");
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [isThreadDrawerOpen, setIsThreadDrawerOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Refs for streaming phase tracking (avoids stale closures in onEvent)
  const realStreamingStartedRef = useRef(false);
  const hasToolCallsRef = useRef(false);

  const selectedThread = useMemo(
    () => threads.find((t) => t.thread_id === selectedThreadId) ?? null,
    [threads, selectedThreadId],
  );
  const totalMessageCount = useMemo(
    () => threads.reduce((sum, t) => sum + t.message_count, 0),
    [threads],
  );

  const refreshThreads = useCallback(
    async (preferredThreadId?: string | null) => {
      setIsLoadingThreads(true);
      try {
        const response = await getAssistantThreads();
        setThreads(response.items);
        setSelectedThreadId((current) => {
          const target = preferredThreadId ?? current;
          if (target && response.items.some((item) => item.thread_id === target)) return target;
          return null;
        });
      } catch (error) {
        showErrorToast(getApiErrorMessage(error, "Failed to load assistant threads"));
      } finally {
        setIsLoadingThreads(false);
      }
    },
    [showErrorToast],
  );

  const refreshMessages = useCallback(
    async (threadId: string) => {
      setIsLoadingMessages(true);
      try {
        const response = await getAssistantMessages(threadId, 200);
        setMessages(mapMessages(response.items));
      } catch (error) {
        showErrorToast(getApiErrorMessage(error, "Failed to load conversation"));
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [showErrorToast],
  );

  useEffect(() => { refreshThreads(); }, [refreshThreads]);

  useEffect(() => {
    if (!selectedThreadId) { setMessages([]); return; }
    refreshMessages(selectedThreadId);
  }, [selectedThreadId, refreshMessages]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  const handleCreateThread = async () => {
    if (isStreaming) return;
    try {
      const thread = await createAssistantThread();
      setThreads((prev) => [
        { thread_id: thread.thread_id, title: null, created_at: thread.created_at, updated_at: thread.created_at, last_message_at: thread.created_at, message_count: 0 },
        ...prev,
      ]);
      setSelectedThreadId(thread.thread_id);
      setMessages([]);
      setStatusText(null);
      setActiveToolName(null);
      setIsThreadDrawerOpen(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (error) {
      showErrorToast(getApiErrorMessage(error, "Failed to start a new conversation"));
    }
  };

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setIsThreadDrawerOpen(false);
  };

  const handleSend = async () => {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;
    if (!selectedThreadId) {
      toast.info("Create and select a thread first");
      return;
    }

    const userMessage: LocalAssistantMessage = { id: `user-${Date.now()}`, role: "user", content: trimmed };
    const assistantMessageId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, userMessage, { id: assistantMessageId, role: "assistant", content: "" }]);
    setQuery("");
    setIsStreaming(true);
    setStatusText("Thinking...");
    setActiveToolName(null);
    realStreamingStartedRef.current = false;
    hasToolCallsRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await streamAssistant(
        { message: trimmed, conversation_id: selectedThreadId },
        {
          signal: controller.signal,
          onEvent: ({ event, data }) => {
            // Tool call started — show which tool is running, clear pre-tool status text
            if (event === "tool_call") {
              hasToolCallsRef.current = true;
              const name = getToolName(data);
              setActiveToolName(name);
              setStatusText(`Using ${name}...`);
              // Clear any pre-tool "thinking" content from the bubble
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMessageId ? { ...m, content: "" } : m)
              );
              return;
            }

            // Tool result came back
            if (event === "tool_result") {
              setActiveToolName(null);
              setStatusText("Processing results...");
              return;
            }

            // Streaming text delta
            if (event === "message_delta") {
              const delta = getStreamText(data);
              if (!delta) return;

              // Heuristic: long sentences (>30 chars) before real streaming = status/thinking messages
              // Once short token streaming starts (or after tool results), it's the real answer
              if (!realStreamingStartedRef.current) {
                if (delta.length > 30 && !hasToolCallsRef.current) {
                  // Pre-tool long sentence = status message, don't put in bubble
                  setStatusText(delta);
                  return;
                }
                // Short chunk = real streaming has begun
                realStreamingStartedRef.current = true;
                setStatusText(null);
                setActiveToolName(null);
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, content: m.content + delta } : m
                )
              );
            }
          },
        },
      );

      // On complete, use the final clean answer
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantMessageId) return m;
          if (m.content.trim().length > 0) return m;
          return { ...m, content: result.answer || "I could not generate a response for that request." };
        })
      );

      const resolvedThreadId = result.conversationId ?? selectedThreadId;
      if (resolvedThreadId) {
        setSelectedThreadId(resolvedThreadId);
        await refreshMessages(resolvedThreadId);
      }
      await refreshThreads(resolvedThreadId);
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: "I could not complete that response. Please try again." }
            : m
        )
      );
      showErrorToast(getApiErrorMessage(error, "Assistant request failed"));
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      setStatusText(null);
      setActiveToolName(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSend();
  };

  const canSend = Boolean(selectedThreadId) && !isStreaming && query.trim().length > 0;

  const ThreadRail = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`${mobile ? "h-full" : "h-full min-h-0"} flex flex-col gap-3`}>
      <div className="grid grid-cols-2 gap-2 shrink-0">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-3 py-2.5 text-center">
          <p className="text-lg font-light text-white tabular-nums">{threads.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">Threads</p>
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-3 py-2.5 text-center">
          <p className="text-lg font-light text-white tabular-nums">{totalMessageCount}</p>
          <p className="text-[10px] uppercase tracking-wider text-zinc-600 mt-0.5">Messages</p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleCreateThread}
        disabled={isStreaming}
        className="shrink-0 w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-900/80 hover:bg-zinc-800/80 px-3 py-2.5 text-[13px] font-medium text-zinc-200 disabled:opacity-50 transition-colors"
      >
        <MessageSquarePlus className="w-4 h-4" />
        New Thread
      </button>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5 pr-0.5">
        {isLoadingThreads && (
          <div className="flex items-center gap-2 text-[12px] text-zinc-600 px-1 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading...
          </div>
        )}
        {!isLoadingThreads && threads.length === 0 && (
          <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/40 px-3 py-4 text-center">
            <p className="text-[12px] text-zinc-500">No conversations yet</p>
            <p className="text-[11px] text-zinc-600 mt-1">Create a thread to begin</p>
          </div>
        )}
        {threads.map((thread) => {
          const active = thread.thread_id === selectedThreadId;
          return (
            <button
              key={thread.thread_id}
              type="button"
              onClick={() => handleSelectThread(thread.thread_id)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                active
                  ? "border-sky-500/30 bg-sky-500/[0.08]"
                  : "border-zinc-800/50 bg-zinc-950/30 hover:bg-zinc-900/60 hover:border-zinc-700/50"
              }`}
            >
              <div className="flex items-start gap-2">
                <Hash className={`w-3 h-3 mt-0.5 shrink-0 ${active ? "text-sky-400" : "text-zinc-600"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-[13px] leading-snug line-clamp-2 ${active ? "text-sky-100" : "text-zinc-300"}`}>
                    {formatThreadTitle(thread)}
                  </p>
                  <p className="text-[11px] text-zinc-600 mt-1">
                    {thread.message_count} {thread.message_count === 1 ? "message" : "messages"}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-950/90">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.06),transparent_55%)]" />

      <div className="relative grid h-full min-h-0 grid-rows-[minmax(0,1fr)] p-3 md:p-4 gap-3">
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 md:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">

          {/* Thread Rail */}
          <motion.aside
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08, duration: 0.3 }}
            className="hidden min-h-0 md:block"
          >
            <ThreadRail />
          </motion.aside>

          {/* Chat Panel */}
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            className="min-h-0 min-w-0 rounded-xl border border-zinc-800/50 bg-zinc-900/20 flex flex-col overflow-hidden"
          >
            {/* Chat Header */}
            <div className="shrink-0 border-b border-zinc-800/50 bg-zinc-900/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-200 line-clamp-1">
                    {selectedThread ? formatThreadTitle(selectedThread) : "Infiya"}
                  </p>
                  {selectedThread && (
                    <p className="text-[11px] text-zinc-600 leading-none mt-0.5">
                      {selectedThread.message_count} messages
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsThreadDrawerOpen(true)}
                  className="md:hidden flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800/70 transition-colors"
                >
                  <Menu className="w-3.5 h-3.5" />
                  Threads
                </button>
                <button
                  type="button"
                  onClick={handleCreateThread}
                  disabled={isStreaming}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-zinc-800/70 disabled:opacity-50 transition-colors"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New</span>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {!selectedThreadId && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="h-full flex flex-col items-center justify-center gap-4 text-center px-4"
                >
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-sky-400" />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-300">Welcome to Infiya</p>
                    <p className="text-[13px] text-zinc-600 mt-1.5 max-w-[280px] leading-relaxed">
                      Create a new thread and start asking about today's news, trends, and events.
                    </p>
                  </div>
                </motion.div>
              )}

              {selectedThreadId && isLoadingMessages && (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                </div>
              )}

              {selectedThreadId && !isLoadingMessages && messages.length === 0 && !isStreaming && (
                <div className="h-full flex items-center justify-center text-[13px] text-zinc-600 text-center px-6">
                  Ask Infiya anything to start this conversation.
                </div>
              )}

              {selectedThreadId && !isLoadingMessages && messages.map((message) => {
                const isUser = message.role === "user";
                const isAssistant = message.role === "assistant";
                const isEmpty = !message.content.trim();

                return (
                  <div
                    key={message.id}
                    className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                    )}
                    <div
                      className={`max-w-[84%] rounded-2xl px-4 py-3 ${
                        isUser
                          ? "bg-white text-black text-[13px] leading-relaxed rounded-br-sm"
                          : isAssistant
                            ? "border border-zinc-800/60 bg-zinc-900/60 rounded-bl-sm"
                            : "border border-zinc-800/50 bg-zinc-950/60 text-zinc-500 text-xs italic"
                      }`}
                    >
                      {isUser ? (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      ) : isAssistant ? (
                        isEmpty && isStreaming ? (
                          // Still waiting for content — show animated dots
                          <span className="flex items-center gap-1 py-0.5">
                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </span>
                        ) : (
                          <MarkdownContent content={message.content} />
                        )
                      ) : (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      )}
                    </div>
                    {isUser && (
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center shrink-0 mt-1">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input + Status */}
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.28 }}
              className="shrink-0 border-t border-zinc-800/50 bg-zinc-900/50 backdrop-blur-sm p-3"
            >
              {/* Status bar — tool call or status text */}
              <AnimatePresence>
                {isStreaming && (activeToolName || statusText) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-2 text-[11px] mb-2 px-1 py-1">
                      {activeToolName ? (
                        <>
                          <div className="w-4 h-4 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <Wrench className="w-2.5 h-2.5 text-amber-400" />
                          </div>
                          <span className="text-amber-400 font-medium capitalize">{activeToolName}</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-zinc-500 shrink-0" />
                          <span className="text-zinc-500 line-clamp-1">{statusText}</span>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={isStreaming || !selectedThreadId}
                  placeholder={selectedThreadId ? "Ask Infiya anything..." : "Create a thread to start"}
                  rows={2}
                  className="flex-1 min-w-0 resize-none rounded-xl border border-zinc-800/70 bg-zinc-950/80 px-3.5 py-2.5 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 focus:bg-zinc-950 disabled:opacity-50 transition-all"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  className="h-10 w-10 shrink-0 rounded-xl bg-white text-black flex items-center justify-center hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {isStreaming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </motion.form>
          </motion.section>
        </div>
      </div>

      {/* Mobile Thread Drawer */}
      <AnimatePresence>
        {isThreadDrawerOpen && (
          <div className="fixed inset-0 z-[70] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsThreadDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="relative h-full w-[85vw] max-w-[340px] border-r border-zinc-800/60 bg-zinc-950/98 p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-400" />
                  <span className="text-[14px] font-semibold text-zinc-200">Threads</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsThreadDrawerOpen(false)}
                  className="rounded-lg border border-zinc-700/60 p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-[calc(100%-60px)]">
                <ThreadRail mobile />
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AssistantWorkspace;
