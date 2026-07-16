"""KB OpenAPI(B2C) 투자정보 API 호출 예제.

KB증권 OpenAPI의 '투자정보' 카테고리에 속한 조회성 TR **31종 전체**의 호출
함수를 제공합니다. 이 카테고리의 모든 TR은 동일한 규칙을 따릅니다.

    POST {base_url}{endpoint}
    Headers: Content-Type, appKey(=clientId), Authorization(=bearer <access_token>)
    Body:    { "dataHeader": {...기기정보...}, "dataBody": {...조회조건...} }

파일 하단의 `if __name__ == "__main__":` 블록은 이 중 대표적인 5종(종목기본정보,
주식현재가, 주식호가, 통합차트, 환율종합)만 실제로 실행해서 응답을 출력합니다.
나머지 26종은 함수만 정의되어 있으니, 필요한 함수를 import해서 그대로 가져다
쓰거나 참고해서 새 TR을 추가하면 됩니다. 사용 가능한 투자정보 TR 전체 목록은
README.md의 표를 참고하세요.

실행:
    python investment_info_example.py
"""

from __future__ import annotations

from typing import Any

from auth_example import get_access_token
from common import (
    RANKING_RANGE_FILTER_DEFAULTS,
    KBOpenApiConfig,
    build_tr_body,
    build_tr_headers,
    load_config,
    post_json,
    print_json,
)


def call_tr(config: KBOpenApiConfig, access_token: str, endpoint: str, data_body: dict[str, Any]) -> dict:
    """투자정보 TR 공통 호출 함수.

    Args:
        endpoint: "/api/v1/xxxxx" 형태의 TR 경로 (base_url 뒤에 붙습니다)
        data_body: 각 TR의 조회조건(dataBody) 딕셔너리
    """
    url = f"{config.base_url}{endpoint}"
    headers = build_tr_headers(config, access_token)
    body = build_tr_body(data_body)
    return post_json(url, headers, body)


# ---------------------------------------------------------------------------
# 1) 종목 상세 / 시세
# 필드명(stnd_is_cd 등)과 코드값 설명은 KB OpenAPI 포털의 전문 규격서 기준입니다.
# ---------------------------------------------------------------------------


def get_stock_base_info(config: KBOpenApiConfig, access_token: str, stock_code: str) -> dict:
    """SIQM4900 - 종목기본정보 조회.

    Args:
        stock_code: 표준종목코드 (예: "005930" 삼성전자)
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/siqm4900",
        {"stnd_is_cd": stock_code},
    )


def get_stock_current_price(config: KBOpenApiConfig, access_token: str, stock_code: str, market: str = "1") -> dict:
    """IVU10140 - 주식현재가 조회.

    Args:
        stock_code: 단축코드 (예: "005930")
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT (기본값 "1")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10140",
        {"excg_clsf": market, "shrt_cd": stock_code},
    )


def get_stock_orderbook(
    config: KBOpenApiConfig, access_token: str, stock_code: str, after_hours: bool = False
) -> dict:
    """IVU10070 - 주식호가 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        after_hours: True면 시간외 호가, False(기본값)면 정규장 호가
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10070",
        {"is_cd": stock_code, "ovtm_mkt_clsf": "1" if after_hours else "0"},
    )


def get_stock_time_series(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    market: str = "1",
    after_hours: bool = False,
    count: str = "10",
) -> dict:
    """IVU10080 - 주식시간대별추이 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT (기본값 "1")
        after_hours: True면 시간외, False(기본값)면 정규장
        count: 조회건수 (기본값 "10")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10080",
        {
            "excg_clsf": market,
            "is_cd": stock_code,
            "ovtm_mkt_clsf": "1" if after_hours else "0",
            "inq_cnt": count,
        },
    )


def get_company_overview(config: KBOpenApiConfig, access_token: str, stock_code: str) -> dict:
    """IVM10050 - 종목기업개요 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
    """
    return call_tr(config, access_token, "/api/v1/ivm10050", {"is_cd": stock_code})


