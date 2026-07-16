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
    client_id: str
    client_secret: str


def load_config() -> KBOpenApiConfig:
    """환경변수(.env 포함)에서 접속 정보를 읽어옵니다.

    필요한 환경변수:
        KB_OPENAPI_BASE_URL      (선택, 기본값은 KB증권 운영 서버)
        KB_OPENAPI_CLIENT_ID     (필수) KB OpenAPI 포털에서 발급받은 clientId
        KB_OPENAPI_CLIENT_SECRET (필수) KB OpenAPI 포털에서 발급받은 clientSecret
    """
    base_url = os.environ.get("KB_OPENAPI_BASE_URL", "https://developer.kbsec.com:32484").rstrip("/")
    client_id = os.environ.get("KB_OPENAPI_CLIENT_ID", "")
    client_secret = os.environ.get("KB_OPENAPI_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        raise RuntimeError(
            "KB_OPENAPI_CLIENT_ID / KB_OPENAPI_CLIENT_SECRET 환경변수가 설정되지 않았습니다. "
            ".env.example을 복사해 .env를 만들고 값을 채우거나, 환경변수를 직접 export 하세요."
        )

    return KBOpenApiConfig(base_url=base_url, client_id=client_id, client_secret=client_secret)


# KB OpenAPI(B2C)는 원래 모바일 앱 채널을 기준으로 설계되어 있어서, 서버에서
# 호출하더라도 dataHeader에 단말기/채널 식별 정보를 함께 실어 보내야 요청이 정상
# 처리됩니다. 아래 값은 KB증권 OpenAPI 포털이 제공하는 샘플 전문에서 쓰는
# placeholder 값이며, 실제 서비스에서는 자신의 앱 정보에 맞게 바꿔도 됩니다.
DEFAULT_TR_DATA_HEADER: dict[str, str] = {
    "udId": "UDID",  # 단말기 고유 식별자 (Unique Device ID)
    "subChannel": "subChannel",  # 세부 채널 구분값
    "deviceModel": "Android",  # 단말기 모델명
    "deviceOs": "Android",  # 단말기 OS
    "carrier": "KT",  # 통신사
    "connectionType": "..",  # 접속 회선 종류
    "appName": "..",  # 호출 앱 이름
    "appVersion": "..",  # 호출 앱 버전
    "scrNo": "0000",  # 호출 화면 번호
}


def build_tr_headers(config: KBOpenApiConfig, access_token: str) -> dict[str, str]:
    """일반 거래(TR) 조회 API 호출에 필요한 HTTP 헤더를 만듭니다.

    appKey에는 clientId를, Authorization에는 발급받은 access_token을
    "bearer <access_token>" 형태(소문자 bearer)로 실어 보내야 합니다.
    """
    return {
        "Content-Type": "application/json",
        "appKey": config.client_id,
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


# '순위/상위' 계열 투자정보 TR(거래량상위, 등락률상위, 신고/신저 등)이 공통으로
# 쓰는 종목 필터 조건입니다. *_ccd 필드를 "1"로 주면 뒤따르는 *_strt~*_end 범위가
# 적용되고, "0"이면 해당 조건은 적용하지 않습니다(NONE). 예제에서는 기본값을
# 전부 "0"(필터 없음)으로 두어, 최소 인자로 호출해도 전체 종목을 대상으로
# 정상 동작하도록 했습니다. 특정 범위로 좁혀서 조회하고 싶다면 각 TR 함수 호출 시
# data_body를 직접 덮어써서 사용하세요.
RANKING_RANGE_FILTER_DEFAULTS: dict[str, str] = {
    "trgt_xcl": "",  # 대상제외 코드 (관리종목/거래정지/정리매매 등 제외 항목 비트조합)
    "cptl_amt_inpt_ccd": "0",  # 자본금 범위 필터 사용여부
    "cptl_amt_inpt_strt": "",
    "cptl_amt_inpt_end": "",
    "prc_stn_inpt_ccd": "0",  # 가격대 범위 필터 사용여부
    "prc_stn_inpt_strt": "",
    "prc_stn_inpt_end": "",
    "opn_prc_tl_amt_inpt_ccd": "0",  # 시가총액 범위 필터 사용여부
    "opn_prc_tl_amt_inpt_strt": "",
    "opn_prc_tl_amt_inpt_end": "",
    "vlm_inpt_ccd": "0",  # 거래량 범위 필터 사용여부
    "vlm_inpt_strt": "",
    "vlm_inpt_end": "",
    "pr_vl_prc_inpt_ccd": "0",  # 액면가 범위 필터 사용여부
    "pr_vl_prc_inpt_strt": "",
    "pr_vl_prc_inpt_end": "",
}


def print_json(title: str, payload: Any) -> None:
    """예제 실행 결과를 사람이 읽기 좋은 형태로 출력합니다."""
    print(f"\n=== {title} ===")
    print(json.dumps(payload, ensure_ascii=False, indent=2))
