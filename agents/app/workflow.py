from __future__ import annotations

import json
import operator
from typing import Any, TypedDict
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from typing_extensions import Annotated

from .config import settings
from .models import AgentQueryRequest, AgentQueryResponse, Citation
from .tools import ALL_TOOLS


class AgentState(TypedDict):
    messages: Annotated[list[Any], operator.add]
    request: dict[str, Any]
    used_tools: list[str]
    loops: int
    citations: list[dict[str, Any]]


SYSTEM_PROMPT = """
You are Infiya, a platform-wide AI assistant for news and video insights.

Mission:
- Convert retrieved information into actionable intelligence.
- Always answer: what happened, why it matters, and what to do next.

Grounding rules:
- Use tool outputs as the factual source of truth.
- Do not invent facts, data_point_id values, links, timestamps, or quotes.
- If evidence is weak/conflicting/incomplete, say so explicitly.
- If a tool fails, mention it briefly and continue with a fallback path.

Tool strategy (minimum viable retrieval):
- Start with `hybrid_os_search` for most factual questions.
- Use `keyword_os_search` for exact entities, phrases, names, or identifiers.
- Use `vector_os_search` for thematic or conceptual questions.
- Use `get_trending_content` for "what is trending / right now / latest" intents.
- Use `get_full_content` only for top shortlisted items (max 3) when deeper context is needed.
- Use `search_web` only when internal retrieval is clearly insufficient.
- Avoid repeated near-identical tool calls.

Response style:
- Default to rich mode unless user requests concise mode.
- Structure rich responses as:
  1) Direct answer (1-3 lines)
  2) Why this matters
  3) Deeper context / implications
  4) Practical takeaway or next step
- Keep language clear, analytical, and user-facing.
- Avoid fluff and generic filler.

Citation policy:
- If claims are supported by retrieved data, end with `### Sources`.
- Source format:
  - `- <data_point_id> | <title>`
- Include only sources actually used in the current turn.
- If no reliable sources are available, state that clearly instead of fabricating citations.
"""