def get_integrated_chart(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    chart_type: str = "D",
    count: str = "10",
) -> dict:
    """IVS11560 - 통합차트(일/주/월/년/분/틱) 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        chart_type: "D"=일별, "W"=주별, "M"=월별, "Y"=년별, "B"=분봉, "T"=틱 (기본값 "D")
        count: 조회 건수 (기본값 "10")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivs11560",
        {
            "info_ccd": "1",  # 1:원주가, 2:수정주가(KOSPI/KOSDAQ 종목만)
            "mkt_clsf": "1",  # 0:KOSPI, 1:KOSDAQ, ... (전체 코드는 README 참고)
            "chrt_clsf": chart_type,
            "minute_tck_indx": "",  # 분봉/틱봉일 때만 사용 (예: "1", "5")
            "is_cd": stock_code,
            "inq_clsf": "1",
            "strt_dy": "",  # 조회 시작일(YYYYMMDD), 비우면 최근 데이터부터 조회
            "inq_cnt": count,
        },
    )


# ---------------------------------------------------------------------------
# 2) 투자자 / 프로그램매매 동향
# ---------------------------------------------------------------------------


def get_investor_trend(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    market: str = "1",
    start_date: str = "",
    end_date: str = "",
    by_amount: bool = True,
    trade_type: str = "1",
    cumulative: bool = False,
) -> dict:
    """IVU10430 - 종목별투자자 매매동향 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        start_date / end_date: 조회기간 (YYYYMMDD), 비우면 최근 데이터
        by_amount: True(기본값)면 금액 기준, False면 수량 기준
        trade_type: "1"=순매수, "2"=매수, "3"=매도
        cumulative: True면 기간 누적, False(기본값)면 일자별
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10430",
        {
            "excg_clsf": market,
            "is_cd": stock_code,
            "strt_dt": start_date,
            "end_dt": end_date,
            "amt_q_clsf": "1" if by_amount else "2",
            "trd_clsf": trade_type,
            "acml_clsf": "1" if cumulative else "0",
        },
    )


def get_foreign_broker_trend(config: KBOpenApiConfig, access_token: str, stock_code: str, market: str = "1") -> dict:
    """IVU10420 - 당일주요외국계거래원 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10420",
        {"excg_clsf": market, "is_cd": stock_code},
    )


def get_program_trading_trend(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    market: str = "1",
    by_amount: bool = True,
    hourly: bool = True,
    count: str = "10",
) -> dict:
    """IVU10450 - 종목별프로그램매매추이 조회.

    Args:
        stock_code: 종목코드 (예: "005930")
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        by_amount: True(기본값)면 금액 기준, False면 수량 기준
        hourly: True(기본값)면 시간별, False면 일별
        count: 조회건수 (기본값 "10")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10450",
        {
            "excg_clsf": market,
            "is_cd": stock_code,
            "amt_q_clsf": "1" if by_amount else "2",
            "prd_clsf": "1" if hourly else "2",
            "inq_cnt": count,
        },
    )


def get_foreign_institution_top(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "2",
    investor_type: str = "2",
    period: str = "0",
    rank_type: str = "0",
) -> dict:
    """IVU10020 - 외국인기관매매상위 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "0"=거래소, "1"=코스닥, "2"=전체 (기본값 "2")
        investor_type: 투자자구분코드. "0"=외국인, "1"=기관, "2"=외국인+기관 ... (기본값 "2")
        period: 기간구분. "0"=전일, "1"=1주, "2"=1달, "3"=3달, "4"=6달, "5"=1년, "6"=연초 (기본값 "0")
        rank_type: 순위구분. "0"=순매수, "1"=순매도, "2"=지분증가, "3"=지분감소,
            "4"=연속순매수, "5"=연속순매도 (기본값 "0")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10020",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            "invstr_ccd": investor_type,
            "prd_clsf": period,
            "rnk_clsf": rank_type,
        },
    )


def get_program_trading_top(
    config: KBOpenApiConfig,
    access_token: str,
    index_id: str = "",
    count: str = "10",
    ascending: bool = False,
) -> dict:
    """IVS10920 - 프로그램매매상위 조회.

    자본금/가격대/시가총액/거래량/액면가 범위 필터는
    common.RANKING_RANGE_FILTER_DEFAULTS 기본값(필터 없음)을 사용합니다.

    Args:
        index_id: 지수ID. 비우면 전체 대상
        count: 조회건수 (기본값 "10")
        ascending: True면 하위순, False(기본값)면 상위순
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivs10920",
        {
            "indx_id": index_id,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "srt_clsf": "2" if ascending else "1",
        },
    )


# ---------------------------------------------------------------------------
# 3) 랭킹 / 상위 조회
# 아래 함수들은 모두 자본금/가격대/시가총액/거래량/액면가 범위 필터를 공유하며,
# common.RANKING_RANGE_FILTER_DEFAULTS(필터 없음)를 기본값으로 사용합니다.
# ---------------------------------------------------------------------------


