"""
Mode control API.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.mode.state_machine import Mode

router = APIRouter()


class SwitchModeBody(BaseModel):
    mode: Mode
    reason: str = "manual"


@router.get("/")
async def get_mode(request: Request):
    return request.app.state.mode_fsm.status()


@router.post("/switch")
async def switch_mode(request: Request, body: SwitchModeBody):
    mode_fsm = request.app.state.mode_fsm
    if body.mode == Mode.PROFESSIONAL:
        mode_fsm.switch_to_professional(body.reason)
    elif body.mode == Mode.PERSONAL:
        mode_fsm.switch_to_personal(body.reason)
    else:
        raise HTTPException(status_code=400, detail="Invalid mode")
    return mode_fsm.status()
