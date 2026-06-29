"""Production-only runtime settings for the KB OpenAPI test backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Mapping


RuntimeMode = Literal["production"]

DEFAULT_PROD_ALLOWED_HOST_SUFFIXES = ("kbsec.com",)
DEFAULT_PRODUCTION_ENVIRONMENT = {
    "KB_BASE_URL": "https://developer.kbsec.com:32484",
    "KB_B2C_TOKEN_BASE_URL": "https://developer.kbsec.com:32484",
}


def _clean(value: str | None) -> str:
    return (value or "").strip().strip("\"'")


def _split_csv(value: str | None) -> tuple[str, ...]:
    return tuple(item for item in (_clean(part) for part in (value or "").split(",")) if item)


def _truthy(value: str | None) -> bool:
    return _clean(value).lower() in {"1", "true", "yes", "y", "on"}


def _first_env(*keys: str, default: str) -> str:
    for key in keys:
        value = _clean(os.getenv(key))
        if value:
            return value
    return default


def normalize_runtime_mode(value: str | None = None) -> RuntimeMode:
    return "production"


@dataclass(frozen=True)
class OpenApiEnvironmentSettings:
    kb_base_url: str
    kb_b2c_token_base_url: str

    def as_public_dict(self) -> dict[str, str]:
        return {
            "kbBaseUrl": self.kb_base_url,
            "kbB2cTokenBaseUrl": self.kb_b2c_token_base_url,
        }


@dataclass(frozen=True)
class RuntimeSettings:
    mode: RuntimeMode
    host: str
    port: int
    cors_origins: tuple[str, ...]
    allowed_host_suffixes: tuple[str, ...]
    allow_http_targets: bool
    expose_local_defaults: bool
    docs_enabled: bool
    environments: Mapping[RuntimeMode, OpenApiEnvironmentSettings]

    @property
    def kb_config_mode(self) -> Literal["prod"]:
        return "prod"

    @property
    def active_environment(self) -> OpenApiEnvironmentSettings:
        return self.environments["production"]


def _environment_settings() -> OpenApiEnvironmentSettings:
    defaults = DEFAULT_PRODUCTION_ENVIRONMENT
    return OpenApiEnvironmentSettings(
        kb_base_url=_first_env(
            "AIS_OPENAPI_KB_BASE_URL",
            "AIS_OPENAPI_PROD_KB_BASE_URL",
            "AIS_OPENAPI_PRODUCTION_KB_BASE_URL",
            default=defaults["KB_BASE_URL"],
        ),
        kb_b2c_token_base_url=_first_env(
            "AIS_OPENAPI_KB_B2C_TOKEN_BASE_URL",
            "AIS_OPENAPI_PROD_KB_B2C_TOKEN_BASE_URL",
            "AIS_OPENAPI_PRODUCTION_KB_B2C_TOKEN_BASE_URL",
            default=defaults["KB_B2C_TOKEN_BASE_URL"],
        ),
    )


@lru_cache(maxsize=1)
def get_runtime_settings() -> RuntimeSettings:
    mode = normalize_runtime_mode()
    port = int(_clean(os.getenv("AIS_OPENAPI_BACKEND_PORT")) or "8020")
    cors_origins = _split_csv(os.getenv("AIS_OPENAPI_CORS_ORIGINS"))
    allowed_host_suffixes = _split_csv(os.getenv("AIS_OPENAPI_ALLOWED_HOST_SUFFIXES"))
    if not allowed_host_suffixes:
        allowed_host_suffixes = DEFAULT_PROD_ALLOWED_HOST_SUFFIXES

    environments: Mapping[RuntimeMode, OpenApiEnvironmentSettings] = {
        "production": _environment_settings(),
    }

    return RuntimeSettings(
        mode=mode,
        host=_clean(os.getenv("AIS_OPENAPI_BACKEND_HOST")) or "0.0.0.0",
        port=port,
        cors_origins=cors_origins,
        allowed_host_suffixes=allowed_host_suffixes,
        allow_http_targets=_truthy(os.getenv("AIS_OPENAPI_ALLOW_HTTP_TARGETS")),
        expose_local_defaults=_truthy(os.getenv("AIS_OPENAPI_EXPOSE_LOCAL_DEFAULTS")),
        docs_enabled=_truthy(os.getenv("AIS_OPENAPI_ENABLE_DOCS")),
        environments=environments,
    )
