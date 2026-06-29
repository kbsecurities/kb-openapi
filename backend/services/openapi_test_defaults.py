"""Local defaults for the KB OpenAPI production page."""

from __future__ import annotations

from typing import Any

from backend.settings import get_runtime_settings, normalize_runtime_mode


def openapi_test_defaults(mode: str | None = None) -> dict[str, Any]:
    settings = get_runtime_settings()
    selected_mode = normalize_runtime_mode(mode)

    return {
        "runtimeMode": selected_mode,
        "kb": {
            "b2c": {
                "tokenBaseUrl": settings.active_environment.kb_b2c_token_base_url,
                "tokenIssue": {
                    "dataBody": {
                        "clientId": "",
                        "clientSecret": "",
                        "grantType": "client_credentials",
                    },
                },
            },
        },
    }
