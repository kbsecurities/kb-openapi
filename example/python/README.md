# KB OpenAPI Python 예제

KB증권 OpenAPI(B2C, 운영 환경)를 Python으로 직접 호출하는 방법을 보여주는
참고용(reference) 예제 코드입니다. 화면(UI)은 없고, `python 파일명.py`로
실행해서 콘솔에 출력되는 JSON 응답을 확인하는 형태입니다.

이 저장소의 `frontend`/`backend`는 브라우저에서 API를 테스트해볼 수 있는
콘솔 도구이고, 이 폴더(`example/python`)는 그 도구가 내부적으로 만들어서
보내는 요청을 개발자가 자기 서비스(백엔드, 배치, 스크립트 등)에 그대로
가져다 쓸 수 있도록 Python으로 옮겨 적은 것입니다.

## 무엇을 다루나요

- **인증(OAuth2)**: `auth_example.py` — `clientId`/`clientSecret`으로
  `access_token`을 발급받는 예제
- **투자정보 조회**: `investment_info_example.py` — 발급받은 토큰으로
  '투자정보' 카테고리 TR **31종 전체**를 호출하는 함수를 제공합니다. 이 중
  대표적인 5종(종목기본정보, 주식현재가, 주식호가, 통합차트, 환율종합)은
  `python investment_info_example.py`로 바로 실행해서 응답을 확인할 수 있고,
  나머지 26종은 함수만 정의되어 있으니 필요할 때 그대로 import해서 쓰면 됩니다.

계좌개설, 고객계좌(잔고/보유종목 등), 트레이딩(주문/체결 등) API는 이번
예제에 포함되어 있지 않습니다. 다만 요청 방식(헤더, `dataHeader`/`dataBody`
포맷)은 투자정보 API와 동일하므로, 아래 "다른 카테고리로 확장하기" 섹션을
참고하면 같은 패턴으로 쉽게 추가할 수 있습니다.

## API 스펙 요약

KB OpenAPI(B2C, 운영 전용)는 다음 규칙을 따릅니다.

| 항목 | 내용 |
| --- | --- |
| Base URL | `https://developer.kbsec.com:32484` |
| 인증 방식 | OAuth2 Client Credentials (`POST /oauth2/token`) |
| 요청 형식 | JSON, `POST` 본문은 `{"dataHeader": {...}, "dataBody": {...}}` 포맷으로 감쌈 |
| 인증 헤더 | `Authorization: bearer <access_token>` (소문자 `bearer`) |
| 앱 식별 헤더 | `appKey: <clientId>` |
| 전송 프로토콜 | HTTPS만 허용 (평문 HTTP 불가) |

### 1) 토큰 발급 (`POST {base_url}/oauth2/token`)

```json
{
  "dataHeader": { "ipAddr": "", "macAddr": "" },
  "dataBody": {
    "clientId": "발급받은 clientId",
    "clientSecret": "발급받은 clientSecret",
    "grantType": "client_credentials"
  }
}
```

응답의 `dataBody.access_token` 값이 이후 모든 API 호출에 사용할 토큰입니다.

### 2) 일반 TR(투자정보 등) 조회 (`POST {base_url}{endpoint}`)

```
Headers:
  Content-Type: application/json
  appKey: 발급받은 clientId
  Authorization: bearer <위에서 발급받은 access_token>

Body:
{
  "dataHeader": { "udId": "...", "deviceModel": "...", ... },  // 아래 참고
  "dataBody": { TR별 조회조건 }
}
```

`dataHeader`는 원래 모바일 앱 채널을 위한 단말기 식별 정보이지만, 서버에서
호출할 때도 동일한 키를 (값은 placeholder로) 채워서 보내야 요청이 정상
처리됩니다. `common.py`의 `DEFAULT_TR_DATA_HEADER`에 고정값으로 정의해두었습니다.

> **암호화(AES) 관련 참고**: 이 저장소의 백엔드 프록시(`backend/routers/openapi_test.py`)에는
> `dataBody`를 AES-ECB로 암호화하는 로직이 있지만, 이는 `/baas/v2/*` 경로의 B2B API에서만
> 사용됩니다. 이번 예제가 다루는 B2C `/api/v1/*` 투자정보 API는 암호화가 필요 없습니다.

## 사전 준비

1. **Python 3.9 이상** (본 저장소의 백엔드는 3.11+ 를 요구하지만, 이 예제 코드 자체는
   3.9 이상이면 동작합니다)
