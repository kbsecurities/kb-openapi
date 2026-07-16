"""KB OpenAPI(B2C) OAuth2 access_token 발급 예제.

사전 준비:
    1) KB증권 OpenAPI 포털에서 앱을 등록하고 clientId / clientSecret을 발급받습니다.
    2) 이 폴더의 .env.example을 복사해 .env 파일을 만들고 값을 채웁니다.
       (또는 KB_OPENAPI_CLIENT_ID / KB_OPENAPI_CLIENT_SECRET 환경변수를 직접 export)

API 사양:
    POST {base_url}/oauth2/token

    grantType=client_credentials로 access_token을 발급받는 표준 OAuth2
    Client Credentials Grant 흐름입니다. 요청/응답 본문은 KB OpenAPI 공통 포맷인
    dataHeader + dataBody 형태로 감싸져 있습니다.

    발급받은 access_token은 이후 모든 API 호출의 Authorization 헤더에
    "bearer <access_token>" 형태로 실어 보냅니다. (investment_info_example.py 참고)

실행:
    python auth_example.py
"""

from __future__ import annotations

from common import KBOpenApiConfig, load_config, post_json, print_json


def issue_access_token(config: KBOpenApiConfig) -> dict:
    """clientId/clientSecret으로 access_token을 발급받습니다.

    Returns:
        KB OpenAPI 원본 응답(JSON)을 그대로 반환합니다. access_token은 보통
        response["dataBody"]["access_token"] 경로에 담겨 옵니다.
    """
    url = f"{config.base_url}/oauth2/token"
    headers = {"Content-Type": "application/json"}
    body = {
        # 토큰 발급 요청의 dataHeader는 기기정보 대신 접속 IP/MAC 정보를 받습니다.
        # 서버(백엔드)에서 호출하는 경우 비워서 보내도 발급에는 문제가 없습니다.
        "dataHeader": {"ipAddr": "", "macAddr": ""},
        "dataBody": {
            "clientId": config.client_id,
            "clientSecret": config.client_secret,
            "grantType": "client_credentials",
        },
    }
    return post_json(url, headers, body)


def extract_access_token(token_response: dict) -> str:
    """토큰 발급 응답에서 access_token 문자열만 뽑아냅니다."""
    data_body = token_response.get("dataBody", token_response)
    access_token = data_body.get("access_token") or data_body.get("accessToken")
    if not access_token:
        raise RuntimeError(f"응답에서 access_token을 찾지 못했습니다. 응답 원문: {token_response}")
    return access_token


def get_access_token() -> str:
    """설정을 로드하고 곧바로 access_token 문자열을 돌려주는 헬퍼.

    investment_info_example.py 등 다른 예제 파일에서 이 함수를 그대로 가져다 씁니다.
    (매 호출마다 토큰을 새로 발급하므로, 실제 서비스에서는 만료 시각까지 캐싱해서
    재사용하는 것을 권장합니다.)
    """
    config = load_config()
    token_response = issue_access_token(config)
    return extract_access_token(token_response)


if __name__ == "__main__":
    config = load_config()
    token_response = issue_access_token(config)
    print_json("토큰 발급 응답", token_response)

    access_token = extract_access_token(token_response)
    print(f"\naccess_token 앞부분: {access_token[:12]}... (총 {len(access_token)}자)")
