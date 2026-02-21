from __future__ import annotations

import json
import logging
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .checkpointer import PostgresCheckpointerManager
from .config import settings
from .models import AgentQueryRequest, CreateThreadResponse
from .thread_store import create_thread, ensure_thread_table, thread_exists
from .workflow import InfiyaAgentWorkflow

logging.basicConfig(level=getattr(logging, settings.agent_log_level.upper(), logging.INFO))
logger = logging.getLogger("agents")

app = FastAPI(title="Infiya Agents", version="0.1.0")
workflow: InfiyaAgentWorkflow | None = None
checkpointer_manager: PostgresCheckpointerManager | None = None


@app.on_event("startup")
async def startup():
    global workflow, checkpointer_manager
    ensure_thread_table()
    checkpointer_manager = PostgresCheckpointerManager()
    saver = await checkpointer_manager.start()
    workflow = InfiyaAgentWorkflow(checkpointer=saver)


@app.on_event("shutdown")
async def shutdown():
    global checkpointer_manager
    if checkpointer_manager is not None:
        await checkpointer_manager.close()
        checkpointer_manager = None


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "workflow": "ready" if workflow else "not_ready"}


@app.post("/threads", response_model=CreateThreadResponse)
async def create_thread_endpoint():
    thread_id, created_at = create_thread()
    return CreateThreadResponse(
        thread_id=thread_id,
        created_at=created_at.isoformat(),
    )


@app.post("/query")
async def query(req: AgentQueryRequest):
    try:
        if workflow is None:
            raise RuntimeError("Workflow is not initialized")
        if req.conversation_id and not thread_exists(req.conversation_id):
            raise HTTPException(status_code=404, detail="conversation_id not found")
        response = await workflow.run(req)
        return JSONResponse(response.model_dump())
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Query failed")
        return JSONResponse(
            {"message": "Agent query failed", "error": str(exc)},
            status_code=500,
        )


@app.post("/stream")
async def stream(req: AgentQueryRequest):
    if req.conversation_id and not thread_exists(req.conversation_id):
        raise HTTPException(status_code=404, detail="conversation_id not found")

    async def event_gen():
        try:
            if workflow is None:
                raise RuntimeError("Workflow is not initialized")
            yield f"event: message_start\ndata: {json.dumps({'ok': True})}\n\n"
            async for event in workflow.stream(req):
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
        except Exception as exc:
            payload = {"message": "Agent stream failed", "error": str(exc)}
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")