def get_volume_top(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "1",
    count: str = "10",
    by_turnover: bool = False,
) -> dict:
    """IVU10280 - 거래량상위 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ
        count: 조회건수 (기본값 "10")
        by_turnover: True면 거래회전율 기준 정렬, False(기본값)면 거래량 기준
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10280",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "srt_clsf": "2" if by_turnover else "1",
        },
    )


def get_surge_plunge_top(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "1",
    count: str = "10",
    surge: bool = True,
) -> dict:
    """IVU10270 - 급등/급락 상위 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ
        count: 조회건수 (기본값 "10")
        surge: True(기본값)면 급등 상위, False면 급락 상위
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10270",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "up_dwn_ccd": "1" if surge else "2",
            "minute_dy_ccd": "1",  # 1:분전, 2:일전
            "minute_dy_unt": "",  # 몇 분/일 전인지 (비우면 KB 기본값 적용)
            "crdt_cndt": "1",  # 신용조건: 1=전체조회
        },
    )


def get_trading_value_top(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "1",
    count: str = "10",
    today: bool = True,
) -> dict:
    """IVU10210 - 거래대금상위 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ
        count: 조회건수 (기본값 "10")
        today: True(기본값)면 당일 기준, False면 전일 기준
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10210",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            "thdy_bdy_clsf": "1" if today else "2",
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "crdt_grp_clsf": "1",  # 신용그룹구분: 1=전체조회
            "srt_clsf": "1",  # 정렬구분: 1=상위
        },
    )


def get_change_rate_top(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "1",
    count: str = "10",
    rising: bool = True,
) -> dict:
    """IVU10240 - 등락률상위 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ, "4"=KOSPI200, "5"=KOSDAQ150
        count: 조회건수 (기본값 "10")
        rising: True(기본값)면 상승율 상위, False면 하락율 상위
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10240",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "srt_clsf": "1" if rising else "2",
            "crdt_clsf": "1",  # 신용구분: 1=전체조회
        },
    )


def get_open_price_change_rate_top(
    config: KBOpenApiConfig,
    access_token: str,
    segment: str = "1",
    count: str = "10",
    rising: bool = True,
) -> dict:
    """IVS10910 - 시가대비등락률상위 조회.

    Args:
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ, "4"=KOSPI200, "5"=KOSDAQ150
        count: 조회건수 (기본값 "10")
        rising: True(기본값)면 상승 상위, False면 하락 상위
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivs10910",
        {
            "mkt_clsf": segment,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "srt_clsf": "1" if rising else "2",
            "crdt_cndt": "1",  # 신용조건: 1=전체조회
        },
    )


def get_extended_change_rate_rank(
    config: KBOpenApiConfig,
    access_token: str,
    segment: str = "1",
    count: str = "10",
    rising: bool = True,
    today: bool = True,
) -> dict:
    """IVS11190 - 기간외등락률순위 조회.

    Args:
        segment: 시장구분. "1"=전체, "2"=거래소, "3"=코스닥
        count: 조회건수 (기본값 "10")
        rising: True(기본값)면 상승율, False면 하락율
        today: True(기본값)면 당일, False면 전일
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivs11190",
        {
            "mkt_clsf": segment,
            "srt_clsf": "1" if rising else "2",
            "thdy_bdy_clsf": "1" if today else "2",
            "trgt_xcl_cd": "1",  # 대상제외코드: 1=전체
            "vlm_clsf": "1",  # 거래량구분: 1=전체
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
        },
    )


def get_new_high_low(
    config: KBOpenApiConfig,
    access_token: str,
    market: str = "1",
    segment: str = "1",
    count: str = "10",
    is_new_high: bool = True,
    period: str = "1",
) -> dict:
    """IVU10550 - 신고/신저 조회.

    Args:
        market: 거래소구분. "0"=통합, "1"=KRX, "2"=NXT
        segment: 시장구분. "1"=전체, "2"=KOSPI, "3"=KOSDAQ
        count: 조회건수 (기본값 "10")
        is_new_high: True(기본값)면 신고가, False면 신저가
        period: 기간구분. "1"=전일, "2"=5일, "3"=10일, "4"=20일, "5"=60일, "6"=250일
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/ivu10550",
        {
            "excg_clsf": market,
            "mkt_clsf": segment,
            **RANKING_RANGE_FILTER_DEFAULTS,
            "inq_cnt": count,
            "nw_stk_lw_ccd": "1" if is_new_high else "2",
            "std_clsf": "1",  # 기준구분: 1=고저기준
            "prd_clsf": period,
            "excd_clsf": "1",  # 돌파구분: 1=일시돌파
            "crdt_clsf": "1",  # 신용구분: 1=전체조회
        },
    )


# ---------------------------------------------------------------------------
# 4) 시장 전체 / 테마 / 세계지수
# ---------------------------------------------------------------------------


def get_theme_group(config: KBOpenApiConfig, access_token: str, theme_code: str = "") -> dict:
    """IVS11430 - 테마그룹조회.

    Args:
        theme_code: 테마코드. 비우면 전체 테마 목록을 반환합니다.
    """
    return call_tr(config, access_token, "/api/v1/ivs11430", {"thm_cd": theme_code})


def get_market_summary(config: KBOpenApiConfig, access_token: str) -> dict:
    """IVSA0070 - 시장종합 조회.

    별도 조회조건 없이(dataBody={}) 코스피/코스닥 등 시장 종합 현황을 반환합니다.
    """
    return call_tr(config, access_token, "/api/v1/ivsa0070", {})


def get_world_index(config: KBOpenApiConfig, access_token: str, continent: str = "1") -> dict:
    """IVA60140 - 세계지수 조회.

    Args:
        continent: 대륙구분. "1"=주요지수, "C"=아메리카, "E"=유럽, "S"=아시아 (기본값 "1")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/iva60140",
        {"lnd_clsf": continent, "prd_clsf": "1"},
    )


