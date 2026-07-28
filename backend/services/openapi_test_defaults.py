"""Local defaults for the KB OpenAPI production page."""

from __future__ import annotations

import socket
import uuid
from functools import lru_cache
from typing import Any

from backend.settings import get_runtime_settings, normalize_runtime_mode


@lru_cache(maxsize=1)
def _local_ip_addr() -> str:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        sock.close()


@lru_cache(maxsize=1)
def _local_mac_addr() -> str:
    node = uuid.getnode()
    return ":".join(f"{(node >> shift) & 0xFF:02X}" for shift in range(40, -1, -8))


def openapi_test_defaults(mode: str | None = None) -> dict[str, Any]:
    settings = get_runtime_settings()
    selected_mode = normalize_runtime_mode(mode)

    return {
        "runtimeMode": selected_mode,
        "kb": {
            "b2c": {
                "tokenBaseUrl": settings.active_environment.kb_b2c_token_base_url,
                "tokenIssue": {
                    "dataHeader": {
                        "ipAddr": _local_ip_addr(),
                        "macAddr": _local_mac_addr(),
                    },
                    "dataBody": {
                        "appKey": "",
                        "appSecret": "",
                        "grantType": "client_credentials",
                    },
                },
            },
        },
    }
