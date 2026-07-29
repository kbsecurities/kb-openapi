"""KB OpenAPI 예제 공통 모듈.

auth_example.py, investment_info_example.py 에서 함께 쓰는
- 환경설정(Config) 로딩
- HTTP 요청/응답 처리
- KB OpenAPI 공통 요청 포맷(dataHeader + dataBody) 조립
을 모아둔 헬퍼입니다.

이 저장소의 실제 백엔드 프록시(backend/routers/openapi_test.py)는 브라우저에서
호출한 요청을 KB 서버로 그대로 중계하는 역할만 하고, 실제 요청 조립/서명 로직은
frontend/src/components/openapi/OpenApiTestClient.tsx 안에 있습니다. 이 예제는
그 로직 중 '투자정보' API 호출에 필요한 부분만 Python으로 옮겨온 것입니다.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import requests

try:
    # python-dotenv가 설치되어 있으면 .env 파일을 자동으로 읽어옵니다.
    # 설치되어 있지 않아도 환경변수를 직접 export 했다면 정상 동작합니다.
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


@dataclass(frozen=True)
class KBOpenApiConfig:
    """KB OpenAPI 호출에 필요한 접속 정보."""

    base_url: str
    app_key: str
    app_secret: str


def load_config() -> KBOpenApiConfig:
    """환경변수(.env 포함)에서 접속 정보를 읽어옵니다.

    필요한 환경변수:
        KB_OPENAPI_BASE_URL      (선택, 기본값은 KB증권 운영 서버)
        KB_OPENAPI_APP_KEY     (필수) KB OpenAPI 포털에서 발급받은 appKey
        KB_OPENAPI_APP_SECRET (필수) KB OpenAPI 포털에서 발급받은 appSecret
    """
    base_url = os.environ.get("KB_OPENAPI_BASE_URL", "https://developer.kbsec.com:32484").rstrip("/")
    app_key = os.environ.get("KB_OPENAPI_APP_KEY", "")
    app_secret = os.environ.get("KB_OPENAPI_APP_SECRET", "")

    if not app_key or not app_secret:
        raise RuntimeError(
            "KB_OPENAPI_APP_KEY / KB_OPENAPI_APP_SECRET 환경변수가 설정되지 않았습니다. "
            ".env.example을 복사해 .env를 만들고 값을 채우거나, 환경변수를 직접 export 하세요."
        )

    return KBOpenApiConfig(base_url=base_url, app_key=app_key, app_secret=app_secret)


# KB OpenAPI(B2C) TR 요청의 dataHeader는 ipAddr/macAddr 2개 필드만 사용합니다.
# 서버(백엔드)에서 호출하는 경우 비워서 보내도 요청 처리에는 문제가 없습니다.
DEFAULT_TR_DATA_HEADER: dict[str, str] = {
    "ipAddr": "",
    "macAddr": "",
}


def build_tr_headers(config: KBOpenApiConfig, access_token: str) -> dict[str, str]:
    """일반 거래(TR) 조회 API 호출에 필요한 HTTP 헤더를 만듭니다.

    appKey 헤더에는 발급받은 appKey 값을, Authorization 헤더에는 발급받은
    access_token을 "bearer <access_token>" 형태(소문자 bearer)로 실어 보내야 합니다.
    """
    return {
        "Content-Type": "application/json",
        "appKey": config.app_key,
        "Authorization": f"bearer {access_token}",
    }


def build_tr_body(data_body: dict[str, Any]) -> dict[str, Any]:
    """TR별 조회조건(data_body)을 KB OpenAPI 공통 요청 포맷으로 감쌉니다."""
    return {
        "dataHeader": DEFAULT_TR_DATA_HEADER,
        "dataBody": data_body,
    }


def post_json(url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
    """POST 요청을 보내고 JSON 응답을 그대로 돌려줍니다.

    주의: KB OpenAPI는 요청 자체는 성공(HTTP 200)했지만 업무 처리 결과가 실패인
    경우에도 200 OK에 에러 메시지를 담아 내려주는 경우가 있습니다. 실제 서비스에
    적용할 때는 HTTP 상태코드뿐 아니라 응답 본문의 메시지/코드 필드도 함께 확인하세요.
    """
    response = requests.post(url, headers=headers, json=body, timeout=10)
    response.raise_for_status()
    try:
        return response.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"JSON이 아닌 응답을 받았습니다: {response.text[:200]!r}") from exc



def print_json(title: str, payload: Any) -> None:
    """예제 실행 결과를 사람이 읽기 좋은 형태로 출력합니다."""
    print(f"\n=== {title} ===")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