def get_sector_ranking(config: KBOpenApiConfig, access_token: str, market: str = "1") -> dict:
    """IVM30010 - 업종랭킹 조회.

    Args:
        market: 시장구분. "1"=코스피, "2"=코스닥 (기본값 "1")
    """
    return call_tr(config, access_token, "/api/v1/ivm30010", {"mkt_clsf": market})


def get_exchange_rate_summary(config: KBOpenApiConfig, access_token: str) -> dict:
    """IVA60190 - 환율종합 조회.

    별도 조회조건 없이(dataBody={}) 전체 통화의 환율 정보를 반환합니다.
    """
    return call_tr(config, access_token, "/api/v1/iva60190", {})


def get_market_fund_flow(config: KBOpenApiConfig, access_token: str) -> dict:
    """IVA10370 - 증시주변자금동향 조회.

    별도 조회조건 없이(dataBody={}) 고객예탁금 등 증시 주변 자금 동향을 반환합니다.
    """
    return call_tr(config, access_token, "/api/v1/iva10370", {})


def get_market_status(config: KBOpenApiConfig, access_token: str) -> dict:
    """SZQM0771 - 장운영상태 조회.

    별도 조회조건 없이(dataBody={}) 현재 장 운영 상태를 반환합니다.
    """
    return call_tr(config, access_token, "/api/v1/szqm0771", {})


# ---------------------------------------------------------------------------
# 5) 기타 (공휴일 / 종목마스터)
# ---------------------------------------------------------------------------


def get_holiday_info(
    config: KBOpenApiConfig,
    access_token: str,
    end_date: str,
    country: str = "KR",
) -> dict:
    """SPAM2508 - 공휴일관리 조회.

    Args:
        end_date: 조회 종료일자 (YYYYMMDD, 필수)
        country: ISO 국가코드 (예: "KR"=한국, "US"=미국). 기본값 "KR"
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/spam2508",
        {
            "hndl_clsf": "4",  # 처리구분: 4=조회
            "iso_cd": country,
            "dr_dt": "",
            "end_dt": end_date,
            "nxt_bsnss_dy": "",
            "nxt_stlmt_dt": "",
            "hldy_ccd": "",
            "frgn_stk_ordr_psbl_f": "",
        },
    )


def get_stock_master_info(
    config: KBOpenApiConfig, access_token: str, stock_code: str, **extra_fields: str
) -> dict:
    """SIAM4983 - 종목관리(종목 마스터) 조회.

    이 TR은 상장일자/매매제한/입출제한 등 90여 개의 세부 필드를 조회조건으로 받을
    수 있는 대형 조회 TR입니다. 여기서는 가장 자주 쓰는 종목코드만 파라미터로 받고,
    나머지 조건은 필요할 때 키워드 인자로 덧붙일 수 있게 했습니다.

    Args:
        stock_code: 표준/단축/심볼/자체 종목코드에 공통으로 사용할 종목코드 (예: "005930")
        **extra_fields: 그 외 조회조건(dl_mkt_ccd, isng_ntn_cd 등)을 필요할 때만 추가.
            전체 필드 목록은 samples.generated.json의 "Tkb_SIAM4983_B2C" 항목을 참고하세요.
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/siam4983",
        {
            "hndl_clsf": "4",  # 처리구분: 4=조회
            "stnd_is_cd": stock_code,
            "shrt_is_cd": stock_code,
            "symbl_is_cd": stock_code,
            "slf_is_cd": stock_code,
            **extra_fields,
        },
    )


