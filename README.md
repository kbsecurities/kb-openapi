# KB OpenAPI B2C Production

KB OpenAPI B2C 운영 연동을 로컬에서 확인하기 위한 Next.js + FastAPI 환경입니다.

## Run

- 실행: `start-openapi-prod.cmd` 또는 `start-openapi-test.cmd`
- 종료: `stop-openapi-test.cmd`
- 화면: `http://localhost:3020/openapi-test`
- 백엔드: `http://localhost:8020`

이 프로젝트는 운영 모드만 사용합니다. `AIS_OPENAPI_MODE` 값은 실행 스크립트에서 항상 `production`으로 고정됩니다.

## Environment

- 기본 포트는 백엔드 `8020`, 프론트엔드 `3020`입니다.
- 운영 모드에서는 FastAPI reload와 문서 UI가 기본 비활성화됩니다.
- CORS는 `AIS_OPENAPI_CORS_ORIGINS`에 지정한 origin만 허용합니다.
- 로컬 기본 비밀값은 기본 노출하지 않습니다.

필요하면 아래 환경변수로 값을 조정할 수 있습니다.

```txt
AIS_OPENAPI_BACKEND_PORT=8020
AIS_OPENAPI_FRONTEND_PORT=3020
AIS_OPENAPI_CORS_ORIGINS=http://localhost:3020
AIS_OPENAPI_ALLOWED_HOST_SUFFIXES=kbsec.com
AIS_OPENAPI_PROD_KB_B2C_BASE_URL=https://developer.kbsec.com:32484
AIS_OPENAPI_PROD_KB_B2C_TOKEN_BASE_URL=https://developer.kbsec.com:32484
```

## Core Files

- `frontend/src/app/openapi-test`: KB B2C 운영 테스트 화면
- `frontend/src/components/openapi`: OpenAPI 테스트 클라이언트 UI
- `backend/settings.py`: production 전용 런타임 설정
- `backend/routers/openapi_test.py`: 외부 OpenAPI 호출 프록시
- `backend/routers/config.py`: 프론트 런타임 설정 및 기본 토큰 요청 조회