2. KB증권 OpenAPI 포털(https://developer.kbsec.com) 에서 앱을 등록하고
   `clientId` / `clientSecret`을 발급받으세요.
3. 이 예제는 **운영(production) 서버**만을 대상으로 합니다. 별도의 테스트/샌드박스
   서버는 제공되지 않으므로, 실제 호출 시 정상적으로 발급된 자격증명이 필요합니다.

## 설치

```bash
cd example/python
python3 -m venv .venv
source .venv/bin/activate    # Windows는 .venv\Scripts\activate
pip install -r requirements.txt
```

## 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 발급받은 `clientId`/`clientSecret`을 채워 넣으세요.

```
KB_OPENAPI_BASE_URL=https://developer.kbsec.com:32484
KB_OPENAPI_CLIENT_ID=여기에_clientId
KB_OPENAPI_CLIENT_SECRET=여기에_clientSecret
```

`.env`는 저장소 최상위 `.gitignore`에 이미 포함되어 있어 커밋되지 않습니다.
(환경변수를 직접 `export`해서 써도 무방하며, 이 경우 `.env` 파일 없이도 동작합니다.)

## 실행 방법

`example/python` 디렉터리 안에서 실행하세요 (같은 폴더의 `common.py`,
`auth_example.py`를 import하기 때문입니다).

```bash
# 1) 토큰 발급만 단독으로 확인
python auth_example.py

# 2) 토큰 발급 + 투자정보 API 5종(대표) 호출
python investment_info_example.py
```

`investment_info_example.py`는 실행할 때마다 내부적으로 `auth_example.py`의
`get_access_token()`을 호출해 매번 새 토큰을 발급받습니다. 호출 빈도가 잦은
서비스에서는 토큰 만료 시각(`expires_in`)까지 캐싱해서 재사용하는 것을
권장합니다 (이 예제는 참고용이라 단순화했습니다).

나머지 26개 함수는 REPL이나 다른 스크립트에서 바로 가져다 쓸 수 있습니다.

```python
from auth_example import get_access_token
from common import load_config
from investment_info_example import get_volume_top

config = load_config()
access_token = get_access_token()
result = get_volume_top(config, access_token, segment="2")  # segment="2" → KOSPI
```

### 실행 결과 예시 (형태 예시이며 실제 값은 발급 계정에 따라 다릅니다)

```
access_token 발급 완료 (32자)

=== [SIQM4900] 종목기본정보 - 005930 ===
{
  "dataHeader": { ... },
  "dataBody": {
    "is_nm": "삼성전자",
    ...
  }
}
```

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `common.py` | 설정 로딩, 공통 헤더/바디 조립, 랭킹류 TR 공통 필터, HTTP 요청 등 공용 유틸리티 |
| `auth_example.py` | OAuth2 토큰 발급 예제 (`issue_access_token`, `get_access_token`) |
| `investment_info_example.py` | 투자정보 TR 31종 전체 호출 함수 (main은 대표 5종만 실행) |
| `requirements.txt` | 의존 패키지 목록 (`requests`, `python-dotenv`) |
| `.env.example` | 환경변수 템플릿 |

## 투자정보 카테고리 전체 TR 목록 (31종)

아래 TR은 모두 `investment_info_example.py`에 호출 함수가 구현되어 있습니다.
"실행 대상" 표시가 있는 5종만 `python investment_info_example.py` 실행 시
자동으로 호출되고, 나머지는 함수를 직접 import해서 사용하면 됩니다.

| TR코드 | 함수 | 설명 | 실행 대상 |
| --- | --- | --- | --- |
| SIQM4900 | `get_stock_base_info` | 종목기본정보 (단일 종목 상세) | ✅ |
| SZQM0771 | `get_market_status` | 장운영상태 조회 | |
| IVU10140 | `get_stock_current_price` | 주식현재가 | ✅ |
| IVU10070 | `get_stock_orderbook` | 주식호가 | ✅ |
| IVU10080 | `get_stock_time_series` | 주식시간대별추이 | |
| IVM10050 | `get_company_overview` | 종목기업개요 | |
| IVS11560 | `get_integrated_chart` | 통합차트 (일/주/월/년/분/틱) | ✅ |
| IVU10430 | `get_investor_trend` | 종목별투자자 매매동향 | |
| IVU10420 | `get_foreign_broker_trend` | 당일주요외국계거래원 | |
| IVU10450 | `get_program_trading_trend` | 종목별프로그램매매추이 | |
| IVU10020 | `get_foreign_institution_top` | 외국인기관매매상위 | |
| IVS11430 | `get_theme_group` | 테마그룹조회 | |
| IVS10920 | `get_program_trading_top` | 프로그램매매상위 | |
| IVU10280 | `get_volume_top` | 거래량상위 | |
| IVU10270 | `get_surge_plunge_top` | 급등/급락 상위 | |
| IVU10210 | `get_trading_value_top` | 거래대금상위 | |
| IVU10240 | `get_change_rate_top` | 등락률상위 | |
| IVS10910 | `get_open_price_change_rate_top` | 시가대비등락률상위 | |
| IVS11190 | `get_extended_change_rate_rank` | 기간외등락률순위 | |
| IVU10550 | `get_new_high_low` | 신고/신저 | |
| IVSA0070 | `get_market_summary` | 시장종합 | |
| IVA60140 | `get_world_index` | 세계지수 | |
| IVM30010 | `get_sector_ranking` | 업종랭킹 | |
| IVA60190 | `get_exchange_rate_summary` | 환율종합 | ✅ |
| IVA10370 | `get_market_fund_flow` | 증시주변자금동향 | |
| SPAM2508 | `get_holiday_info` | 공휴일관리 | |
| SIAM4983 | `get_stock_master_info` | 종목관리 (종목 마스터, 필드 90여개) | |
| GSS10030 | `get_global_stock_price` | (해외주식) 현재가 | |
| GSS10040 | `get_global_stock_orderbook` | (해외주식) 호가 | |
| GSA10020 | `get_global_stock_tick_trades` | (해외주식) 시간대별체결 | |
| GSC10060 | `get_global_stock_chart` | (해외주식) 차트 | |

### 구현 메모

- `IVU10280`(거래량상위)부터 `IVU10550`(신고/신저)까지의 '상위/랭킹' 계열 TR은
  자본금·가격대·시가총액·거래량·액면가 범위 필터를 공통으로 갖고 있어서,
  `common.py`의 `RANKING_RANGE_FILTER_DEFAULTS`(필터 없음이 기본값)를 공유해서
  구현했습니다. 특정 범위로 좁혀 조회하려면 해당 함수 호출부에서 이 값을
  덮어쓰세요.
- `SIAM4983`(종목관리)은 조회조건 필드가 90개 가까이 되는 대형 TR이라, 자주 쓰는
  종목코드만 인자로 받고 나머지는 `**extra_fields` 키워드 인자로 필요할 때만
  추가하도록 했습니다. 전체 필드 목록은
  `frontend/src/app/openapi-test/samples.generated.json`의 `Tkb_SIAM4983_B2C`
  항목에서 확인할 수 있습니다.
- `GSS10030`~`GSC10060`(해외주식 시세/호가/체결/차트)은 `krx_cd`로 나스닥·뉴욕·홍콩·
  상하이 등 해외 거래소를 지정하는 TR입니다.

## 다른 카테고리로 확장하기

이번 예제는 '투자정보' 카테고리만 다루지만, 계좌개설/고객계좌/트레이딩 등 다른
카테고리도 요청 구조(헤더, `dataHeader`/`dataBody` 포맷)는 동일합니다. 새 TR을
추가하려면:

1. `investment_info_example.py`의 `call_tr(config, access_token, endpoint, data_body)`를
   그대로 재사용합니다 (또는 새 파일에 동일한 패턴으로 복사).
2. 필요한 조회조건(`dataBody`)은 KB OpenAPI 포털의 전문 규격서에서 확인하거나,
   이 저장소의 `frontend/src/app/openapi-test/samples.generated.json`에서
   해당 TR코드(`Tkb_<TR코드>_B2C`)를 검색하면 `inputSpec`/`outputSpec`(필드별
   한글명, 타입, 길이, 필수여부)까지 확인할 수 있습니다.
3. 기존 함수들과 같은 형태로 `call_tr(config, access_token, "/api/v1/xxxxx", {...})`
   를 감싸는 함수를 추가합니다.

## 주의사항

- 이 예제는 **운영 서버를 직접 호출**합니다. 잘못된 조회조건으로 과도하게 반복
  호출하면 계정이 제한될 수 있으니 테스트 시 호출 빈도에 유의하세요.
- `.env` 파일이나 `clientSecret`을 git에 커밋하거나 로그에 남기지 마세요.
- 응답 필드 구조(`dataBody` 안의 필드명 등)는 KB 측 전문 규격서 기준으로 작성했지만,
  실제 운영 응답과 다를 수 있습니다. 처음 연동할 때는 `print_json()`으로 원본 응답을
  꼭 직접 확인하세요.
- 이 예제는 동기(sync) 방식의 단순한 `requests` 호출로 작성되어 있습니다. 운영
  서비스에 적용할 때는 타임아웃/재시도/로깅 정책을 각 서비스 표준에 맞게 보강하세요.
