"""OpenAPI test utility endpoints."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import httpx
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.settings import get_runtime_settings


router = APIRouter()
settings = get_runtime_settings()


class OpenApiProxyRequest(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    url: str = Field(max_length=4096)
    headers: dict[str, str] = Field(default_factory=dict)
    body: Any = None
    accessToken: Optional[str] = None
    clientSecret: Optional[str] = None
    encryptBody: bool = False


def _is_allowed_url(url: str) -> bool:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    schemes = {"https"}
    if settings.allow_http_targets:
        schemes.add("http")
    return parsed.scheme in schemes and any(
        host == suffix or host.endswith(f".{suffix}") for suffix in settings.allowed_host_suffixes
    )


def _compact_body(body: Any) -> str:
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


def _encrypt_ecb_pkcs7(client_secret: str, plain_body: str) -> str:
    key = client_secret.encode("utf-8")
    if len(key) not in {16, 24, 32}:
        raise HTTPException(status_code=400, detail="clientSecret must be 16, 24, or 32 bytes for AES encryption.")
    cipher = AES.new(key, AES.MODE_ECB)
    encrypted = cipher.encrypt(pad(plain_body.encode("utf-8"), AES.block_size))
    return base64.b64encode(encrypted).decode("ascii")


def _decrypt_ecb_pkcs7(client_secret: str, encrypted_body: str) -> str:
    key = client_secret.encode("utf-8")
    if len(key) not in {16, 24, 32}:
        raise HTTPException(status_code=400, detail="clientSecret must be 16, 24, or 32 bytes for AES decryption.")
    try:
        encrypted = base64.b64decode(encrypted_body)
        cipher = AES.new(key, AES.MODE_ECB)
        decrypted = unpad(cipher.decrypt(encrypted), AES.block_size)
        return decrypted.decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=502, detail="Failed to decrypt encrypted OpenAPI response.") from exc


def _make_hs_key(access_token: str, plain_body: str) -> str:
    digest_hex = hmac.new(access_token.encode("utf-8"), plain_body.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.b64encode(digest_hex.encode("utf-8")).decode("ascii")


def _decrypt_response_if_needed(response_text: str, client_secret: Optional[str]) -> tuple[str, bool]:
    if not client_secret:
        return response_text, False
    try:
        payload = json.loads(response_text)
    except json.JSONDecodeError:
        return response_text, False
    if not isinstance(payload, dict):
        return response_text, False
    encrypted_body = payload.get("encrypt")
    if not isinstance(encrypted_body, str) or not encrypted_body.strip():
        return response_text, False
    return _decrypt_ecb_pkcs7(client_secret, encrypted_body), True


@router.post("/proxy")
async def proxy_openapi_request(request: OpenApiProxyRequest) -> dict[str, Any]:
    if not _is_allowed_url(request.url):
        raise HTTPException(status_code=400, detail="Unsupported OpenAPI target URL.")

    headers = {key: value for key, value in request.headers.items() if key.lower() not in {"host", "content-length"}}
    request_body = request.body
    if request.encryptBody and request.method in {"POST", "PUT", "PATCH"}:
        if not request.accessToken:
            raise HTTPException(status_code=400, detail="accessToken is required for encrypted OpenAPI requests.")
        if not request.clientSecret:
            raise HTTPException(status_code=400, detail="clientSecret is required for encrypted OpenAPI requests.")
        plain_body = _compact_body(request.body)
        headers["hsKey"] = _make_hs_key(request.accessToken, plain_body)
        request_body = {"encrypt": _encrypt_ecb_pkcs7(request.clientSecret, plain_body)}
    sent_headers = dict(headers)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                request.method,
                request.url,
                headers=headers,
                json=request_body if request.method in {"POST", "PUT", "PATCH"} else None,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response_body, decrypted = _decrypt_response_if_needed(response.text, request.clientSecret)
    response_headers = dict(response.headers)
    if decrypted:
        response_headers["x-openapi-test-decrypted"] = "true"

    return {
        "status": response.status_code,
        "ok": 200 <= response.status_code < 300,
        "headers": response_headers,
        "body": response_body,
        "decrypted": decrypted,
        "requestHeaders": sent_headers,
    }