class InfiyaAgentWorkflow:
    def __init__(self, checkpointer: AsyncPostgresSaver | None = None) -> None:
        if not settings.agent_openai_api_key:
            raise ValueError("AGENT_OPENAI_API_KEY is required.")
        self.llm = ChatOpenAI(
            api_key=settings.agent_openai_api_key,
            base_url=settings.agent_openai_base_url,
            model=settings.agent_model,
            temperature=settings.agent_model_temperature,
            max_retries=1,
            timeout=120,
            streaming=True,
        )
        self.tool_node = ToolNode(ALL_TOOLS)
        self.checkpointer = checkpointer
        self.graph = self._build_graph().compile(checkpointer=checkpointer)

    def _tool_progress_message(self, tool_name: str, started: bool) -> str:
        if started:
            start_messages = {
                "hybrid_os_search": "Searching across news and videos for the best matches...",
                "keyword_os_search": "Looking for exact keyword matches...",
                "vector_os_search": "Finding semantically related content...",
                "search_web": "Checking external sources for added context...",
                "get_full_content": "Opening full source content for deeper context...",
                "get_trending_content": "Gathering current trending signals...",
            }
            return start_messages.get(tool_name, f"Running {tool_name}...")

        done_messages = {
            "hybrid_os_search": "Search results are in. Ranking the strongest matches...",
            "keyword_os_search": "Keyword matches found. Merging signals now...",
            "vector_os_search": "Semantic matches found. Merging signals now...",
            "search_web": "External results received. Validating relevance...",
            "get_full_content": "Full content loaded. Extracting key points...",
            "get_trending_content": "Trending signals loaded. Incorporating them now...",
        }
        return done_messages.get(tool_name, f"Completed {tool_name}. Integrating results...")

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(AgentState)
        graph.add_node("agent", self._agent_node)
        graph.add_node("tools", self._tools_node)
        graph.add_edge(START, "agent")
        graph.add_conditional_edges(
            "agent",
            self._route_after_agent,
            {"tools": "tools", "end": END},
        )
        graph.add_edge("tools", "agent")
        return graph

    def _request_context(self, request: dict[str, Any]) -> str:
        runtime_context = {
            "scope": "platform-wide",
            "default_top_k": settings.agent_default_top_k,
            "conversation_id": request.get("conversation_id"),
        }
        return f"Runtime context: {json.dumps(runtime_context, ensure_ascii=True)}"

    def _agent_node(self, state: AgentState) -> AgentState:
        messages = state["messages"]
        has_system = any(isinstance(m, SystemMessage) for m in messages)
        if not has_system:
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                SystemMessage(content=self._request_context(state["request"])),
            ] + messages
        llm_with_tools = self.llm.bind_tools(ALL_TOOLS)
        response = llm_with_tools.invoke(messages)
        return {
            "messages": [response],
            "request": state["request"],
            "used_tools": state.get("used_tools", []),
            "loops": state.get("loops", 0),
            "citations": state.get("citations", []),
        }

    def _parse_tool_citations(self, tool_message: ToolMessage) -> list[dict[str, Any]]:
        citations: list[dict[str, Any]] = []
        raw = str(tool_message.content or "")
        try:
            payload = json.loads(raw)
        except Exception:
            return citations

        items = payload.get("items")
        if isinstance(items, list):
            for item in items[:10]:
                if not isinstance(item, dict):
                    continue
                data_point_id = item.get("data_point_id")
                if not data_point_id:
                    continue
                citations.append(
                    {
                        "data_point_id": data_point_id,
                        "title": item.get("title") or "Untitled",
                        "source_type": item.get("source_type") or "unknown",
                        "score": item.get("score"),
                        "url": item.get("url"),
                        "snippet": item.get("snippet"),
                    }
                )
            return citations

        if "id" in payload and "content" in payload:
            content = payload.get("content") or {}
            title = ""
            source_type = payload.get("type", "unknown")
            if isinstance(content, dict):
                title = content.get("title", "")
            citations.append(
                {
                    "data_point_id": payload.get("id"),
                    "title": title or "Untitled",
                    "source_type": source_type,
                    "url": content.get("url") if isinstance(content, dict) else None,
                    "snippet": payload.get("enriched", {}).get("summary")
                    if isinstance(payload.get("enriched"), dict)
                    else None,
                    "score": None,
                }
            )
        return citations

    def _tools_node(self, state: AgentState) -> AgentState:
        result = self.tool_node.invoke(state)
        used_tools = list(state.get("used_tools", []))
        citations = list(state.get("citations", []))
        seen = {c.get("data_point_id") for c in citations if c.get("data_point_id")}

        for msg in result["messages"]:
            if hasattr(msg, "name") and msg.name and msg.name not in used_tools:
                used_tools.append(msg.name)
            if isinstance(msg, ToolMessage):
                parsed = self._parse_tool_citations(msg)
                for c in parsed:
                    key = c.get("data_point_id")
                    if key and key not in seen:
                        seen.add(key)
                        citations.append(c)

        return {
            "messages": result["messages"],
            "request": state["request"],
            "used_tools": used_tools,
            "loops": state.get("loops", 0) + 1,
            "citations": citations[:20],
        }

    def _route_after_agent(self, state: AgentState) -> str:
        last = state["messages"][-1]
        has_tool_calls = hasattr(last, "tool_calls") and bool(last.tool_calls)
        if has_tool_calls and state.get("loops", 0) < settings.agent_max_tool_loops:
            return "tools"
        return "end"

    def _final_answer(self, messages: list[Any]) -> str:
        for msg in reversed(messages):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content if isinstance(msg.content, str) else str(msg.content)
        return "I could not produce an answer."

    def _final_citations(self, state: AgentState) -> list[Citation]:
        out: list[Citation] = []
        for c in state.get("citations", []):
            if not c.get("data_point_id"):
                continue
            out.append(
                Citation(
                    data_point_id=str(c.get("data_point_id")),
                    title=str(c.get("title") or "Untitled"),
                    source_type=str(c.get("source_type") or "unknown"),
                    score=float(c["score"]) if c.get("score") is not None else None,
                    url=c.get("url"),
                    snippet=c.get("snippet"),
                )
            )
        return out[:8]

    def _graph_config(self, req: AgentQueryRequest) -> dict[str, Any]:
        thread_id = req.conversation_id or f"ephemeral-{uuid4()}"
        return {"configurable": {"thread_id": thread_id}}

    async def run(self, req: AgentQueryRequest) -> AgentQueryResponse:
        initial: AgentState = {
            "messages": [HumanMessage(content=req.message)],
            "request": req.model_dump(),
            "used_tools": [],
            "loops": 0,
            "citations": [],
        }
        config = self._graph_config(req)
        final = await self.graph.ainvoke(initial, config=config)
        messages = final.get("messages", [])
        return AgentQueryResponse(
            answer=self._final_answer(messages),
            citations=self._final_citations(final),
            used_tools=final.get("used_tools", []),
            loops=final.get("loops", 0),
            debug={"message_count": len(messages)},
        )

    async def stream(self, req: AgentQueryRequest):
        initial: AgentState = {
            "messages": [HumanMessage(content=req.message)],
            "request": req.model_dump(),
            "used_tools": [],
            "loops": 0,
            "citations": [],
        }
        config = self._graph_config(req)
        final_state: dict[str, Any] | None = None
        emitted_plan_hint = False
        async for event in self.graph.astream_events(initial, config=config, version="v2"):
            etype = event.get("event")
            if etype == "on_chain_start":
                name = event.get("name")
                if name == "agent" and not emitted_plan_hint:
                    emitted_plan_hint = True
                    yield {
                        "event": "message_delta",
                        "data": {"content": "Thinking through your question and planning the best retrieval path..."},
                    }
            if etype == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                content = getattr(chunk, "content", "")
                if content:
                    if isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text":
                                text = part.get("text", "")
                                if text:
                                    yield {"event": "message_delta", "data": {"content": text}}
                    else:
                        yield {"event": "message_delta", "data": {"content": str(content)}}
            elif etype == "on_tool_start":
                name = event.get("name")
                if name:
                    yield {"event": "tool_call", "data": {"name": name}}
                    yield {
                        "event": "message_delta",
                        "data": {"content": self._tool_progress_message(name, started=True)},
                    }
            elif etype == "on_tool_end":
                name = event.get("name")
                if name:
                    yield {"event": "tool_result", "data": {"name": name}}
                    yield {
                        "event": "message_delta",
                        "data": {"content": self._tool_progress_message(name, started=False)},
                    }
            elif etype == "on_chain_end":
                output = event.get("data", {}).get("output")
                if isinstance(output, dict) and "messages" in output and "loops" in output:
                    final_state = output

        if final_state is None:
            try:
                snapshot = await self.graph.aget_state(config)
                values = getattr(snapshot, "values", None)
                if isinstance(values, dict):
                    final_state = values
            except Exception:
                final_state = None
            if final_state is None:
                yield {
                    "event": "message_complete",
                    "data": {
                        "answer": "Response generation completed, but final state snapshot was unavailable.",
                        "citations": [],
                        "used_tools": [],
                        "loops": 0,
                        "debug": {"state_snapshot": "unavailable"},
                    },
                }
                return

        response = AgentQueryResponse(
            answer=self._final_answer(final_state.get("messages", [])),
            citations=self._final_citations(final_state),
            used_tools=final_state.get("used_tools", []),
            loops=final_state.get("loops", 0),
            debug={"message_count": len(final_state.get("messages", []))},
        )
        yield {"event": "message_complete", "data": response.model_dump()}


# Backward compatibility alias
InfoAgentWorkflow = InfiyaAgentWorkflow
