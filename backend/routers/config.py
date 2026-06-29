"""OpenAPI test configuration routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from backend.services.openapi_test_defaults import openapi_test_defaults
from backend.settings import get_runtime_settings


router = APIRouter()


@router.get("/openapi-test/defaults")
async def get_openapi_test_defaults(mode: Optional[str] = Query(default=None)) -> dict:
    return openapi_test_defaults(mode)


@router.get("/runtime")
async def get_runtime_config() -> dict:
    settings = get_runtime_settings()
    return {
        "mode": settings.mode,
        "docsEnabled": settings.docs_enabled,
        "localDefaultsEnabled": settings.expose_local_defaults,
        "allowedHostSuffixes": settings.allowed_host_suffixes,
        "corsOrigins": settings.cors_origins,
        "environment": settings.active_environment.as_public_dict(),
        "environments": {
            mode: environment.as_public_dict()
            for mode, environment in settings.environments.items()
        },
    }