# ---------------------------------------------------------------------------
# 6) 해외주식(GS) 시세
# ---------------------------------------------------------------------------


def get_global_stock_price(
    config: KBOpenApiConfig, access_token: str, stock_code: str, exchange: str = "NAS"
) -> dict:
    """GSS10030 - (해외주식) 현재가 조회.

    Args:
        stock_code: 종목코드
        exchange: 거래소코드. "NAS"=나스닥, "NYS"=뉴욕, "AMX"=아멕스, "HKS"=홍콩,
            "SHS"=상하이, "SZS"=심천, "TSE"=일본, "HSX"=호치민, "HNX"=하노이 (기본값 "NAS")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/gss10030",
        {"krx_cd": exchange, "is_cd": stock_code},
    )


def get_global_stock_orderbook(
    config: KBOpenApiConfig, access_token: str, stock_code: str, exchange: str = "NAS"
) -> dict:
    """GSS10040 - (해외주식) 호가 조회.

    Args:
        stock_code: 종목코드
        exchange: 거래소코드 (get_global_stock_price 참고, 기본값 "NAS")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/gss10040",
        {"krx_cd": exchange, "is_cd": stock_code},
    )


def get_global_stock_tick_trades(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    exchange: str = "NAS",
    count: str = "10",
) -> dict:
    """GSA10020 - (해외주식) 시간대별체결 조회.

    Args:
        stock_code: 종목코드
        exchange: 거래소코드 (get_global_stock_price 참고, 기본값 "NAS")
        count: 레코드 수 (기본값 "10")
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/gsa10020",
        {"krx_cd": exchange, "is_cd": stock_code, "rcrd_c": count},
    )


def get_global_stock_chart(
    config: KBOpenApiConfig,
    access_token: str,
    stock_code: str,
    exchange: str = "NAS",
    chart_type: str = "3",
    count: str = "10",
    adjusted_price: bool = False,
) -> dict:
    """GSC10060 - (해외주식) 차트 조회.

    Args:
        stock_code: 종목코드
        exchange: 거래소코드 (get_global_stock_price 참고, 기본값 "NAS")
        chart_type: 차트구분. "1"=틱, "2"=분, "3"=일(기본값), "4"=주, "5"=월, "6"=년
        count: 레코드 수, 최대 5000 (기본값 "10")
        adjusted_price: True면 수정주가 사용, False(기본값)면 미사용
    """
    return call_tr(
        config,
        access_token,
        "/api/v1/gsc10060",
        {
            "krx_cd": exchange,
            "is_cd": stock_code,
            "chrt_clsf": chart_type,
            "bndl": "",  # 묶음틱 개수 (틱 차트일 때만 사용)
            "mdfy_stk_prc_use_f": "1" if adjusted_price else "0",
            "rcrd_c": count,
            "srch_strt_dy": "",  # 과거 조회 시작일(YYYYMMDD), 비우면 최근 데이터부터
            "clsf": "1",
        },
    )


# ---------------------------------------------------------------------------
# 실행: 대표 5종만 호출합니다. 나머지 함수는 위에서 바로 import해서 사용하세요.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    config = load_config()

    # 투자정보 API는 모두 로그인이 필요하므로, 먼저 access_token을 발급받습니다.
    # (auth_example.py의 get_access_token()을 그대로 재사용)
    access_token = get_access_token()
    print(f"access_token 발급 완료 ({len(access_token)}자)")

    SAMPLE_STOCK_CODE = "005930"  # 삼성전자

    print_json(
        f"[SIQM4900] 종목기본정보 - {SAMPLE_STOCK_CODE}",
        get_stock_base_info(config, access_token, SAMPLE_STOCK_CODE),
    )
    print_json(
        f"[IVU10140] 주식현재가 - {SAMPLE_STOCK_CODE}",
        get_stock_current_price(config, access_token, SAMPLE_STOCK_CODE),
    )
    print_json(
        f"[IVU10070] 주식호가 - {SAMPLE_STOCK_CODE}",
        get_stock_orderbook(config, access_token, SAMPLE_STOCK_CODE),
    )
    print_json(
        f"[IVS11560] 통합차트(일봉 10건) - {SAMPLE_STOCK_CODE}",
        get_integrated_chart(config, access_token, SAMPLE_STOCK_CODE),
    )
    print_json(
        "[IVA60190] 환율종합",
        get_exchange_rate_summary(config, access_token),
    )
