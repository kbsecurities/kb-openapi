"use client";

import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

export type OpenApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OpenApiFieldSpec = {
  korean?: string;
  name?: string;
  type?: string;
  length?: string;
  decimal?: string;
  note?: string;
  default?: string;
  skipValue?: string;
  description?: string;
  required?: string | boolean;
};

export type OpenApiSample = {
  id: string;
  label: string;
  method: OpenApiMethod;
  path: string;
  description: string;
  businessCategory?: OpenApiBusinessGroup;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  baseUrl?: string;
  source?: "postman" | "trx-rule";
  inputSpec?: OpenApiFieldSpec[];
  outputSpec?: OpenApiFieldSpec[];
};

export type OpenApiTokenProcedure = {
  id: string;
  label: string;
  mode: "B2C" | "B2B" | "COMMON";
  environment: string;
  steps: string[];
  recommendedHeaders?: string[];
  note?: string;
};

type OpenApiBusinessCategory =
  | "전체목록"
  | "계좌개설"
  | "고객계좌"
  | "트레이딩"
  | "금융상품"
  | "연금자산"
  | "투자정보"
  | "공모청약"
  | "자문일임"
  | "기타항목";
type OpenApiBusinessGroup = Exclude<OpenApiBusinessCategory, "전체목록">;
type OpenApiTokenMode = "B2C" | "B2B" | "COMMON";
type RuntimeMode = "development" | "production";

const CHECKBOX_INPUT_STYLE: CSSProperties = { caretColor: "transparent" };

type RunResult = {
  status: number;
  ok: boolean;
  elapsedMs: number;
  body: string;
  headers: string;
};

type RunHistory = {
  id: string;
  executedAt: string;
  method: OpenApiMethod;
  baseUrl?: string;
  path?: string;
  requestUrl: string;
  status: number;
  ok: boolean;
  elapsedMs: number;
  sampleId: string;
  sampleLabel?: string;
  requestHeaders?: string;
  requestBody?: string;
  body?: string;
  headers?: string;
};

type RequestRunOutcome = RunResult & {
  historyItem?: RunHistory;
};

type ManagedRealtimeState = {
  enabled: boolean;
  connected: boolean;
  connectionStatus: string;
  status: string;
  messages: string[];
  lastUpdatedAt?: string;
  url?: string;
};

type ManagedRealtimeConnectionState = {
  connected: boolean;
  status: string;
  messages: string[];
  lastUpdatedAt?: string;
  url?: string;
};

type ParsedRealtimeMessage =
  | {
      kind: "ack";
      ok: boolean;
      message: string;
      raw: string;
      trId?: string;
      trKey?: string;
    }
  | {
      kind: "data";
      label: string;
      raw: string;
      trId?: string;
      trKey?: string;
    }
  | {
      kind: "message";
      label: string;
      raw: string;
    };

type TokenRequestDraft = {
  id: string;
  mode: OpenApiTokenMode;
  label: string;
  description: string;
  method: OpenApiMethod;
  baseUrl: string;
  path: string;
  headersText: string;
  bodyText: string;
};

type OpenApiTokenRequestDefault = {
  method?: OpenApiMethod;
  baseUrl?: string;
  path?: string;
  body?: unknown;
};
type TokenSetupStepKey = "b2cToken" | "terms" | "financial" | "authCode" | "token";

type TokenIssueStatus = {
  state: "idle" | "running" | "issued" | "issuedWithoutToken" | "failed";
  status?: number;
  updatedAt?: string;
};

type OpenApiProxyResponse = {
  status: number;
  ok: boolean;
  headers?: Record<string, unknown>;
  requestHeaders?: Record<string, unknown>;
  body: string;
};

type OpenApiTestDefaults = {
  runtimeMode?: string;
  kb?: {
    b2c?: {
      appsBaseUrl?: string;
      tokenBaseUrl?: string;
      appRegistration?: unknown;
      tokenIssue?: unknown;
    };
    b2b?: {
      activeMode?: string;
      baseUrl?: string;
      clientId?: string;
      clientSecret?: string;
      scope?: string;
      account?: string;
      productCode?: string;
      ciNo?: string;
      userInfo?: string;
      device?: Record<string, unknown>;
      requests?: {
        clauseAgree?: OpenApiTokenRequestDefault;
        emailAgree?: OpenApiTokenRequestDefault;
        authIssue?: OpenApiTokenRequestDefault;
        tokenIssue?: OpenApiTokenRequestDefault;
      };
    };
  };
  kis?: {
    activeEnvironment?: string;
    restBaseUrl?: string;
    websocketUrl?: string;
    clientId?: string;
    clientSecret?: string;
    tokenIssue?: OpenApiTokenRequestDefault;
    websocketApproval?: OpenApiTokenRequestDefault;
  };
};

type OpenApiTestClientProps = {
  headerContent?: ReactNode;
  modeSelectorContent?: ReactNode;
  runtimeMode?: RuntimeMode;
  samples: OpenApiSample[];
  realtimeSamples?: OpenApiSample[];
  historyStorageKey: string;
  defaultBaseUrl: string;
  broker?: string;
  defaultApiKey?: string;
  defaultSecretKey?: string;
  credentialStorageKey?: string;
  tokenProcedures?: OpenApiTokenProcedure[];
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
const METHOD_OPTIONS: OpenApiMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BUSINESS_CATEGORY_OPTIONS: OpenApiBusinessCategory[] = [
  "전체목록",
  "계좌개설",
  "고객계좌",
  "트레이딩",
  "금융상품",
  "연금자산",
  "투자정보",
  "공모청약",
  "자문일임",
  "기타항목",
];
const BUSINESS_GROUPS: OpenApiBusinessGroup[] = BUSINESS_CATEGORY_OPTIONS.filter(
  (category): category is OpenApiBusinessGroup => category !== "전체목록"
);
const DEFAULT_CREDENTIAL_STORAGE_KEY = "openapi.test.credentials";
const CREDENTIAL_HEADER_PREFIX = "X-";
const IS_OPENAPI_PRODUCTION_MODE = ["production", "prod"].includes(
  (process.env.NEXT_PUBLIC_OPENAPI_MODE || "development").toLowerCase()
);
const KB_B2C_TOKEN_BASE_URL = IS_OPENAPI_PRODUCTION_MODE
  ? process.env.NEXT_PUBLIC_OPENAPI_PROD_KB_B2C_TOKEN_BASE_URL || "https://developer.kbsec.com:32484"
  : process.env.NEXT_PUBLIC_OPENAPI_DEV_KB_B2C_TOKEN_BASE_URL || "https://ddeveloper.kbsec.com:32484";
const KB_B2B_BASE_URL = IS_OPENAPI_PRODUCTION_MODE
  ? process.env.NEXT_PUBLIC_OPENAPI_PROD_KB_B2B_BASE_URL || "https://baasapi.kbsec.com:32484"
  : process.env.NEXT_PUBLIC_OPENAPI_DEV_KB_B2B_BASE_URL || "https://dbaasapi.kbsec.com:32484";
const KIS_REAL_BASE_URL = "https://openapi.koreainvestment.com:9443";
const KIS_PAPER_BASE_URL = "https://openapivts.koreainvestment.com:29443";
const JSON_HEADERS_TEXT = `{\n  "Content-Type": "application/json"\n}`;
const MAX_HISTORY_PER_SAMPLE = 20;
const MAX_HISTORY_TOTAL = 200;
const B2C_TOKEN_SETUP_STEP_ORDER: TokenSetupStepKey[] = ["b2cToken"];
const B2B_TOKEN_SETUP_STEP_ORDER: TokenSetupStepKey[] = ["terms", "financial", "authCode", "token"];
const TOKEN_SETUP_STEP_META: Record<TokenSetupStepKey, { label: string; description: string }> = {
  b2cToken: {
    label: "토큰발급",
    description: "oauth2/token 호출 후 access_token을 발급합니다.",
  },
  terms: {
    label: "이용약관동의",
    description: "clause_agree_process 등록 상태를 확인합니다.",
  },
  financial: {
    label: "금융거래동의",
    description: "email_agree_process 등록 상태를 확인합니다.",
  },
  authCode: {
    label: "인가코드발급",
    description: "baas_auth_issue 호출 후 code와 issueNo를 발급합니다.",
  },
  token: {
    label: "토큰발급",
    description: "baas_token_issue 호출 후 access_token을 발급합니다.",
  },
};

function normalizeBaseUrl(raw: string) {
  return raw.trim().replace(/\/+$/, "");
}

function ensureMethod(method: string): OpenApiMethod {
  const normalized = method.toUpperCase();
  if (normalized === "GET" || normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE") {
    return normalized;
  }
  return "POST";
}

function prettyJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

function specText(value: string | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed || "-";
}

function fieldLengthText(field: OpenApiFieldSpec) {
  const length = (field.length ?? "").trim();
  const decimal = (field.decimal ?? "").trim();
  if (!length && !decimal) return "-";
  if (decimal && decimal !== "0") return `${length || "0"}.${decimal}`;
  return length || "-";
}

function fieldSpecKey(field: OpenApiFieldSpec, index: number) {
  return `${field.name || field.korean || "field"}::${index}`;
}

function fieldRequiredText(field: OpenApiFieldSpec) {
  const value = field.required;
  if (typeof value === "boolean") return value ? "Y" : "N";
  const text = (value ?? "").trim();
  const upper = text.toUpperCase();
  if (!text) return "N";
  if (["1", "Y", "YES", "TRUE", "M", "MANDATORY", "REQUIRED"].includes(upper) || text.includes("필수")) {
    return "Y";
  }
  return "N";
}

function RequiredJsonBodyEditor({
  value,
  onChange,
  rows,
  className = "",
  textClassName = "text-sm",
}: {
  value: string;
  onChange: (value: string) => void;
  rows: number;
  className?: string;
  textClassName?: string;
}) {
  const highlightRef = useRef<HTMLPreElement>(null);
  const lines = value.split("\n");
  const textClasses = `${textClassName} font-mono leading-6`;

  return (
    <div className={`relative rounded-md border border-slate-200 bg-white focus-within:border-[#fcb514] ${className}`}>
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3 py-2 ${textClasses} text-slate-700`}
      >
        {lines.map((line, index) => (
          <span key={`${index}-${line}`}>
            {line || " "}
            {index < lines.length - 1 ? "\n" : ""}
          </span>
        ))}
      </pre>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (!highlightRef.current) return;
          highlightRef.current.scrollTop = event.currentTarget.scrollTop;
          highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }}
        rows={rows}
        spellCheck={false}
        className={`relative z-10 block w-full resize-y bg-transparent px-3 py-2 ${textClasses} text-transparent caret-slate-900 outline-none selection:bg-[#fcb514]/30`}
      />
    </div>
  );
}

function SpecTable({ title, fields }: { title: "Input" | "Output"; fields?: OpenApiFieldSpec[] }) {
  const items = fields ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-xs font-black text-slate-700">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
          {items.length}개
        </span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-4 text-xs font-semibold text-slate-500">표시할 명세가 없습니다.</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="min-w-[760px] table-fixed border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-[11px] font-black text-slate-500">
              <tr>
                <th className="w-[28%] px-3 py-2">필드</th>
                <th className="w-[22%] px-3 py-2">속성</th>
                <th className="w-[10%] px-3 py-2 text-center">필수</th>
                <th className="px-3 py-2">설명</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((field, index) => (
                <tr key={`${title}-${fieldSpecKey(field, index)}`} className="align-top">
                  <td className="px-3 py-2">
                    <p className="break-words font-black text-slate-700">{specText(field.korean || field.name)}</p>
                    <p className="mt-1 break-all font-mono text-[11px] font-semibold text-slate-500">
                      {specText(field.name)}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[11px] font-semibold text-slate-600">
                    <p>
                      타입 <span className="font-mono text-slate-800">{specText(field.type)}</span>
                    </p>
                    <p className="mt-1">
                      길이 <span className="font-mono text-slate-800">{fieldLengthText(field)}</span>
                    </p>
                    {field.default ? (
                      <p className="mt-1 break-all">
                        기본값 <span className="font-mono text-slate-800">{field.default}</span>
                      </p>
                    ) : null}
                    {field.note && field.note !== "Field" ? (
                      <p className="mt-1 break-words text-slate-500">{field.note}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-center text-[11px] font-black text-slate-700">
                    {fieldRequiredText(field)}
                  </td>
                  <td className="whitespace-pre-wrap break-words px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-600">
                    {field.description?.trim() || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SampleSpecPanel({ sample }: { sample: OpenApiSample | null }) {
  return (
    <div className="space-y-3">
      <div className="min-w-0">
        <p className="text-[11px] font-black uppercase tracking-normal text-slate-500">Input / Output</p>
        <h3 className="mt-1 break-words text-sm font-black text-[#2c2a26]">
          {sample ? sample.label : "전문을 선택하세요"}
        </h3>
      </div>
      {sample ? (
        <>
          <SpecTable title="Input" fields={sample.inputSpec} />
          <SpecTable title="Output" fields={sample.outputSpec} />
        </>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-xs font-semibold text-slate-500">
          전문을 선택하면 입력/출력 명세가 표시됩니다.
        </p>
      )}
    </div>
  );
}

function parseJson(value: string): { parsed: Record<string, unknown> | undefined; error: string | null; text: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { parsed: {}, error: null, text: trimmed };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        parsed: undefined,
        error: "JSON 최상위 값은 객체여야 합니다.",
        text: trimmed,
      };
    }
    return { parsed, error: null, text: trimmed };
  } catch (error) {
    return {
      parsed: undefined,
      error: error instanceof Error ? error.message : "잘못된 JSON 형식입니다.",
      text: trimmed,
    };
  }
}

function parseBody(value: string): { parsed: unknown; error: string | null; text: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { parsed: {}, error: null, text: trimmed };
  }

  try {
    return { parsed: JSON.parse(trimmed), error: null, text: trimmed };
  } catch (error) {
    return {
      parsed: undefined,
      error: error instanceof Error ? error.message : "잘못된 JSON 형식입니다.",
      text: trimmed,
    };
  }
}

function applyRequestVariables(value: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce((nextValue, [key, replacement]) => {
    return nextValue.replaceAll(`{{${key}}}`, replacement);
  }, value);
}

function applyRealtimeSubscriptionKey(body: unknown, subscriptionKey: string) {
  const trimmedKey = subscriptionKey.trim();
  if (!trimmedKey || !body || typeof body !== "object" || Array.isArray(body)) return body;

  const updateDefaultStockKey = (input: Record<string, unknown>) => {
    if (input.tr_key === "005930") {
      input.tr_key = trimmedKey;
    }
  };

  const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const directInput = cloned.input;
  if (directInput && typeof directInput === "object" && !Array.isArray(directInput) && "tr_key" in directInput) {
    updateDefaultStockKey(directInput as Record<string, unknown>);
  }

  const nestedBody = cloned.body;
  if (nestedBody && typeof nestedBody === "object" && !Array.isArray(nestedBody)) {
    const nestedInput = (nestedBody as Record<string, unknown>).input;
    if (nestedInput && typeof nestedInput === "object" && !Array.isArray(nestedInput) && "tr_key" in nestedInput) {
      updateDefaultStockKey(nestedInput as Record<string, unknown>);
    }
  }
  return cloned;
}

function applyRealtimeTrType(body: unknown, trType: "1" | "2") {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;

  const cloned = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  const header = cloned.header;
  if (header && typeof header === "object" && !Array.isArray(header) && "tr_type" in header) {
    (header as Record<string, unknown>).tr_type = trType;
  }
  return cloned;
}

const ACCESS_TOKEN_KEYS = [
  "access_token",
  "access-token",
  "accessToken",
  "accessTokenValue",
  "access_token_value",
  "accessTokenString",
  "accesstoken",
  "authorization",
  "oauthToken",
  "oauth_token",
];
const FALLBACK_TOKEN_KEYS = ["token", "tokenValue", "bearerToken", "bearer_token"];

type AccessTokenExtractOptions = {
  includeFallbackTokenKeys?: boolean;
};

function normalizeExtractedToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed || /^bearer$/i.test(trimmed)) return "";
  return trimmed.replace(/^bearer\s+/i, "");
}

function normalizeResponseText(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function parseNestedJsonString(value: string): unknown {
  const trimmed = normalizeResponseText(value);
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function findUrlEncodedValue(value: string, keys: string[]) {
  const trimmed = normalizeResponseText(value).replace(/^\?/, "");
  if (!trimmed.includes("=")) return "";
  try {
    const params = new URLSearchParams(trimmed);
    const targetKeys = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, paramValue] of params.entries()) {
      if (targetKeys.has(key.toLowerCase()) && paramValue.trim()) return paramValue.trim();
    }
  } catch {
    return "";
  }
  return "";
}

function extractBearerToken(value: string) {
  const trimmed = normalizeResponseText(value);
  const headerMatch = trimmed.match(/(?:^|\r?\n)\s*authorization\s*:\s*bearer\s+([^\s\r\n,]+)/i);
  if (headerMatch?.[1]) return headerMatch[1];
  const bearerMatch = trimmed.match(/\bbearer\s+([A-Za-z0-9._~+/=-]+)/i);
  return bearerMatch?.[1] ?? "";
}

function extractNamedTokenFromText(value: string, keys: string[]) {
  const trimmed = normalizeResponseText(value);
  for (const key of keys) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = trimmed.match(new RegExp(`(?:^|[\\s,{])["']?${escapedKey}["']?\\s*[:=]\\s*["']?([^"',\\s&}]+)`, "i"));
    const token = normalizeExtractedToken(match?.[1] ?? "");
    if (token) return token;
  }
  return "";
}

function extractAccessToken(value: string, options: AccessTokenExtractOptions = {}) {
  const trimmed = normalizeResponseText(value);
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    const accessToken = normalizeExtractedToken(findStringValue(parsed, ACCESS_TOKEN_KEYS));
    if (accessToken) return accessToken;
    if (options.includeFallbackTokenKeys) {
      const fallbackToken = normalizeExtractedToken(findStringValue(parsed, FALLBACK_TOKEN_KEYS));
      if (fallbackToken) return fallbackToken;
    }
  } catch {
    // Continue with non-JSON token response formats below.
  }

  const urlEncodedAccessToken = normalizeExtractedToken(findUrlEncodedValue(trimmed, ACCESS_TOKEN_KEYS));
  if (urlEncodedAccessToken) return urlEncodedAccessToken;
  if (options.includeFallbackTokenKeys) {
    const urlEncodedFallbackToken = normalizeExtractedToken(findUrlEncodedValue(trimmed, FALLBACK_TOKEN_KEYS));
    if (urlEncodedFallbackToken) return urlEncodedFallbackToken;
  }

  const bearerToken = normalizeExtractedToken(extractBearerToken(trimmed));
  if (bearerToken) return bearerToken;

  const namedAccessToken = extractNamedTokenFromText(trimmed, ACCESS_TOKEN_KEYS);
  if (namedAccessToken) return namedAccessToken;
  return options.includeFallbackTokenKeys ? extractNamedTokenFromText(trimmed, FALLBACK_TOKEN_KEYS) : "";
}

function extractApprovalKey(value: string) {
  try {
    const parsed = JSON.parse(normalizeResponseText(value));
    return findStringValue(parsed, ["approval_key", "approvalKey"]);
  } catch {
    return "";
  }
}

function extractAccessTokenExpiresAt(value: string) {
  const findValue = (target: unknown, keys: string[]): unknown => {
    if (!target || typeof target !== "object") return undefined;
    const record = target as Record<string, unknown>;
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== "") return record[key];
    }
    for (const nestedValue of Object.values(record)) {
      const found = findValue(nestedValue, keys);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  };

  try {
    const parsed = JSON.parse(normalizeResponseText(value));
    const absoluteValue = findValue(parsed, [
      "expiresAt",
      "expires_at",
      "expireAt",
      "expire_at",
      "accessTokenExpiresAt",
      "access_token_expires_at",
    ]);
    if (typeof absoluteValue === "string") {
      const timestamp = Date.parse(absoluteValue);
      if (!Number.isNaN(timestamp)) return new Date(timestamp).toISOString();
    }

    const expiresInValue = findValue(parsed, ["expires_in", "expiresIn", "expireIn", "expire_in"]);
    const expiresInSeconds =
      typeof expiresInValue === "number"
        ? expiresInValue
        : typeof expiresInValue === "string"
        ? Number(expiresInValue)
        : 0;
    if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
      return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    }
  } catch {
    return "";
  }

  return "";
}

function findStringValue(value: unknown, keys: string[], visited = new Set<unknown>()): string {
  if (typeof value === "string") {
    const parsed = parseNestedJsonString(value);
    return parsed === undefined ? "" : findStringValue(parsed, keys, visited);
  }
  if (!value || typeof value !== "object") return "";
  if (visited.has(value)) return "";
  visited.add(value);
  const record = value as Record<string, unknown>;
  const targetKeys = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, direct] of Object.entries(record)) {
    if (targetKeys.has(key.toLowerCase()) && typeof direct === "string" && direct.trim()) return direct.trim();
  }
  for (const nestedValue of Object.values(record)) {
    const found = findStringValue(nestedValue, keys, visited);
    if (found) return found;
  }
  return "";
}

function parseRealtimeSocketMessage(message: string): ParsedRealtimeMessage {
  const trimmed = message.trim();
  if (!trimmed) return { kind: "message", label: "수신", raw: message };

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const rtCd = findStringValue(parsed, ["rt_cd", "rtCd"]);
      const ackMessage = findStringValue(parsed, ["msg1", "message", "msg"]);
      if (rtCd || ackMessage) {
        return {
          kind: "ack",
          ok: rtCd === "0",
          message: ackMessage || (rtCd === "0" ? "구독 성공" : "구독 실패"),
          raw: message,
          trId: findStringValue(parsed, ["tr_id", "trId"]),
          trKey: findStringValue(parsed, ["tr_key", "trKey"]),
        };
      }
    } catch {
      return { kind: "message", label: "수신", raw: message };
    }
  }

  const realtimeParts = trimmed.split("|");
  if ((realtimeParts[0] === "0" || realtimeParts[0] === "1") && realtimeParts.length >= 4) {
    const dataFields = realtimeParts.slice(3).join("|").split("^");
    return {
      kind: "data",
      label: realtimeParts[0] === "1" ? "수신(체결통보)" : "수신",
      raw: message,
      trId: realtimeParts[1],
      trKey: dataFields[0],
    };
  }

  return { kind: "message", label: "수신", raw: message };
}

function describeRealtimeAckFailure(message: string) {
  if (isRealtimeInvalidApproval(message)) {
    return "KIS approval_key가 유효하지 않아 새 실시간 접속키를 발급합니다.";
  }
  if (isRealtimeDuplicateAppKey(message)) {
    return "이미 같은 KIS appkey로 실시간 구독이 열려 있습니다. 기존 실시간 연결을 정리한 뒤 다시 연결하세요.";
  }
  if (message.toUpperCase().includes("MAX SUBSCRIBE OVER")) {
    return "KIS 동시 구독 한도를 초과했습니다. 일부 실시간 항목을 OFF 한 뒤 다시 시도하세요.";
  }
  return message || "실시간 구독 승인에 실패했습니다.";
}

function isRealtimeInvalidApproval(message: string) {
  const normalized = message.toUpperCase();
  return normalized.includes("INVALID APPROVAL") || normalized.includes("INVALID APPROVAL_KEY");
}

function isRealtimeDuplicateAppKey(message: string) {
  return message.toUpperCase().includes("ALREADY IN USE APPKEY");
}

function isRealtimeUnsubscribeAck(message: string) {
  const normalized = message.toUpperCase();
  return normalized.includes("UNSUBSCRIBE") || normalized.includes("UNSUB");
}

function getRealtimeAutoSubscribeBlockReason(sample: OpenApiSample) {
  const trKey = findStringValue(sample.body, ["tr_key", "trKey"]).trim();
  const normalizedKey = trKey.toUpperCase();
  if (!trKey || trKey.includes("{{")) return "자동 구독에 필요한 TR KEY를 먼저 설정하세요.";
  if (normalizedKey.includes("HTS")) return "HTS ID가 필요한 통보형 실시간은 개별 설정 후 ON 해주세요.";
  return "";
}

function extractAuthIssueValues(value: string) {
  try {
    const parsed = JSON.parse(value);
    return {
      code: findStringValue(parsed, ["code", "authCode", "authorizationCode"]),
      issueNo: findStringValue(parsed, ["issueNo", "issueNumber", "issNo"]),
    };
  } catch {
    return { code: "", issueNo: "" };
  }
}

function maskToken(value: string) {
  if (!value) return "";
  if (value.length <= 16) return "********";
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function isAbsoluteUrl(value: string) {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(value);
}

function normalizePath(raw: string) {
  const path = raw.trim();
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function makeBusinessGroupMap<T>(initialValue: () => T) {
  return BUSINESS_GROUPS.reduce((result, category) => {
    result[category] = initialValue();
    return result;
  }, {} as Record<OpenApiBusinessGroup, T>);
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectSampleBusinessCategory(sample: OpenApiSample): OpenApiBusinessGroup {
  const explicitCategory = (sample as { businessCategory?: OpenApiBusinessGroup }).businessCategory;
  if (explicitCategory && BUSINESS_GROUPS.includes(explicitCategory)) return explicitCategory;

  const text = `${sample.id} ${sample.label} ${sample.path} ${sample.description}`.toLowerCase();
  if (includesAny(text, ["계좌개설", "계좌 개설", "account open", "open account", "new account", "acctopen", "신규계좌", "비대면"])) return "계좌개설";
  if (includesAny(text, ["거래내역", "잔고", "예수금", "계좌", "고객", "ledger", "balance", "deposit", "account", "customer", "portfolio"])) return "고객계좌";
  if (includesAny(text, ["주문", "체결", "매수", "매도", "정정", "취소", "trading", "order", "execution", "buy", "sell"])) return "트레이딩";
  if (includesAny(text, ["금융상품", "펀드", "채권", "els", "dls", "랩", "isa", "product", "fund", "bond"])) return "금융상품";
  if (includesAny(text, ["연금", "퇴직", "irp", "pension", "retirement"])) return "연금자산";
  if (includesAny(text, ["투자정보", "시세", "종목", "주가", "호가", "차트", "뉴스", "지수", "quote", "price", "market", "chart", "stock info"])) return "투자정보";
  if (includesAny(text, ["공모", "청약", "ipo", "subscription", "public offering"])) return "공모청약";
  if (includesAny(text, ["자문", "일임", "advisory", "discretionary", "wrap"])) return "자문일임";
  return "기타항목";
}

function isWebSocketSample(sample: OpenApiSample) {
  const category = (sample as { category?: string }).category;
  if (category === "WEBSOCKET") return true;
  if (sample.baseUrl?.trim().toLowerCase().startsWith("ws")) return true;
  if (sample.path.trim().toLowerCase().startsWith("ws")) return true;
  return Boolean(findStringValue(sample.body, ["approval_key", "approvalKey"]) && findStringValue(sample.body, ["tr_id", "trId"]));
}

function toRequestUrl(base: string, path: string, query: Record<string, unknown>) {
  const requestPath = path.trim();
  const queryEntries = Object.entries(query);
  if (!requestPath) {
    return normalizeBaseUrl(base) || "http://localhost:8020";
  }

  if (isAbsoluteUrl(requestPath)) {
    const url = new URL(requestPath);
    for (const [key, value] of queryEntries) {
      if (!key.trim()) continue;
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  const normalizedBase = normalizeBaseUrl(base) || "http://localhost:8020";
  const url = new URL(normalizePath(requestPath), normalizedBase);
  for (const [key, value] of queryEntries) {
    if (!key.trim()) continue;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function shouldProxyRequest(requestUrl: string) {
  if (typeof window === "undefined") return false;
  try {
    const target = new URL(requestUrl);
    return (
      target.hostname === "kbsec.com" ||
      target.hostname.endsWith(".kbsec.com") ||
      target.hostname === "koreainvestment.com" ||
      target.hostname.endsWith(".koreainvestment.com")
    );
  } catch {
    return false;
  }
}

function shouldEncryptRequest(requestUrl: string) {
  try {
    const target = new URL(requestUrl);
    if (!/\/baas\/v2\//i.test(target.pathname)) return false;
    return !/\/baas\/v2\/(clause_agree_process|email_agree_process|baas_auth_issue|baas_token_issue|baas_token_revoke)$/i.test(
      target.pathname
    );
  } catch {
    return false;
  }
}

function isTokenRequestUrl(requestUrl: string) {
  try {
    const target = new URL(requestUrl);
    return /\/oauth2\/tokenp?$/i.test(target.pathname) || /\/baas\/v2\/baas_token_issue$/i.test(target.pathname);
  } catch {
    return /\/oauth2\/tokenp?$/i.test(requestUrl) || /\/baas\/v2\/baas_token_issue$/i.test(requestUrl);
  }
}

function formatResponseHeaders(headers: Record<string, unknown>) {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${String(value)}`)
    .join("\n");
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function realtimeMessageLine(prefix: string, message: string) {
  return `[${new Date().toLocaleTimeString("ko-KR")}] ${prefix}: ${message}`;
}

function keepRecentHistoryBySample(items: RunHistory[]) {
  const counts = new Map<string, number>();
  const kept: RunHistory[] = [];
  for (const item of items) {
    const sampleKey = item.sampleId || "legacy";
    const nextCount = (counts.get(sampleKey) || 0) + 1;
    counts.set(sampleKey, nextCount);
    if (nextCount <= MAX_HISTORY_PER_SAMPLE) {
      kept.push({ ...item, sampleId: sampleKey });
    }
    if (kept.length >= MAX_HISTORY_TOTAL) {
      break;
    }
  }
  return kept;
}

function getTokenSetupStepKey(draft: TokenRequestDraft): TokenSetupStepKey | null {
  if (draft.id === "kb-b2c-token-issue") return "b2cToken";
  if (draft.id === "kb-b2b-clause-agree-process") return "terms";
  if (draft.id === "kb-b2b-email-agree-process") return "financial";
  if (draft.id === "kb-b2b-auth-issue") return "authCode";
  if (draft.id === "kb-b2b-token-issue") return "token";
  return null;
}

function isTokenIssueStepKey(stepKey: TokenSetupStepKey) {
  return stepKey === "b2cToken" || stepKey === "token";
}

function accessTokenExpiresAtTimestamp(value: string) {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isUsableAccessToken(token: string, expiresAt: string) {
  const trimmedToken = token.trim();
  if (!trimmedToken) return false;
  const timestamp = accessTokenExpiresAtTimestamp(expiresAt);
  return !timestamp || timestamp > Date.now();
}

function getStorageKey(storageKey: string | undefined, broker: string | undefined, fallback: string) {
  if (storageKey && storageKey.trim()) return storageKey.trim();
  if (broker && broker.trim()) return `${fallback}.${broker}`;
  return fallback;
}

function emptyCredentialStorage() {
  return {
    apiKey: "",
    secretKey: "",
    ciNo: "",
    userInfo: "",
    userInfoKey: "1",
    accessToken: "",
    accessTokenExpiresAt: "",
    approvalKey: "",
    authorizationCode: "",
    issueNo: "",
    accountNo: "",
    productCode: "01",
    accountPassword: "",
  };
}

function parseCredentialStorage(raw: string | null) {
  if (!raw) return emptyCredentialStorage();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyCredentialStorage();
    return {
      apiKey: typeof parsed.clientId === "string" ? parsed.clientId : typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      secretKey: typeof parsed.clientSecret === "string" ? parsed.clientSecret : typeof parsed.secretKey === "string" ? parsed.secretKey : "",
      ciNo: typeof parsed.ciNo === "string" ? parsed.ciNo : "",
      userInfo: typeof parsed.userInfo === "string" ? parsed.userInfo : "",
      userInfoKey: typeof parsed.userInfoKey === "string" ? parsed.userInfoKey : "1",
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : typeof parsed.access_token === "string" ? parsed.access_token : "",
      accessTokenExpiresAt: typeof parsed.accessTokenExpiresAt === "string" ? parsed.accessTokenExpiresAt : typeof parsed.expiresAt === "string" ? parsed.expiresAt : "",
      approvalKey: typeof parsed.approvalKey === "string" ? parsed.approvalKey : typeof parsed.approval_key === "string" ? parsed.approval_key : "",
      authorizationCode: typeof parsed.authorizationCode === "string" ? parsed.authorizationCode : typeof parsed.code === "string" ? parsed.code : "",
      issueNo: typeof parsed.issueNo === "string" ? parsed.issueNo : "",
      accountNo: typeof parsed.accountNo === "string" ? parsed.accountNo : typeof parsed.account === "string" ? parsed.account : "",
      productCode: typeof parsed.productCode === "string" ? parsed.productCode : typeof parsed.gdsNo === "string" ? parsed.gdsNo : "01",
      accountPassword: typeof parsed.accountPassword === "string" ? parsed.accountPassword : typeof parsed.pwd === "string" ? parsed.pwd : "",
    };
  } catch {
    return emptyCredentialStorage();
  }
}

function hasHeader(headers: Record<string, unknown>, target: string) {
  return Object.keys(headers).some((name) => name.toLowerCase() === target.toLowerCase());
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPrettyBody(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function tokenDataHeader(device: Record<string, unknown>, hsKey?: string) {
  return {
    ipAddr: asString(device.ipAddr) || "",
    macAddr: asString(device.macAddr) || "",
    ...(hsKey ? { hsKey } : {}),
  };
}

function normalizeDataEnvelope(value: unknown) {
  const record = asRecord(value);
  if ("dataHeader" in record || "dataBody" in record) {
    return {
      dataHeader: tokenDataHeader(asRecord(record.dataHeader)),
      dataBody: asRecord(record.dataBody),
    };
  }

  return {
    dataHeader: tokenDataHeader({}),
    dataBody: record,
  };
}

function toPrettyEnvelopeBody(value: unknown) {
  return toPrettyBody(normalizeDataEnvelope(value));
}
function asTokenRequestDefault(value: unknown): OpenApiTokenRequestDefault {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as OpenApiTokenRequestDefault;
}

function tokenDraftMethod(request: OpenApiTokenRequestDefault, fallback: OpenApiMethod = "POST"): OpenApiMethod {
  return request.method ? ensureMethod(request.method) : fallback;
}

function tokenDraftPath(request: OpenApiTokenRequestDefault, fallback: string): string {
  return asString(request.path) || fallback;
}

function tokenDraftBodyText(request: OpenApiTokenRequestDefault, fallback: unknown): string {
  return toPrettyEnvelopeBody(request.body !== undefined ? request.body : fallback);
}

function tokenDraftPlainBodyText(request: OpenApiTokenRequestDefault, fallback: unknown): string {
  return toPrettyBody(request.body !== undefined ? request.body : fallback);
}

function withCredentialPlaceholders(value: unknown) {
  const body = JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
  const dataBody = asRecord(body.dataBody);
  if (Object.keys(dataBody).length > 0 || "dataBody" in body) {
    body.dataBody = {
      ...dataBody,
      clientId: "{{clientId}}",
      clientSecret: "{{clientSecret}}",
    };
    return body;
  }
  return {
    ...body,
    clientId: "{{clientId}}",
    clientSecret: "{{clientSecret}}",
  };
}

function buildKbTokenRequestDrafts(defaults: OpenApiTestDefaults, modes: OpenApiTokenMode[]): TokenRequestDraft[] {
  const modeSet = new Set(modes);
  const drafts: TokenRequestDraft[] = [];
  const b2c = defaults.kb?.b2c ?? {};
  const b2b = defaults.kb?.b2b ?? {};

  if (modeSet.has("B2C")) {
    const tokenBody = asRecord(b2c.tokenIssue);
    drafts.push(
      {
        id: "kb-b2c-token-issue",
        mode: "B2C",
        label: "OAuth2 토큰 발급",
        description: "POST /oauth2/token",
        method: "POST",
        baseUrl: b2c.tokenBaseUrl || KB_B2C_TOKEN_BASE_URL,
        path: "/oauth2/token",
        headersText: JSON_HEADERS_TEXT,
        bodyText: toPrettyEnvelopeBody(
          Object.keys(tokenBody).length > 0
            ? withCredentialPlaceholders(tokenBody)
            : {
                dataBody: {
                  clientId: "{{clientId}}",
                  clientSecret: "{{clientSecret}}",
                  grantType: "client_credentials",
                },
              }
        ),
      }
    );
  }

  if (modeSet.has("B2B")) {
    const device = asRecord(b2b.device);
    const baseUrl = b2b.baseUrl || KB_B2B_BASE_URL;
    const clientId = "{{clientId}}";
    const clientSecret = "{{clientSecret}}";
    const scope = asString(b2b.scope) || "public security";
    const ciNo = "{{ciNo}}";
    const userInfo = "{{userInfo}}";
    const userInfoKey = "{{userInfoKey}}";
    const b2bRequests = asRecord(b2b.requests);
    const emailAgreeRequest = asTokenRequestDefault(b2bRequests.emailAgree);
    const authIssueRequest = asTokenRequestDefault(b2bRequests.authIssue);
    const tokenIssueRequest = asTokenRequestDefault(b2bRequests.tokenIssue);
    const clauseAgreeBody = {
      dataHeader: tokenDataHeader(device, "body"),
      dataBody: {
        clientId,
        ciNo,
        collAgreeYn: "Y",
        offerAgreeYn: "Y",
        agrType: "1",
      },
    };

    drafts.push(
      {
        id: "kb-b2b-clause-agree-process",
        mode: "B2B",
        label: "B2B 이용약관 동의",
        description: "POST /baas/v2/clause_agree_process",
        method: "POST",
        baseUrl,
        path: "/baas/v2/clause_agree_process",
        headersText: JSON_HEADERS_TEXT,
        bodyText: toPrettyBody(clauseAgreeBody),
      },
      {
        id: "kb-b2b-email-agree-process",
        mode: "B2B",
        label: "B2B 금융거래 동의",
        description: "POST /baas/v2/email_agree_process",
        method: tokenDraftMethod(emailAgreeRequest),
        baseUrl,
        path: tokenDraftPath(emailAgreeRequest, "/baas/v2/email_agree_process"),
        headersText: JSON_HEADERS_TEXT,
        bodyText: tokenDraftBodyText(emailAgreeRequest, {
          dataHeader: tokenDataHeader(device, "body"),
          dataBody: {
            clientId,
            ciNo,
            emailAgrmtF: "Y",
            agrType: "1",
          },
        }),
      },
      {
        id: "kb-b2b-auth-issue",
        mode: "B2B",
        label: "B2B 인가코드 발급",
        description: "POST /baas/v2/baas_auth_issue",
        method: tokenDraftMethod(authIssueRequest),
        baseUrl,
        path: tokenDraftPath(authIssueRequest, "/baas/v2/baas_auth_issue"),
        headersText: JSON_HEADERS_TEXT,
        bodyText: tokenDraftBodyText(authIssueRequest, {
          dataHeader: tokenDataHeader(device, "body"),
          dataBody: {
            clientId,
            ciNo,
            userInfo,
            infoType: userInfoKey || "1",
          },
        }),
      },
      {
        id: "kb-b2b-token-issue",
        mode: "B2B",
        label: "B2B 토큰 발급",
        description: "POST /baas/v2/baas_token_issue",
        method: tokenDraftMethod(tokenIssueRequest),
        baseUrl,
        path: tokenDraftPath(tokenIssueRequest, "/baas/v2/baas_token_issue"),
        headersText: JSON_HEADERS_TEXT,
        bodyText: tokenDraftBodyText(tokenIssueRequest, {
          dataHeader: tokenDataHeader(device, "body"),
          dataBody: {
            code: "{{code}}",
            clientId,
            clientSecret,
            grantType: "authorization_code",
            scope,
            issueNo: "{{issueNo}}",
          },
        }),
      },      {
        id: "kb-b2b-client-credentials",
        mode: "B2B",
        label: "B2B 토큰 발급(client_credentials)",
        description: "POST /baas/v2/baas_token_issue",
        method: "POST",
        baseUrl,
        path: "/baas/v2/baas_token_issue",
        headersText: JSON_HEADERS_TEXT,
        bodyText: toPrettyBody({
          dataHeader: tokenDataHeader(device),
          dataBody: {
            clientId,
            clientSecret,
            grantType: "client_credentials",
            scope,
          },
        }),
      },
      {
        id: "kb-b2b-token-refresh",
        mode: "B2B",
        label: "B2B 토큰 갱신",
        description: "POST /baas/v2/baas_token_issue",
        method: "POST",
        baseUrl,
        path: "/baas/v2/baas_token_issue",
        headersText: JSON_HEADERS_TEXT,
        bodyText: toPrettyBody({
          dataHeader: tokenDataHeader(device),
          dataBody: {
            refreshToken: "",
            clientId,
            clientSecret,
            grantType: "refresh_token",
            scope,
          },
        }),
      },
      {
        id: "kb-b2b-token-revoke",
        mode: "B2B",
        label: "B2B 토큰 폐기",
        description: "POST /baas/v2/baas_token_revoke",
        method: "POST",
        baseUrl,
        path: "/baas/v2/baas_token_revoke",
        headersText: JSON_HEADERS_TEXT,
        bodyText: toPrettyBody({
          dataHeader: tokenDataHeader(device),
          dataBody: {
            token: "",
            clientId,
            clientSecret,
          },
        }),
      }
    );
  }

  return drafts;
}

function resolveKisTokenBaseUrl(defaultBaseUrl: string) {
  const normalized = defaultBaseUrl.toLowerCase();
  if (normalized.includes("openapivts") || normalized.includes(":31000")) {
    return KIS_PAPER_BASE_URL;
  }
  return KIS_REAL_BASE_URL;
}

function buildKisTokenRequestDrafts(defaultBaseUrl: string, defaults: OpenApiTestDefaults = {}): TokenRequestDraft[] {
  const kis = defaults.kis ?? {};
  const baseUrl = kis.restBaseUrl || resolveKisTokenBaseUrl(defaultBaseUrl);
  const tokenIssueRequest = asTokenRequestDefault(kis.tokenIssue);
  const websocketApprovalRequest = asTokenRequestDefault(kis.websocketApproval);
  return [
    {
      id: "kis-access-token",
      mode: "COMMON",
      label: "접근토큰발급(P)",
      description: "POST /oauth2/tokenP",
      method: tokenDraftMethod(tokenIssueRequest),
      baseUrl: tokenIssueRequest.baseUrl || baseUrl,
      path: tokenDraftPath(tokenIssueRequest, "/oauth2/tokenP"),
      headersText: JSON_HEADERS_TEXT,
      bodyText: tokenDraftPlainBodyText(tokenIssueRequest, {
        grant_type: "client_credentials",
        appkey: "{{clientId}}",
        appsecret: "{{clientSecret}}",
      }),
    },
    {
      id: "kis-websocket-approval",
      mode: "COMMON",
      label: "실시간 웹소켓 접속키 발급",
      description: "POST /oauth2/Approval",
      method: tokenDraftMethod(websocketApprovalRequest),
      baseUrl: websocketApprovalRequest.baseUrl || baseUrl,
      path: tokenDraftPath(websocketApprovalRequest, "/oauth2/Approval"),
      headersText: JSON_HEADERS_TEXT,
      bodyText: tokenDraftPlainBodyText(websocketApprovalRequest, {
        grant_type: "client_credentials",
        appkey: "{{clientId}}",
        secretkey: "{{clientSecret}}",
      }),
    },
  ];
}

export default function OpenApiTestClient({
  headerContent,
  modeSelectorContent,
  runtimeMode: selectedRuntimeMode,
  samples,
  realtimeSamples: realtimeSampleCatalog = [],
  historyStorageKey,
  defaultBaseUrl,
  broker,
  defaultApiKey = "",
  defaultSecretKey = "",
  credentialStorageKey,
  tokenProcedures,
}: OpenApiTestClientProps) {
  const [result, setResult] = useState<RunResult | null>(null);
  const [latestResultIsSampleTest, setLatestResultIsSampleTest] = useState(false);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<RunHistory[]>([]);
  const [selectedHistoryDeleteIds, setSelectedHistoryDeleteIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [businessCategoryFilter, setBusinessCategoryFilter] = useState<OpenApiBusinessCategory>("전체목록");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [ciNo, setCiNo] = useState("");
  const [userInfo, setUserInfo] = useState("");
  const [userInfoKey, setUserInfoKey] = useState("1");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [issueNo, setIssueNo] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [productCode, setProductCode] = useState("01");
  const [accountPassword, setAccountPassword] = useState("");
  const [shouldPersistCredentials, setShouldPersistCredentials] = useState(true);
  const [hasLoadedCredentials, setHasLoadedCredentials] = useState(false);
  const [tokenRequestDrafts, setTokenRequestDrafts] = useState<TokenRequestDraft[]>([]);
  const [isLoadingTokenDefaults, setIsLoadingTokenDefaults] = useState(false);
  const [tokenDefaultsError, setTokenDefaultsError] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState("");
  const [tokenIssueStatus, setTokenIssueStatus] = useState<TokenIssueStatus>({ state: "idle" });
  const [approvalKey, setApprovalKey] = useState("");
  const [isInfoSettingsOpen, setIsInfoSettingsOpen] = useState(false);
  const [isTokenSectionOpen, setIsTokenSectionOpen] = useState(false);
  const [isAllHistoryOpen, setIsAllHistoryOpen] = useState(false);
  const [allHistorySearchTerm, setAllHistorySearchTerm] = useState("");
  const [selectedAllHistoryDeleteIds, setSelectedAllHistoryDeleteIds] = useState<string[]>([]);
  const [completedTokenSetupSteps, setCompletedTokenSetupSteps] = useState<TokenSetupStepKey[]>([]);
  const [hasLoadedTokenSetupStatus, setHasLoadedTokenSetupStatus] = useState(false);
  const [selectedTokenSetupStep, setSelectedTokenSetupStep] = useState<TokenSetupStepKey>("terms");
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [selectedSampleLabel, setSelectedSampleLabel] = useState("");
  const [isSampleEditorOpen, setIsSampleEditorOpen] = useState(false);
  const [isResultHistoryOpen, setIsResultHistoryOpen] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [selectedHistoryResultId, setSelectedHistoryResultId] = useState<string | null>(null);
  const [historyReplayMethod, setHistoryReplayMethod] = useState<OpenApiMethod>("POST");
  const [historyReplayBaseUrl, setHistoryReplayBaseUrl] = useState("");
  const [historyReplayPath, setHistoryReplayPath] = useState("");
  const [historyReplayHeadersText, setHistoryReplayHeadersText] = useState("{}");
  const [historyReplayBodyText, setHistoryReplayBodyText] = useState("{}");
  const [editorMethod, setEditorMethod] = useState<OpenApiMethod>("GET");
  const [editorBaseUrl, setEditorBaseUrl] = useState(defaultBaseUrl);
  const [editorPath, setEditorPath] = useState("/health");
  const [editorHeadersText, setEditorHeadersText] = useState(`{}`);
  const [editorQueryText, setEditorQueryText] = useState(`{}`);
  const [editorBodyText, setEditorBodyText] = useState(`{}`);
  const [isRealtimeEditorOpen, setIsRealtimeEditorOpen] = useState(false);
  const [selectedRealtimeSample, setSelectedRealtimeSample] = useState<OpenApiSample | null>(null);
  const [realtimeUrl, setRealtimeUrl] = useState("");
  const [realtimeMessageText, setRealtimeMessageText] = useState("{}");
  const [realtimeSearchTerm, setRealtimeSearchTerm] = useState("");
  const [realtimeSubscriptionKey, setRealtimeSubscriptionKey] = useState("005930");
  const [managedRealtimeStates, setManagedRealtimeStates] = useState<Record<string, ManagedRealtimeState>>({});
  const [isRealtimeBulkBusy, setIsRealtimeBulkBusy] = useState(false);
  const [managedRealtimeConnectionState, setManagedRealtimeConnectionState] = useState<ManagedRealtimeConnectionState>({
    connected: false,
    status: "연결 전",
    messages: [],
  });
  const managedRealtimeSocketRef = useRef<WebSocket | null>(null);
  const managedRealtimeSocketKeysRef = useRef<Record<string, string>>({});
  const managedRealtimeApprovalRetryRef = useRef<Record<string, boolean>>({});
  const managedRealtimeStatesRef = useRef<Record<string, ManagedRealtimeState>>({});
  const closeManagedRealtimeSocketQuietly = useCallback(() => {
    const socket = managedRealtimeSocketRef.current;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }
    managedRealtimeSocketRef.current = null;
    managedRealtimeSocketKeysRef.current = {};
    managedRealtimeApprovalRetryRef.current = {};
  }, []);

  const credentialKey = useMemo(() => getStorageKey(credentialStorageKey, broker, DEFAULT_CREDENTIAL_STORAGE_KEY), [credentialStorageKey, broker]);
  const tokenSetupStatusKey = useMemo(() => `${credentialKey}.tokenSetupStatus`, [credentialKey]);
  const normalizedBroker = useMemo(() => (broker || "").trim().toLowerCase(), [broker]);
  const normalizedTokenProcedures = useMemo(() => tokenProcedures ?? [], [tokenProcedures]);
  const requestVariables = useMemo(
    () => ({
      access_token: accessToken.trim(),
      accessToken: accessToken.trim(),
      approval_key: approvalKey.trim(),
      approvalKey: approvalKey.trim(),
      clientId: apiKey.trim(),
      clientSecret: secretKey.trim(),
      account: accountNo.trim(),
      accountNo: accountNo.trim(),
      gnlAcNo: accountNo.trim(),
      productCode: productCode.trim(),
      gdsNo: productCode.trim(),
      accountPassword: accountPassword.trim(),
      pwd: accountPassword.trim(),
    }),
    [accessToken, accountNo, accountPassword, apiKey, approvalKey, productCode, secretKey]
  );
  const tokenProcedureModes = useMemo(
    () => normalizedTokenProcedures.map((procedure) => procedure.mode).filter((mode): mode is OpenApiTokenMode => mode === "B2C" || mode === "B2B"),
    [normalizedTokenProcedures]
  );

  const realtimeSamples = useMemo(() => {
    const sourceSamples = realtimeSampleCatalog.length > 0 ? realtimeSampleCatalog : samples;
    const seen = new Set<string>();
    return sourceSamples.filter((sample) => {
      if (!isWebSocketSample(sample) || seen.has(sample.id)) return false;
      seen.add(sample.id);
      return true;
    });
  }, [realtimeSampleCatalog, samples]);
  const filteredRealtimeSamples = useMemo(() => {
    const keyword = realtimeSearchTerm.trim().toLowerCase();
    if (!keyword) return realtimeSamples;
    return realtimeSamples.filter((sample) =>
      `${sample.id} ${sample.label} ${sample.description} ${sample.path}`.toLowerCase().includes(keyword)
    );
  }, [realtimeSamples, realtimeSearchTerm]);
  const activeRealtimeCount = useMemo(() => Object.values(managedRealtimeStates).filter((state) => state.enabled).length, [managedRealtimeStates]);
  const connectedRealtimeCount = useMemo(
    () => (managedRealtimeConnectionState.connected ? 1 : 0),
    [managedRealtimeConnectionState.connected]
  );
  const realtimeSummaryText = `사용 가능한 실시간 ${realtimeSamples.length}건 / 연결 ${connectedRealtimeCount}건 / ON ${activeRealtimeCount}건`;
  const autoSubscribableRealtimeSamples = useMemo(
    () => realtimeSamples.filter((sample) => !getRealtimeAutoSubscribeBlockReason(sample)),
    [realtimeSamples]
  );
  const activeAutoRealtimeCount = useMemo(
    () => autoSubscribableRealtimeSamples.filter((sample) => managedRealtimeStates[sample.id]?.enabled).length,
    [autoSubscribableRealtimeSamples, managedRealtimeStates]
  );
  const isAllRealtimeEnabled =
    autoSubscribableRealtimeSamples.length > 0 && activeAutoRealtimeCount >= autoSubscribableRealtimeSamples.length;
  const isRealtimeView = realtimeSamples.length > 0;
  const realtimeConnectionTarget = useMemo(() => filteredRealtimeSamples[0] ?? realtimeSamples[0] ?? null, [filteredRealtimeSamples, realtimeSamples]);
  const isRealtimeConnectionBusy = ["연결 중", "접속키 발급 중", "접속키 재발급 중"].includes(
    managedRealtimeConnectionState.status
  );

  useEffect(() => {
    managedRealtimeStatesRef.current = managedRealtimeStates;
  }, [managedRealtimeStates]);

  const sampleResults = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return samples.filter((sample) => {
      if (!keyword) return true;
      return `${sample.id} ${sample.label} ${sample.description} ${sample.path}`.toLowerCase().includes(keyword);
    });
  }, [searchTerm, samples]);

  const categorizedSamples = useMemo(() => {
    const categories = makeBusinessGroupMap<OpenApiSample[]>(() => []);

    sampleResults.forEach((sample) => {
      const category = detectSampleBusinessCategory(sample);
      if (businessCategoryFilter !== "전체목록" && businessCategoryFilter !== category) return;
      categories[category].push(sample);
    });
    return categories;
  }, [businessCategoryFilter, sampleResults]);

  const businessCategoryCounts = useMemo(() => {
    const counts = makeBusinessGroupMap<number>(() => 0);
    sampleResults.forEach((sample) => {
      const category = detectSampleBusinessCategory(sample);
      counts[category] += 1;
    });
    return counts;
  }, [sampleResults]);
  const allBusinessCategoryCounts = useMemo(() => {
    const counts = makeBusinessGroupMap<number>(() => 0);
    samples.forEach((sample) => {
      const category = detectSampleBusinessCategory(sample);
      counts[category] += 1;
    });
    return counts;
  }, [samples]);
  const visibleBusinessCategoryOptions = useMemo(
    () => [
      "전체목록",
      ...BUSINESS_GROUPS.filter((category) => allBusinessCategoryCounts[category] > 0),
    ] as OpenApiBusinessCategory[],
    [allBusinessCategoryCounts]
  );
  const displayedCategorizedSamples = useMemo(() => {
    return Object.entries(categorizedSamples).filter(([category, items]) => {
      if (businessCategoryFilter !== "전체목록") return category === businessCategoryFilter;
      return items.length > 0;
    });
  }, [businessCategoryFilter, categorizedSamples]);
  const displayedSampleCount =
    businessCategoryFilter === "전체목록" ? sampleResults.length : businessCategoryCounts[businessCategoryFilter];
  const resultText = useMemo(() => (result ? prettyJson(result.body) : ""), [result]);
  const filteredAllHistory = useMemo(() => {
    const keyword = allHistorySearchTerm.trim().toLowerCase();
    if (!keyword) return history;
    return history.filter((item) =>
      [
        item.executedAt,
        item.method,
        item.requestUrl,
        String(item.status),
        item.ok ? "성공" : "실패",
        `${item.elapsedMs}ms`,
        item.sampleId,
        item.sampleLabel,
        item.requestHeaders,
        item.requestBody,
        item.headers,
        item.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [allHistorySearchTerm, history]);
  const selectedSampleHistory = useMemo(
    () => history.filter((item) => item.sampleId === selectedSampleId),
    [history, selectedSampleId]
  );
  const filteredSelectedSampleHistory = useMemo(() => {
    const keyword = historySearchTerm.trim().toLowerCase();
    if (!keyword) return selectedSampleHistory;
    return selectedSampleHistory.filter((item) =>
      [
        item.executedAt,
        item.method,
        item.requestUrl,
        String(item.status),
        item.ok ? "성공" : "실패",
        `${item.elapsedMs}ms`,
        item.sampleLabel,
        item.requestHeaders,
        item.requestBody,
        item.headers,
        item.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [historySearchTerm, selectedSampleHistory]);
  const selectedHistoryResult = useMemo(
    () => selectedSampleHistory.find((item) => item.id === selectedHistoryResultId) ?? selectedSampleHistory[0] ?? null,
    [selectedHistoryResultId, selectedSampleHistory]
  );
  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedSampleId) ?? null,
    [samples, selectedSampleId]
  );
  const selectedHistorySample = useMemo(() => {
    const sampleId = selectedHistoryResult?.sampleId;
    return (sampleId ? samples.find((sample) => sample.id === sampleId) : null) ?? selectedSample;
  }, [samples, selectedHistoryResult?.sampleId, selectedSample]);
  const isB2BTokenFlow = tokenProcedureModes.includes("B2B");
  const isB2CTokenFlow = tokenProcedureModes.includes("B2C");
  const tokenSetupStepOrder = useMemo(
    () => (isB2BTokenFlow ? B2B_TOKEN_SETUP_STEP_ORDER : isB2CTokenFlow ? B2C_TOKEN_SETUP_STEP_ORDER : []),
    [isB2BTokenFlow, isB2CTokenFlow]
  );
  const tokenSetupSteps = useMemo(() => {
    return tokenSetupStepOrder.map((stepKey) => ({
      stepKey,
      draft: tokenRequestDrafts.find((draft) => getTokenSetupStepKey(draft) === stepKey),
    })).filter((step): step is { stepKey: TokenSetupStepKey; draft: TokenRequestDraft } => Boolean(step.draft));
  }, [tokenRequestDrafts, tokenSetupStepOrder]);

  const isBodyMethod = useCallback((targetMethod: OpenApiMethod) => {
    return targetMethod === "POST" || targetMethod === "PUT" || targetMethod === "PATCH";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasLoadedCredentials(false);
    const raw = window.localStorage.getItem(`${credentialKey}`);
    const parsed = parseCredentialStorage(raw);
    setApiKey(parsed.apiKey || defaultApiKey || "");
    setSecretKey(parsed.secretKey || defaultSecretKey || "");
    setCiNo(parsed.ciNo || "");
    setUserInfo(parsed.userInfo || "");
    setUserInfoKey(parsed.userInfoKey || "1");
    setAccessToken(parsed.accessToken || "");
    setAccessTokenExpiresAt(parsed.accessTokenExpiresAt || "");
    setTokenIssueStatus(parsed.accessToken ? { state: "issued" } : { state: "idle" });
    setApprovalKey(parsed.approvalKey || "");
    setAuthorizationCode(parsed.authorizationCode || "");
    setIssueNo(parsed.issueNo || "");
    setAccountNo(parsed.accountNo || "");
    setProductCode(parsed.productCode || "01");
    setAccountPassword(parsed.accountPassword || "");
    setHasLoadedCredentials(true);
  }, [credentialKey, defaultApiKey, defaultSecretKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHasLoadedTokenSetupStatus(false);
    try {
      const raw = window.localStorage.getItem(tokenSetupStatusKey);
      if (!raw) {
        setCompletedTokenSetupSteps([]);
        setHasLoadedTokenSetupStatus(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setCompletedTokenSetupSteps([]);
        setHasLoadedTokenSetupStatus(true);
        return;
      }
      setCompletedTokenSetupSteps(parsed.filter((item): item is TokenSetupStepKey => [...B2C_TOKEN_SETUP_STEP_ORDER, ...B2B_TOKEN_SETUP_STEP_ORDER].includes(item as TokenSetupStepKey)));
      setHasLoadedTokenSetupStatus(true);
    } catch {
      setCompletedTokenSetupSteps([]);
      setHasLoadedTokenSetupStatus(true);
    }
  }, [tokenSetupStatusKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedTokenSetupStatus) return;
    try {
      window.localStorage.setItem(tokenSetupStatusKey, JSON.stringify(completedTokenSetupSteps));
    } catch {
      // Persist failure should not interrupt API test.
    }
  }, [completedTokenSetupSteps, hasLoadedTokenSetupStatus, tokenSetupStatusKey]);

  useEffect(() => {
    if (!shouldPersistCredentials || !hasLoadedCredentials || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        credentialKey,
        JSON.stringify({
          clientId: apiKey,
          clientSecret: secretKey,
          apiKey,
          secretKey,
          ciNo,
          userInfo,
          userInfoKey,
          accessToken,
          accessTokenExpiresAt,
          approvalKey,
          authorizationCode,
          issueNo,
          accountNo,
          productCode,
          accountPassword,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // Persist failure should not interrupt API test.
    }
  }, [accessToken, accessTokenExpiresAt, accountNo, accountPassword, apiKey, approvalKey, authorizationCode, ciNo, credentialKey, hasLoadedCredentials, issueNo, productCode, secretKey, shouldPersistCredentials, userInfo, userInfoKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(historyStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      setHistory(keepRecentHistoryBySample(parsed));
    } catch {
      // ignore invalid cache
    }
  }, [historyStorageKey]);

  useEffect(() => {
    if (tokenSetupSteps.length === 0) return;
    if (tokenSetupSteps.some((step) => step.stepKey === selectedTokenSetupStep)) return;
    setSelectedTokenSetupStep(tokenSetupSteps[0].stepKey);
  }, [selectedTokenSetupStep, tokenSetupSteps]);

  useEffect(() => {
    if (!selectedHistoryResult) return;
    setHistoryReplayMethod(selectedHistoryResult.method);
    setHistoryReplayBaseUrl(selectedHistoryResult.baseUrl || defaultBaseUrl);
    setHistoryReplayPath(selectedHistoryResult.path || selectedHistoryResult.requestUrl);
    setHistoryReplayHeadersText(prettyJson(selectedHistoryResult.requestHeaders || "{}"));
    setHistoryReplayBodyText(prettyJson(selectedHistoryResult.requestBody || "{}"));
  }, [defaultBaseUrl, selectedHistoryResult]);

  useEffect(() => {
    const defaultsUrl = `/api/config/openapi-test/defaults?mode=${encodeURIComponent(
      selectedRuntimeMode || "development"
    )}`;

    if (normalizedBroker === "kis") {
      let isCancelled = false;
      const fallbackDrafts = buildKisTokenRequestDrafts(defaultBaseUrl);

      setTokenRequestDrafts(fallbackDrafts);
      setTokenDefaultsError("");
      setIsLoadingTokenDefaults(true);

      fetch(defaultsUrl)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Defaults request failed: ${response.status}`);
          }
          return response.json() as Promise<OpenApiTestDefaults>;
        })
        .then((defaults) => {
          if (isCancelled) return;
          setTokenRequestDrafts(buildKisTokenRequestDrafts(defaultBaseUrl, defaults));

          const kis = defaults.kis;
          const kisClientId = asString(kis?.clientId);
          const kisClientSecret = asString(kis?.clientSecret);
          setApiKey((current) => current || kisClientId);
          setSecretKey((current) => current || kisClientSecret);
          if (typeof window !== "undefined" && (kisClientId || kisClientSecret)) {
            const cached = parseCredentialStorage(window.localStorage.getItem(credentialKey));
            const nextApiKey = cached.apiKey || kisClientId;
            const nextSecretKey = cached.secretKey || kisClientSecret;
            window.localStorage.setItem(
              credentialKey,
              JSON.stringify({
                ...cached,
                apiKey: nextApiKey,
                clientId: nextApiKey,
                secretKey: nextSecretKey,
                clientSecret: nextSecretKey,
                updatedAt: new Date().toISOString(),
              })
            );
          }
        })
        .catch((err) => {
          if (isCancelled) return;
          setTokenRequestDrafts(fallbackDrafts);
          setTokenDefaultsError(err instanceof Error ? err.message : "KIS 기본값을 불러오지 못했습니다.");
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingTokenDefaults(false);
          }
        });

      return () => {
        isCancelled = true;
      };
    }

    if (broker !== "Tkb" || tokenProcedureModes.length === 0) {
      setTokenRequestDrafts([]);
      return;
    }

    let isCancelled = false;
    const fallbackDrafts = buildKbTokenRequestDrafts({}, tokenProcedureModes);

    setIsLoadingTokenDefaults(true);
    setTokenDefaultsError("");

    fetch(defaultsUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Defaults request failed: ${response.status}`);
        }
        return response.json() as Promise<OpenApiTestDefaults>;
      })
      .then((defaults) => {
        if (isCancelled) return;
        const nextDrafts = buildKbTokenRequestDrafts(defaults, tokenProcedureModes);
        setTokenRequestDrafts(nextDrafts.length > 0 ? nextDrafts : fallbackDrafts);

        const b2b = defaults.kb?.b2b;
        const b2cToken = asRecord(asRecord(defaults.kb?.b2c?.tokenIssue).dataBody);
        const isB2BDefaultsMode = tokenProcedureModes.includes("B2B");
        const b2bClientId = asString(b2b?.clientId);
        const b2bClientSecret = asString(b2b?.clientSecret);
        const b2bCiNo = asString(b2b?.ciNo);
        const b2bUserInfo = asString(b2b?.userInfo);
        const b2bAccount = asString(b2b?.account);
        const b2bProductCode = asString(b2b?.productCode);
        const b2cClientId = asString(b2cToken.clientId);
        const b2cClientSecret = asString(b2cToken.clientSecret);

        if (isB2BDefaultsMode) {
          setApiKey((current) => current || b2bClientId);
          setSecretKey((current) => current || b2bClientSecret);
          setCiNo((current) => current || b2bCiNo);
          setUserInfo((current) => current || b2bUserInfo);
          setAccountNo((current) => current || b2bAccount);
          setProductCode((current) => current || b2bProductCode || "01");
          return;
        }

        setApiKey((current) => (current === b2bClientId ? b2cClientId : current || b2cClientId));
        setSecretKey((current) => (current === b2bClientSecret ? b2cClientSecret : current || b2cClientSecret));
        setCiNo((current) => (current === b2bCiNo ? "" : current));
        setUserInfo((current) => (current === b2bUserInfo ? "" : current));
        setAccountNo((current) => (current === b2bAccount ? "" : current));
        setProductCode((current) => (current === b2bProductCode ? "01" : current || "01"));
      })
      .catch((err) => {
        if (isCancelled) return;
        setTokenRequestDrafts(fallbackDrafts);
        setTokenDefaultsError(err instanceof Error ? err.message : "기본값을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingTokenDefaults(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [broker, credentialKey, defaultBaseUrl, normalizedBroker, selectedRuntimeMode, tokenProcedureModes]);

  const runRequestWithValues = useCallback(
    async ({
      targetMethod,
      targetBaseUrl,
      targetPath,
      targetHeadersText,
      targetQueryText,
      targetBodyText,
      historySampleId,
      historySampleLabel,
      openHistoryAfterRun = true,
      signal,
    }: {
      targetMethod: OpenApiMethod;
      targetBaseUrl: string;
      targetPath: string;
      targetHeadersText: string;
      targetQueryText: string;
      targetBodyText: string;
      historySampleId?: string;
      historySampleLabel?: string;
      openHistoryAfterRun?: boolean;
      signal?: AbortSignal;
    }): Promise<RequestRunOutcome | undefined> => {
      const needsBody = isBodyMethod(targetMethod);
      setIsRunning(true);
      setError("");
      setResult(null);

      const requestVariables = {
        access_token: accessToken.trim(),
        accessToken: accessToken.trim(),
        approval_key: approvalKey.trim(),
        approvalKey: approvalKey.trim(),
        clientId: apiKey.trim(),
        clientSecret: secretKey.trim(),
        ciNo: ciNo.trim(),
        userInfo: userInfo.trim(),
        userInfoKey: userInfoKey.trim(),
        infoType: userInfoKey.trim(),
        authorizationCode: authorizationCode.trim(),
        authCode: authorizationCode.trim(),
        code: authorizationCode.trim(),
        issueNo: issueNo.trim(),
        account: accountNo.trim(),
        accountNo: accountNo.trim(),
        gnlAcNo: accountNo.trim(),
        productCode: productCode.trim(),
        gdsNo: productCode.trim(),
        accountPassword: accountPassword.trim(),
        pwd: accountPassword.trim(),
      };
      const resolvedHeadersText = applyRequestVariables(targetHeadersText, requestVariables);
      const resolvedQueryText = applyRequestVariables(targetQueryText, requestVariables);
      const resolvedBodyText = applyRequestVariables(targetBodyText, requestVariables);

      const headersParse = parseJson(resolvedHeadersText);
      if (headersParse.error) {
        setError(`헤더 JSON 오류: ${headersParse.error}`);
        setIsRunning(false);
        return;
      }

      const queryParse = parseJson(resolvedQueryText);
      if (queryParse.error) {
        setError(`쿼리 JSON 오류: ${queryParse.error}`);
        setIsRunning(false);
        return;
      }

      let parsedBody: unknown = {};
      if (needsBody) {
        const parsed = parseBody(resolvedBodyText);
        if (parsed.error) {
          setError(`바디 JSON 오류: ${parsed.error}`);
          setIsRunning(false);
          return;
        }
        parsedBody = parsed.parsed;
      }

      const headerSource = headersParse.parsed ?? {};
      const shouldSendCredentialEchoHeaders = normalizedBroker !== "kis";
      const requestHeaders = {
        ...headerSource,
        ...(shouldSendCredentialEchoHeaders && apiKey.trim() ? { [`${CREDENTIAL_HEADER_PREFIX}API-Key`]: apiKey.trim() } : {}),
        ...(shouldSendCredentialEchoHeaders && secretKey.trim() ? { [`${CREDENTIAL_HEADER_PREFIX}API-Secret`]: secretKey.trim() } : {}),
        ...(accessToken.trim() && !hasHeader(headerSource, "Authorization") ? { Authorization: `Bearer ${accessToken.trim()}` } : {}),
        ...(needsBody && !hasHeader(headerSource, "Content-Type") ? { "Content-Type": "application/json" } : {}),
      };

      const requestUrl = toRequestUrl(targetBaseUrl, targetPath, queryParse.parsed ?? {});
      const activeSampleId = historySampleId || selectedSampleId || "unselected";
      const activeSampleLabel = historySampleLabel || selectedSampleLabel || activeSampleId;
      const start = performance.now();
      const timeoutId = globalThis.setTimeout(() => {}, DEFAULT_REQUEST_TIMEOUT_MS);
      let sentRequestHeadersText = JSON.stringify(requestHeaders, null, 2);

      try {
        let responseStatus = 0;
        let responseOk = false;
        let responseText = "";
        let responseHeaders = "";

        if (shouldProxyRequest(requestUrl)) {
          const proxyResponse = await fetch("/api/openapi-test/proxy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal,
            body: JSON.stringify({
              method: targetMethod,
              url: requestUrl,
              headers: requestHeaders,
              body: needsBody ? parsedBody : undefined,
              accessToken: accessToken.trim(),
              clientSecret: secretKey.trim(),
              encryptBody: shouldEncryptRequest(requestUrl),
            }),
          });
          const proxyPayload = (await proxyResponse.json()) as OpenApiProxyResponse;
          responseStatus = proxyPayload.status ?? proxyResponse.status;
          responseOk = proxyPayload.ok ?? proxyResponse.ok;
          responseText = typeof proxyPayload.body === "string" ? proxyPayload.body : JSON.stringify(proxyPayload.body ?? "");
          responseHeaders = proxyPayload.headers ? formatResponseHeaders(proxyPayload.headers) : "";
          sentRequestHeadersText = proxyPayload.requestHeaders
            ? JSON.stringify(proxyPayload.requestHeaders, null, 2)
            : sentRequestHeadersText;
        } else {
          const response = await fetch(requestUrl, {
            method: targetMethod,
            headers: requestHeaders,
            body: needsBody ? JSON.stringify(parsedBody) : undefined,
            signal,
          });
          responseStatus = response.status;
          responseOk = response.ok;
          responseText = await response.text();
          responseHeaders = [...response.headers.entries()]
            .map(([name, value]) => `${name}: ${value}`)
            .join("\n");
        }

        const elapsedMs = Math.round(performance.now() - start);
        const nextResult: RunResult = {
          status: responseStatus,
          ok: responseOk,
          elapsedMs,
          body: responseText,
          headers: responseHeaders,
        };
        const tokenExtractOptions = { includeFallbackTokenKeys: isTokenRequestUrl(requestUrl) };
        const nextAccessToken =
          extractAccessToken(responseText, tokenExtractOptions) || extractAccessToken(responseHeaders, tokenExtractOptions);
        const nextAccessTokenExpiresAt =
          extractAccessTokenExpiresAt(responseText) || extractAccessTokenExpiresAt(responseHeaders);
        const nextApprovalKey = extractApprovalKey(responseText);
        if (nextAccessToken) {
          setAccessToken(nextAccessToken);
          setAccessTokenExpiresAt(nextAccessTokenExpiresAt || "");
        }
        if (nextAccessTokenExpiresAt) {
          setAccessTokenExpiresAt(nextAccessTokenExpiresAt);
        }
        if (nextApprovalKey) {
          setApprovalKey(nextApprovalKey);
        }
        setResult(nextResult);
        setLatestResultIsSampleTest(activeSampleId !== "unselected");
        const runId = makeId("run");
        const historyItem: RunHistory = {
          id: runId,
          executedAt: new Date().toLocaleString("en-US"),
          method: targetMethod,
          baseUrl: targetBaseUrl,
          path: targetPath,
          requestUrl,
          status: responseStatus,
          ok: responseOk,
          elapsedMs,
          sampleId: activeSampleId,
          sampleLabel: activeSampleLabel,
          requestHeaders: sentRequestHeadersText,
          requestBody: needsBody ? JSON.stringify(parsedBody, null, 2) : "",
          body: responseText,
          headers: responseHeaders,
        };
        setHistory((currentHistory) => {
          const nextHistory = keepRecentHistoryBySample([
            historyItem,
            ...currentHistory,
          ]);
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
            } catch {
              // keep running history in memory if storage fails
            }
          }
          return nextHistory;
        });
        if (activeSampleId !== "unselected") {
          setSelectedSampleId(activeSampleId);
          setSelectedSampleLabel(activeSampleLabel);
          if (openHistoryAfterRun) {
            setSelectedHistoryResultId(runId);
            setIsResultHistoryOpen(true);
          }
        }
        return { ...nextResult, historyItem };
      } catch (err) {
        const elapsedMs = Math.round(performance.now() - start);
        const message =
          err instanceof DOMException && err.name === "AbortError"
            ? "요청이 중지되었습니다."
            : err instanceof Error
            ? err.message
            : "요청에 실패했습니다.";
        const nextResult: RunResult = {
          status: 0,
          ok: false,
          elapsedMs,
          body: message,
          headers: "",
        };
        setResult(nextResult);
        setLatestResultIsSampleTest(activeSampleId !== "unselected");
        setError(message);
        const runId = makeId("run");
        const historyItem: RunHistory = {
          id: runId,
          executedAt: new Date().toLocaleString("en-US"),
          method: targetMethod,
          baseUrl: targetBaseUrl,
          path: targetPath,
          requestUrl,
          status: 0,
          ok: false,
          elapsedMs,
          sampleId: activeSampleId,
          sampleLabel: activeSampleLabel,
          requestHeaders: sentRequestHeadersText,
          requestBody: needsBody ? JSON.stringify(parsedBody, null, 2) : "",
          body: message,
          headers: "",
        };
        setHistory((currentHistory) => {
          const nextHistory = keepRecentHistoryBySample([
            historyItem,
            ...currentHistory,
          ]);
          if (typeof window !== "undefined") {
            try {
              window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
            } catch {
              // keep running history in memory if storage fails
            }
          }
          return nextHistory;
        });
        if (activeSampleId !== "unselected") {
          setSelectedSampleId(activeSampleId);
          setSelectedSampleLabel(activeSampleLabel);
          if (openHistoryAfterRun) {
            setSelectedHistoryResultId(runId);
            setIsResultHistoryOpen(true);
          }
        }
        return { ...nextResult, historyItem };
      } finally {
        globalThis.clearTimeout(timeoutId);
        setIsRunning(false);
      }
    },
    [accessToken, accountNo, accountPassword, apiKey, approvalKey, authorizationCode, ciNo, historyStorageKey, isBodyMethod, issueNo, normalizedBroker, productCode, secretKey, selectedSampleId, selectedSampleLabel, userInfo, userInfoKey]
  );

  const clearHistory = useCallback(() => {
    setSelectedHistoryDeleteIds([]);
    setSelectedAllHistoryDeleteIds([]);
    if (!selectedSampleId) {
      setHistory([]);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.removeItem(historyStorageKey);
      } catch {
        // local storage failures should not block UI behavior
      }
      return;
    }

    setHistory((currentHistory) => {
      const nextHistory = currentHistory.filter((item) => item.sampleId !== selectedSampleId);
      if (typeof window === "undefined") return nextHistory;
      try {
        window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
      } catch {
        // local storage failures should not block UI behavior
      }
      return nextHistory;
    });
  }, [historyStorageKey, selectedSampleId]);

  const toggleHistoryDeleteSelection = useCallback((historyId: string) => {
    setSelectedHistoryDeleteIds((currentIds) =>
      currentIds.includes(historyId)
        ? currentIds.filter((id) => id !== historyId)
        : [...currentIds, historyId]
    );
  }, []);

  const selectAllVisibleHistoryForDelete = useCallback(() => {
    if (!selectedSampleId) {
      setSelectedHistoryDeleteIds([]);
      return;
    }
    setSelectedHistoryDeleteIds(
      filteredSelectedSampleHistory
        .map((item) => item.id)
    );
  }, [filteredSelectedSampleHistory, selectedSampleId]);

  const clearHistoryDeleteSelection = useCallback(() => {
    setSelectedHistoryDeleteIds([]);
  }, []);

  const deleteSelectedHistory = useCallback(() => {
    if (selectedHistoryDeleteIds.length === 0) return;
    const deleteIds = new Set(selectedHistoryDeleteIds);
    setHistory((currentHistory) => {
      const nextHistory = currentHistory.filter((item) => !deleteIds.has(item.id));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
        } catch {
          // keep running history in memory if storage fails
        }
      }
      return nextHistory;
    });
    setSelectedHistoryDeleteIds([]);
    setSelectedHistoryResultId((currentId) => (currentId && deleteIds.has(currentId) ? null : currentId));
  }, [historyStorageKey, selectedHistoryDeleteIds]);

  const toggleAllHistoryDeleteSelection = useCallback((historyId: string) => {
    setSelectedAllHistoryDeleteIds((currentIds) =>
      currentIds.includes(historyId)
        ? currentIds.filter((id) => id !== historyId)
        : [...currentIds, historyId]
    );
  }, []);

  const selectAllFilteredHistoryForDelete = useCallback(() => {
    setSelectedAllHistoryDeleteIds(filteredAllHistory.map((item) => item.id));
  }, [filteredAllHistory]);

  const clearAllHistoryDeleteSelection = useCallback(() => {
    setSelectedAllHistoryDeleteIds([]);
  }, []);

  const deleteSelectedAllHistory = useCallback(() => {
    if (selectedAllHistoryDeleteIds.length === 0) return;
    const deleteIds = new Set(selectedAllHistoryDeleteIds);
    setHistory((currentHistory) => {
      const nextHistory = currentHistory.filter((item) => !deleteIds.has(item.id));
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(historyStorageKey, JSON.stringify(nextHistory));
        } catch {
          // keep running history in memory if storage fails
        }
      }
      return nextHistory;
    });
    setSelectedAllHistoryDeleteIds([]);
    setSelectedHistoryDeleteIds((currentIds) => currentIds.filter((id) => !deleteIds.has(id)));
    setSelectedHistoryResultId((currentId) => (currentId && deleteIds.has(currentId) ? null : currentId));
  }, [historyStorageKey, selectedAllHistoryDeleteIds]);

  const updateTokenDraftBody = useCallback((draftId: string, bodyText: string) => {
    setTokenRequestDrafts((currentDrafts) =>
      currentDrafts.map((draft) => (draft.id === draftId ? { ...draft, bodyText } : draft))
    );
  }, []);

  const sendTokenDraft = useCallback(
    async (draft: TokenRequestDraft) => {
      const stepKey = getTokenSetupStepKey(draft);
      if (stepKey && isTokenIssueStepKey(stepKey)) {
        setTokenIssueStatus({ state: "running", updatedAt: new Date().toISOString() });
      }
      const requestResult = await runRequestWithValues({
        targetMethod: draft.method,
        targetBaseUrl: draft.baseUrl,
        targetPath: draft.path,
        targetHeadersText: draft.headersText,
        targetQueryText: "{}",
        targetBodyText: draft.bodyText,
        historySampleId: draft.id,
        historySampleLabel: draft.label,
      });
      if (stepKey && isTokenIssueStepKey(stepKey) && !requestResult) {
        setTokenIssueStatus({ state: "failed", updatedAt: new Date().toISOString() });
        return;
      }
      if (stepKey && isTokenIssueStepKey(stepKey) && requestResult && !requestResult.ok) {
        setTokenIssueStatus({ state: "failed", status: requestResult.status, updatedAt: new Date().toISOString() });
      }
      if (requestResult?.ok && stepKey) {
        if (stepKey === "authCode") {
          const authValues = extractAuthIssueValues(requestResult.body);
          if (authValues.code) setAuthorizationCode(authValues.code);
          if (authValues.issueNo) setIssueNo(authValues.issueNo);
          if (authValues.code || authValues.issueNo) {
            setTokenRequestDrafts((currentDrafts) =>
              currentDrafts.map((currentDraft) => {
                if (getTokenSetupStepKey(currentDraft) !== "token") return currentDraft;
                let nextBodyText = currentDraft.bodyText;
                if (authValues.code) {
                  nextBodyText = nextBodyText
                    .split("{{code}}").join(authValues.code)
                    .split("{{authorizationCode}}").join(authValues.code)
                    .split("{{authCode}}").join(authValues.code);
                }
                if (authValues.issueNo) {
                  nextBodyText = nextBodyText.split("{{issueNo}}").join(authValues.issueNo);
                }
                return { ...currentDraft, bodyText: nextBodyText };
              })
            );
          }
        }
        const tokenExtractOptions = { includeFallbackTokenKeys: true };
        const issuedAccessToken =
          extractAccessToken(requestResult.body, tokenExtractOptions) ||
          extractAccessToken(requestResult.headers, tokenExtractOptions) ||
          accessToken;
        const issuedAccessTokenExpiresAt =
          extractAccessTokenExpiresAt(requestResult.body) ||
          extractAccessTokenExpiresAt(requestResult.headers) ||
          accessTokenExpiresAt;
        const shouldMarkStepComplete = isTokenIssueStepKey(stepKey)
          ? isUsableAccessToken(issuedAccessToken, issuedAccessTokenExpiresAt)
          : true;
        if (isTokenIssueStepKey(stepKey) && requestResult.ok && !issuedAccessToken) {
          setTokenIssueStatus({ state: "issuedWithoutToken", status: requestResult.status, updatedAt: new Date().toISOString() });
          setError("토큰 발급 응답은 성공했지만 access_token/token 값을 찾지 못했습니다. 응답 본문의 토큰 필드명을 확인하세요.");
        }
        if (isTokenIssueStepKey(stepKey) && issuedAccessToken) {
          setAccessToken(issuedAccessToken);
          setAccessTokenExpiresAt(issuedAccessTokenExpiresAt || "");
          setTokenIssueStatus({ state: "issued", status: requestResult.status, updatedAt: new Date().toISOString() });
        }
        if (shouldMarkStepComplete) {
          setCompletedTokenSetupSteps((currentSteps) =>
            currentSteps.includes(stepKey) ? currentSteps : [...currentSteps, stepKey]
          );
        }
      }
    },
    [accessToken, accessTokenExpiresAt, runRequestWithValues]
  );

  const openSampleInEditor = useCallback(
    (sample: OpenApiSample) => {
      const targetMethod = ensureMethod(sample.method);
      const targetBaseUrl = sample.baseUrl || defaultBaseUrl;
      const targetPath = sample.path;
      const targetHeadersText = prettyJson(JSON.stringify(sample.headers ?? {}, null, 2));
      const targetQueryText = prettyJson(JSON.stringify(sample.query ?? {}, null, 2));
      const targetBodyText = prettyJson(JSON.stringify(normalizeDataEnvelope(sample.body ?? {}), null, 2));

      setEditorMethod(targetMethod);
      setEditorBaseUrl(targetBaseUrl);
      setEditorPath(targetPath);
      setEditorHeadersText(targetHeadersText);
      setEditorQueryText(targetQueryText);
      setEditorBodyText(targetBodyText);
      setResult(null);
      setError("");
      setSelectedSampleId(sample.id);
      setSelectedSampleLabel(sample.label);
      setIsSampleEditorOpen(true);
    },
    [defaultBaseUrl]
  );

  const closeSampleEditor = useCallback(() => {
    setIsSampleEditorOpen(false);
    setSelectedSampleId(null);
    setSelectedSampleLabel("");
  }, []);

  const sendEditedSample = useCallback(async () => {
    await runRequestWithValues({
      targetMethod: editorMethod,
      targetBaseUrl: editorBaseUrl,
      targetPath: editorPath,
      targetHeadersText: editorHeadersText,
      targetQueryText: editorQueryText,
      targetBodyText: editorBodyText,
    });
  }, [editorMethod, editorBaseUrl, editorBodyText, editorHeadersText, editorPath, editorQueryText, runRequestWithValues]);

  const failManagedRealtime = useCallback((sampleId: string, message: string) => {
    setError(message);
    setManagedRealtimeConnectionState((state) => ({
      ...state,
      status: state.connected ? state.status : "오류",
      messages: [realtimeMessageLine("오류", message), ...state.messages].slice(0, 20),
      lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
    }));
    setManagedRealtimeStates((states) => ({
      ...states,
      [sampleId]: {
        ...(states[sampleId] ?? {
          connected: false,
          connectionStatus: "연결 전",
          enabled: false,
          messages: [],
          status: "OFF",
        }),
        connected: managedRealtimeSocketRef.current?.readyState === WebSocket.OPEN,
        connectionStatus: "오류",
        enabled: false,
        status: "오류",
        messages: [realtimeMessageLine("오류", message), ...(states[sampleId]?.messages ?? [])].slice(0, 20),
        lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
      },
    }));
  }, []);

  const resolveRealtimeSocketUrl = useCallback(
    (sample: OpenApiSample) => {
      const targetBaseUrl = sample.baseUrl || defaultBaseUrl;
      const targetUrl = toRequestUrl(targetBaseUrl, sample.path, {});
      let socketUrl: URL;
      try {
        socketUrl = new URL(targetUrl);
      } catch {
        return { error: "올바른 WebSocket URL이 아닙니다.", socketUrl: null };
      }
      if (!["ws:", "wss:"].includes(socketUrl.protocol)) {
        return { error: "WebSocket URL은 ws:// 또는 wss:// 로 시작해야 합니다.", socketUrl: null };
      }
      return { error: null, socketUrl };
    },
    [defaultBaseUrl]
  );

  const getManagedRealtimeSignature = useCallback(
    (sample: OpenApiSample) => {
      const keyedBody = applyRealtimeSubscriptionKey(sample.body ?? {}, realtimeSubscriptionKey);
      const trId = findStringValue(keyedBody, ["tr_id", "trId"]) || sample.id;
      const trKey = findStringValue(keyedBody, ["tr_key", "trKey"]) || "";
      return `${trId}|${trKey}`;
    },
    [realtimeSubscriptionKey]
  );

  const findManagedRealtimeSampleIds = useCallback((trId?: string, trKey?: string) => {
    if (!trId) return [];
    const exactSignature = `${trId}|${trKey ?? ""}`;
    const prefix = `${trId}|`;
    return Object.entries(managedRealtimeSocketKeysRef.current)
      .filter(([, signature]) => (trKey ? signature === exactSignature : signature.startsWith(prefix)))
      .map(([sampleId]) => sampleId);
  }, []);

  const ensureKisRealtimeApprovalKey = useCallback(
    async (sampleId: string, options: { forceRefresh?: boolean } = {}) => {
      const shouldForceRefresh = Boolean(options.forceRefresh);
      const cachedApprovalKey = approvalKey.trim();
      if (normalizedBroker !== "kis") return cachedApprovalKey;
      if (cachedApprovalKey && !shouldForceRefresh) return cachedApprovalKey;
      if (shouldForceRefresh) {
        setApprovalKey("");
      }
      if (!apiKey.trim() || !secretKey.trim()) {
        failManagedRealtime(sampleId, "KIS 실시간 접속키 발급에는 clientId와 secretKey가 필요합니다. 정보설정을 확인하세요.");
        return "";
      }

      const approvalDraft = tokenRequestDrafts.find((draft) => draft.id === "kis-websocket-approval");
      if (!approvalDraft) {
        failManagedRealtime(sampleId, "KIS 실시간 웹소켓 접속키 발급 전문을 찾지 못했습니다.");
        return "";
      }

      setManagedRealtimeConnectionState((state) => ({
        ...state,
        status: shouldForceRefresh ? "접속키 재발급 중" : "접속키 발급 중",
        messages: [
          realtimeMessageLine(
            "상태",
            shouldForceRefresh
              ? "기존 approval_key가 유효하지 않아 실시간 웹소켓 접속키를 다시 발급합니다."
              : "실시간 웹소켓 접속키를 발급합니다."
          ),
          ...state.messages,
        ].slice(0, 20),
        lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
      }));
      setManagedRealtimeStates((states) => ({
        ...states,
        [sampleId]: {
          ...(states[sampleId] ?? {
            connected: false,
            connectionStatus: "연결 전",
            enabled: false,
            messages: [],
            status: "OFF",
          }),
          connectionStatus: shouldForceRefresh ? "접속키 재발급 중" : "접속키 발급 중",
          messages: [
            realtimeMessageLine(
              "상태",
              shouldForceRefresh
                ? "기존 approval_key가 유효하지 않아 실시간 웹소켓 접속키를 다시 발급합니다."
                : "실시간 웹소켓 접속키를 발급합니다."
            ),
            ...(states[sampleId]?.messages ?? []),
          ].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        },
      }));

      const requestResult = await runRequestWithValues({
        targetMethod: approvalDraft.method,
        targetBaseUrl: approvalDraft.baseUrl,
        targetPath: approvalDraft.path,
        targetHeadersText: approvalDraft.headersText,
        targetQueryText: "{}",
        targetBodyText: approvalDraft.bodyText,
        historySampleId: approvalDraft.id,
        historySampleLabel: approvalDraft.label,
        openHistoryAfterRun: false,
      });
      const nextApprovalKey = requestResult?.body ? extractApprovalKey(requestResult.body) : "";
      if (!requestResult?.ok || !nextApprovalKey) {
        failManagedRealtime(sampleId, "KIS 실시간 웹소켓 접속키 발급에 실패했습니다. 토큰발급 응답과 clientId/secretKey를 확인하세요.");
        return "";
      }
      setApprovalKey(nextApprovalKey);
      setManagedRealtimeConnectionState((state) => ({
        ...state,
        status: state.connected ? "연결됨" : "접속키 준비",
        messages: [
          realtimeMessageLine("상태", shouldForceRefresh ? "실시간 웹소켓 접속키가 재발급됐습니다." : "실시간 웹소켓 접속키가 준비됐습니다."),
          ...state.messages,
        ].slice(0, 20),
        lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
      }));
      setManagedRealtimeStates((states) => ({
        ...states,
        [sampleId]: {
          ...(states[sampleId] ?? { messages: [] }),
          connectionStatus: "접속키 준비",
          messages: [
            realtimeMessageLine("상태", shouldForceRefresh ? "실시간 웹소켓 접속키가 재발급됐습니다." : "실시간 웹소켓 접속키가 준비됐습니다."),
            ...(states[sampleId]?.messages ?? []),
          ].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        },
      }));
      return nextApprovalKey;
    },
    [apiKey, approvalKey, failManagedRealtime, normalizedBroker, runRequestWithValues, secretKey, tokenRequestDrafts]
  );

  const buildRealtimeSubscriptionPayload = useCallback(
    (sample: OpenApiSample, trType: "1" | "2", approvalKeyOverride = approvalKey.trim()) => {
      if (normalizedBroker === "kis" && !approvalKeyOverride.trim()) {
        return {
          error: "KIS 실시간 구독에는 approval_key가 필요합니다. 토큰발급에서 실시간 웹소켓 접속키를 먼저 발급하세요.",
          parsedMessage: undefined,
        };
      }

      const keyedBody = applyRealtimeSubscriptionKey(sample.body ?? {}, realtimeSubscriptionKey);
      const targetBody = applyRealtimeTrType(keyedBody, trType);
      const resolvedMessageText = applyRequestVariables(JSON.stringify(targetBody, null, 2), {
        ...requestVariables,
        approval_key: approvalKeyOverride.trim(),
        approvalKey: approvalKeyOverride.trim(),
      });
      if (resolvedMessageText.includes("{{")) {
        return {
          error: "실시간 구독 메시지에 치환되지 않은 값이 있습니다. 정보설정과 approval_key를 확인하세요.",
          parsedMessage: undefined,
        };
      }
      const parsedMessage = parseBody(resolvedMessageText);
      if (parsedMessage.error) {
        return {
          error: `실시간 구독 JSON 오류: ${parsedMessage.error}`,
          parsedMessage: undefined,
        };
      }
      return { error: null, parsedMessage: parsedMessage.parsed };
    },
    [approvalKey, normalizedBroker, realtimeSubscriptionKey, requestVariables]
  );

  const sendManagedRealtimeSubscription = useCallback(
    (sample: OpenApiSample, trType: "1" | "2", approvalKeyOverride = approvalKey.trim()) => {
      const socket = managedRealtimeSocketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        failManagedRealtime(sample.id, "WebSocket 연결이 열려 있지 않습니다. 실시간 정보 영역에서 웹소켓 연결하기를 먼저 실행하세요.");
        return false;
      }

      const subscriptionSignature = getManagedRealtimeSignature(sample);
      const currentStates = managedRealtimeStatesRef.current;
      if (trType === "1") {
        const existingSubscribedSampleId = Object.entries(managedRealtimeSocketKeysRef.current).find(
          ([sampleId, signature]) => sampleId !== sample.id && signature === subscriptionSignature
        )?.[0];
        if (existingSubscribedSampleId) {
          managedRealtimeSocketKeysRef.current[sample.id] = subscriptionSignature;
          setManagedRealtimeStates((states) => ({
            ...states,
            [sample.id]: {
              ...(states[sample.id] ?? { messages: [] }),
              connected: true,
              connectionStatus: "연결됨",
              enabled: true,
              status: "ON",
              messages: [
                realtimeMessageLine("상태", "이미 열린 같은 실시간 구독에 연결했습니다."),
                ...(states[sample.id]?.messages ?? []),
              ].slice(0, 20),
              lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
            },
          }));
          return true;
        }
        managedRealtimeSocketKeysRef.current[sample.id] = subscriptionSignature;
      }

      if (trType === "2") {
        const otherActiveSampleId = Object.entries(managedRealtimeSocketKeysRef.current).find(
          ([sampleId, signature]) => sampleId !== sample.id && signature === subscriptionSignature && currentStates[sampleId]?.enabled
        )?.[0];
        if (otherActiveSampleId) {
          delete managedRealtimeSocketKeysRef.current[sample.id];
          setManagedRealtimeStates((states) => ({
            ...states,
            [sample.id]: {
              ...(states[sample.id] ?? { messages: [] }),
              connected: managedRealtimeConnectionState.connected,
              connectionStatus: managedRealtimeConnectionState.status,
              enabled: false,
              status: "OFF",
              messages: [
                realtimeMessageLine("상태", "같은 실시간 구독을 사용하는 다른 항목이 있어 수신만 OFF 처리했습니다."),
                ...(states[sample.id]?.messages ?? []),
              ].slice(0, 20),
              lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
            },
          }));
          return true;
        }
      }

      const payload = buildRealtimeSubscriptionPayload(sample, trType, approvalKeyOverride);
      if (payload.error || payload.parsedMessage === undefined) {
        if (trType === "1") {
          delete managedRealtimeSocketKeysRef.current[sample.id];
        }
        failManagedRealtime(sample.id, payload.error || "실시간 구독 메시지를 만들 수 없습니다.");
        return false;
      }

      socket.send(JSON.stringify(payload.parsedMessage));
      const isSubscribe = trType === "1";
      setManagedRealtimeStates((states) => ({
        ...states,
        [sample.id]: {
          ...(states[sample.id] ?? { messages: [] }),
          connected: true,
          connectionStatus: "연결됨",
          enabled: isSubscribe ? Boolean(states[sample.id]?.enabled) : false,
          status: isSubscribe ? "구독 확인 중" : "OFF",
          messages: [
            realtimeMessageLine(isSubscribe ? "구독 요청" : "구독 해제 요청", JSON.stringify(payload.parsedMessage)),
            ...(states[sample.id]?.messages ?? []),
          ].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        },
      }));
      return true;
    },
    [approvalKey, buildRealtimeSubscriptionPayload, failManagedRealtime, getManagedRealtimeSignature, managedRealtimeConnectionState.connected, managedRealtimeConnectionState.status]
  );

  const connectManagedRealtimeSample = useCallback(
    async (sample: OpenApiSample, subscribeAfterOpen = false) => {
      const currentSocket = managedRealtimeSocketRef.current;
      if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
        setManagedRealtimeConnectionState((state) => ({
          ...state,
          connected: true,
          status: "연결됨",
          messages: [realtimeMessageLine("상태", "공유 WebSocket 연결이 이미 열려 있습니다."), ...state.messages].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        }));
        if (subscribeAfterOpen) {
          const readyApprovalKey = await ensureKisRealtimeApprovalKey(sample.id);
          if (!readyApprovalKey) return;
          sendManagedRealtimeSubscription(sample, "1", readyApprovalKey);
        }
        return;
      }

      if (currentSocket) {
        closeManagedRealtimeSocketQuietly();
      }

      const readyApprovalKey =
        normalizedBroker === "kis" ? await ensureKisRealtimeApprovalKey(sample.id, { forceRefresh: true }) : approvalKey.trim();
      if (normalizedBroker === "kis" && !readyApprovalKey) return;

      const resolvedUrl = resolveRealtimeSocketUrl(sample);
      if (resolvedUrl.error || !resolvedUrl.socketUrl) {
        failManagedRealtime(sample.id, resolvedUrl.error || "WebSocket URL을 만들 수 없습니다.");
        return;
      }

      setError("");
      const socket = new WebSocket(resolvedUrl.socketUrl.toString());
      managedRealtimeSocketRef.current = socket;
      setManagedRealtimeConnectionState((state) => ({
        ...state,
        connected: false,
        status: "연결 중",
        url: resolvedUrl.socketUrl.toString(),
        messages: [realtimeMessageLine("상태", "공유 WebSocket 연결을 시작합니다."), ...state.messages].slice(0, 20),
        lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
      }));

      socket.onopen = () => {
        setManagedRealtimeConnectionState((state) => ({
          ...state,
          connected: true,
          status: "연결됨",
          url: resolvedUrl.socketUrl?.toString(),
          messages: [realtimeMessageLine("상태", "공유 WebSocket 연결이 확인됐습니다."), ...state.messages].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        }));
        if (subscribeAfterOpen) {
          sendManagedRealtimeSubscription(sample, "1", readyApprovalKey);
        }
      };
      socket.onmessage = async (event) => {
        const message = typeof event.data === "string" ? event.data : "[binary message]";
        const parsedRealtimeMessage = parseRealtimeSocketMessage(message);
        if (parsedRealtimeMessage.kind === "ack") {
          const targetSampleIds = findManagedRealtimeSampleIds(parsedRealtimeMessage.trId, parsedRealtimeMessage.trKey);
          if (!parsedRealtimeMessage.ok) {
            const failureMessage = describeRealtimeAckFailure(parsedRealtimeMessage.message);
            const retrySampleIds = targetSampleIds.filter((sampleId) => !managedRealtimeApprovalRetryRef.current[sampleId]);
            if (normalizedBroker === "kis" && isRealtimeInvalidApproval(parsedRealtimeMessage.message) && retrySampleIds.length > 0) {
              retrySampleIds.forEach((sampleId) => {
                managedRealtimeApprovalRetryRef.current[sampleId] = true;
              });
              setError("");
              setManagedRealtimeConnectionState((state) => ({
                ...state,
                status: "접속키 재발급 중",
                messages: [realtimeMessageLine("ACK 오류", `${failureMessage} 새 접속키로 다시 구독합니다.`), ...state.messages].slice(0, 20),
                lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
              }));
              setManagedRealtimeStates((states) => {
                const nextStates = { ...states };
                retrySampleIds.forEach((sampleId) => {
                  nextStates[sampleId] = {
                    ...(states[sampleId] ?? { messages: [] }),
                    connected: true,
                    connectionStatus: "접속키 재발급 중",
                    enabled: false,
                    status: "구독 재시도",
                    messages: [
                      realtimeMessageLine("ACK 오류", `${failureMessage} 새 접속키로 다시 구독합니다.`),
                      realtimeMessageLine("ACK 원문", message),
                      ...(states[sampleId]?.messages ?? []),
                    ].slice(0, 20),
                    lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
                  };
                });
                return nextStates;
              });
              const refreshedApprovalKey = await ensureKisRealtimeApprovalKey(retrySampleIds[0], { forceRefresh: true });
              if (refreshedApprovalKey && managedRealtimeSocketRef.current === socket && socket.readyState === WebSocket.OPEN) {
                retrySampleIds.forEach((sampleId) => {
                  const retrySample = realtimeSamples.find((candidate) => candidate.id === sampleId);
                  if (retrySample) {
                    sendManagedRealtimeSubscription(retrySample, "1", refreshedApprovalKey);
                  }
                });
                return;
              }
              failManagedRealtime(retrySampleIds[0], "approval_key는 재발급됐지만 기존 WebSocket이 닫혔습니다. 다시 웹소켓 연결확인을 실행하세요.");
              return;
            }
            if (normalizedBroker === "kis" && isRealtimeDuplicateAppKey(parsedRealtimeMessage.message)) {
              const failedSampleIds = targetSampleIds.length > 0 ? targetSampleIds : Object.keys(managedRealtimeSocketKeysRef.current);
              closeManagedRealtimeSocketQuietly();
              setIsRealtimeBulkBusy(false);
              setError(failureMessage);
              setManagedRealtimeConnectionState((state) => ({
                ...state,
                connected: false,
                status: "중복 연결 정리",
                messages: [realtimeMessageLine("ACK 오류", failureMessage), realtimeMessageLine("상태", "공유 WebSocket 연결을 정리했습니다."), ...state.messages].slice(0, 20),
                lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
              }));
              setManagedRealtimeStates((states) => {
                const nextStates = { ...states };
                failedSampleIds.forEach((sampleId) => {
                  nextStates[sampleId] = {
                    ...(states[sampleId] ?? { messages: [] }),
                    connected: false,
                    connectionStatus: "중복 연결 정리",
                    enabled: false,
                    status: "OFF",
                    messages: [realtimeMessageLine("ACK 오류", failureMessage), realtimeMessageLine("상태", "공유 WebSocket 연결을 정리했습니다."), ...(states[sampleId]?.messages ?? [])].slice(0, 20),
                    lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
                  };
                });
                return nextStates;
              });
              return;
            }
            setError(failureMessage);
            setManagedRealtimeStates((states) => {
              const nextStates = { ...states };
              targetSampleIds.forEach((sampleId) => {
                delete managedRealtimeSocketKeysRef.current[sampleId];
                delete managedRealtimeApprovalRetryRef.current[sampleId];
                nextStates[sampleId] = {
                  ...(states[sampleId] ?? { messages: [] }),
                  connected: managedRealtimeConnectionState.connected,
                  connectionStatus: "구독 오류",
                  enabled: false,
                  status: "오류",
                  messages: [realtimeMessageLine("ACK 오류", failureMessage), realtimeMessageLine("ACK 원문", message), ...(states[sampleId]?.messages ?? [])].slice(0, 20),
                  lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
                };
              });
              return nextStates;
            });
            return;
          }

          const nextEnabled = !isRealtimeUnsubscribeAck(parsedRealtimeMessage.message);
          setManagedRealtimeStates((states) => {
            const nextStates = { ...states };
            targetSampleIds.forEach((sampleId) => {
              delete managedRealtimeApprovalRetryRef.current[sampleId];
              if (!nextEnabled) {
                delete managedRealtimeSocketKeysRef.current[sampleId];
              }
              nextStates[sampleId] = {
                ...(states[sampleId] ?? { messages: [] }),
                connected: true,
                connectionStatus: "연결됨",
                enabled: nextEnabled,
                status: nextEnabled ? "ON" : "OFF",
                messages: [
                  realtimeMessageLine("ACK", parsedRealtimeMessage.message || (nextEnabled ? "구독 성공" : "구독 해제 성공")),
                  ...(states[sampleId]?.messages ?? []),
                ].slice(0, 20),
                lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
              };
            });
            return nextStates;
          });
          return;
        }

        const isRealtimeData = parsedRealtimeMessage.kind === "data";
        if (isRealtimeData) {
          findManagedRealtimeSampleIds(parsedRealtimeMessage.trId, parsedRealtimeMessage.trKey).forEach((sampleId) => {
            delete managedRealtimeApprovalRetryRef.current[sampleId];
          });
        }
        const targetSampleIds = isRealtimeData ? findManagedRealtimeSampleIds(parsedRealtimeMessage.trId, parsedRealtimeMessage.trKey) : [];
        if (targetSampleIds.length === 0) return;
        setManagedRealtimeStates((states) => {
          const nextStates = { ...states };
          targetSampleIds.forEach((sampleId) => {
            nextStates[sampleId] = {
              ...(states[sampleId] ?? { messages: [] }),
              connected: true,
              connectionStatus: "연결됨",
              enabled: true,
              status: "ON",
              messages: [realtimeMessageLine(parsedRealtimeMessage.label, parsedRealtimeMessage.raw), ...(states[sampleId]?.messages ?? [])].slice(0, 20),
              lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
            };
          });
          return nextStates;
        });
      };
      socket.onerror = () => {
        setIsRealtimeBulkBusy(false);
        if (managedRealtimeSocketRef.current === socket) {
          managedRealtimeSocketRef.current = null;
        }
        managedRealtimeSocketKeysRef.current = {};
        managedRealtimeApprovalRetryRef.current = {};
        setManagedRealtimeConnectionState((state) => ({
          ...state,
          connected: false,
          status: "오류",
          messages: [realtimeMessageLine("오류", "WebSocket 오류가 발생했습니다."), ...state.messages].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        }));
        setManagedRealtimeStates((states) => ({
          ...Object.fromEntries(
            Object.entries(states).map(([sampleId, state]) => [
              sampleId,
              {
                ...state,
                connected: false,
                enabled: false,
                connectionStatus: "오류",
                status: "오류",
                messages: [realtimeMessageLine("오류", "WebSocket 오류가 발생했습니다."), ...(state.messages ?? [])].slice(0, 20),
                lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
              },
            ])
          ),
          [sample.id]: {
            ...(states[sample.id] ?? { messages: [] }),
            connected: false,
            connectionStatus: "오류",
            enabled: false,
            status: "오류",
            messages: [realtimeMessageLine("오류", "WebSocket 오류가 발생했습니다."), ...(states[sample.id]?.messages ?? [])].slice(0, 20),
            lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
          },
        }));
      };
      socket.onclose = (event) => {
        setIsRealtimeBulkBusy(false);
        if (managedRealtimeSocketRef.current === socket) {
          managedRealtimeSocketRef.current = null;
        }
        managedRealtimeSocketKeysRef.current = {};
        managedRealtimeApprovalRetryRef.current = {};
        setManagedRealtimeConnectionState((state) => ({
          ...state,
          connected: false,
          status: `연결 종료 (${event.code})`,
          messages: [realtimeMessageLine("상태", `공유 WebSocket 연결 종료 (${event.code})`), ...state.messages].slice(0, 20),
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        }));
        setManagedRealtimeStates((states) =>
          Object.fromEntries(
            Object.entries(states).map(([sampleId, state]) => [
              sampleId,
              {
                ...state,
                connected: false,
                connectionStatus: `연결 종료 (${event.code})`,
                enabled: false,
                status: "OFF",
                messages: [realtimeMessageLine("상태", `연결 종료 (${event.code})`), ...(state.messages ?? [])].slice(0, 20),
                lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
              },
            ])
          )
        );
      };
    },
    [
      approvalKey,
      closeManagedRealtimeSocketQuietly,
      ensureKisRealtimeApprovalKey,
      failManagedRealtime,
      findManagedRealtimeSampleIds,
      managedRealtimeConnectionState.connected,
      normalizedBroker,
      realtimeSamples,
      resolveRealtimeSocketUrl,
      sendManagedRealtimeSubscription,
    ]
  );

  const turnOnRealtimeSample = useCallback(
    async (sample: OpenApiSample) => {
      const socket = managedRealtimeSocketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const readyApprovalKey = await ensureKisRealtimeApprovalKey(sample.id);
        if (!readyApprovalKey) return;
        sendManagedRealtimeSubscription(sample, "1", readyApprovalKey);
        return;
      }
      failManagedRealtime(sample.id, "실시간 정보 영역에서 웹소켓 연결하기를 먼저 실행한 뒤 ON으로 수신을 시작하세요.");
    },
    [ensureKisRealtimeApprovalKey, failManagedRealtime, sendManagedRealtimeSubscription]
  );

  const turnOnAllRealtimeSamples = useCallback(async () => {
    if (isRealtimeBulkBusy) return;
    const targetSample = realtimeConnectionTarget ?? realtimeSamples[0];
    if (!targetSample) return;

    const socket = managedRealtimeSocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      failManagedRealtime(targetSample.id, "WebSocket 연결이 열려 있지 않습니다. 먼저 웹소켓 연결하기를 실행하세요.");
      return;
    }

    const readyApprovalKey = await ensureKisRealtimeApprovalKey(targetSample.id);
    if (!readyApprovalKey) return;

    setError("");
    setIsRealtimeBulkBusy(true);
    try {
      const skippedSamples = realtimeSamples
        .map((sample) => ({ sample, reason: getRealtimeAutoSubscribeBlockReason(sample) }))
        .filter((item) => item.reason);
      if (skippedSamples.length > 0) {
        setManagedRealtimeStates((states) => {
          const nextStates = { ...states };
          skippedSamples.forEach(({ sample, reason }) => {
            nextStates[sample.id] = {
              ...(states[sample.id] ?? { messages: [] }),
              connected: managedRealtimeConnectionState.connected,
              connectionStatus: "정보 필요",
              enabled: false,
              status: "정보 필요",
              messages: [realtimeMessageLine("상태", reason), ...(states[sample.id]?.messages ?? [])].slice(0, 20),
              lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
            };
          });
          return nextStates;
        });
      }

      for (const sample of autoSubscribableRealtimeSamples) {
        const currentSocket = managedRealtimeSocketRef.current;
        if (!currentSocket || currentSocket.readyState !== WebSocket.OPEN) {
          failManagedRealtime(sample.id, "전체 ON 처리 중 WebSocket 연결이 종료됐습니다. 다시 웹소켓 연결하기를 실행하세요.");
          break;
        }
        if (managedRealtimeStatesRef.current[sample.id]?.enabled) continue;
        sendManagedRealtimeSubscription(sample, "1", readyApprovalKey);
      }
    } finally {
      setIsRealtimeBulkBusy(false);
    }
  }, [
    autoSubscribableRealtimeSamples,
    ensureKisRealtimeApprovalKey,
    failManagedRealtime,
    isRealtimeBulkBusy,
    managedRealtimeConnectionState.connected,
    realtimeConnectionTarget,
    realtimeSamples,
    sendManagedRealtimeSubscription,
  ]);

  const turnOffRealtimeSample = useCallback(
    (sample: OpenApiSample) => {
      const socket = managedRealtimeSocketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        sendManagedRealtimeSubscription(sample, "2");
        return;
      }
      delete managedRealtimeSocketKeysRef.current[sample.id];
      delete managedRealtimeApprovalRetryRef.current[sample.id];
      setManagedRealtimeStates((states) => ({
        ...states,
        [sample.id]: {
          ...(states[sample.id] ?? { messages: [] }),
          connected: managedRealtimeConnectionState.connected,
          connectionStatus: managedRealtimeConnectionState.status || states[sample.id]?.connectionStatus || "연결 전",
          enabled: false,
          status: "OFF",
          lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
        },
      }));
    },
    [managedRealtimeConnectionState.connected, managedRealtimeConnectionState.status, sendManagedRealtimeSubscription]
  );

  const turnOffAllRealtimeSamples = useCallback(async () => {
    if (isRealtimeBulkBusy) return;
    const socket = managedRealtimeSocketRef.current;
    const enabledSamples = realtimeSamples.filter((sample) => managedRealtimeStatesRef.current[sample.id]?.enabled);
    if (enabledSamples.length === 0) return;

    setError("");
    setIsRealtimeBulkBusy(true);
    try {
      for (const sample of enabledSamples) {
        if (socket && socket.readyState === WebSocket.OPEN) {
          sendManagedRealtimeSubscription(sample, "2");
          continue;
        }
        delete managedRealtimeSocketKeysRef.current[sample.id];
        delete managedRealtimeApprovalRetryRef.current[sample.id];
        setManagedRealtimeStates((states) => ({
          ...states,
          [sample.id]: {
            ...(states[sample.id] ?? { messages: [] }),
            connected: managedRealtimeConnectionState.connected,
            connectionStatus: managedRealtimeConnectionState.status || "연결 전",
            enabled: false,
            status: "OFF",
            lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
          },
        }));
      }
    } finally {
      setIsRealtimeBulkBusy(false);
    }
  }, [isRealtimeBulkBusy, managedRealtimeConnectionState.connected, managedRealtimeConnectionState.status, realtimeSamples, sendManagedRealtimeSubscription]);

  const disconnectAllRealtimeSamples = useCallback(() => {
    setIsRealtimeBulkBusy(false);
    closeManagedRealtimeSocketQuietly();
    setManagedRealtimeConnectionState((state) => ({
      ...state,
      connected: false,
      status: "연결 해제",
      messages: [realtimeMessageLine("상태", "공유 WebSocket 연결을 해제했습니다."), ...state.messages].slice(0, 20),
      lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
    }));
    setManagedRealtimeStates((states) =>
      Object.fromEntries(
        Object.entries(states).map(([sampleId, state]) => [
          sampleId,
          {
            ...state,
            connected: false,
            connectionStatus: "연결 해제",
            enabled: false,
            status: "OFF",
            messages: [realtimeMessageLine("상태", "공유 WebSocket 연결을 해제했습니다."), ...(state.messages ?? [])].slice(0, 20),
            lastUpdatedAt: new Date().toLocaleTimeString("ko-KR"),
          },
        ])
      )
    );
  }, [closeManagedRealtimeSocketQuietly]);

  const toggleManagedRealtimeConnection = useCallback(() => {
    if (managedRealtimeConnectionState.connected) {
      disconnectAllRealtimeSamples();
      return;
    }
    if (realtimeConnectionTarget) {
      connectManagedRealtimeSample(realtimeConnectionTarget);
    }
  }, [
    connectManagedRealtimeSample,
    disconnectAllRealtimeSamples,
    managedRealtimeConnectionState.connected,
    realtimeConnectionTarget,
  ]);

  const openRealtimeSample = useCallback(
    (sample: OpenApiSample) => {
      const targetBaseUrl = sample.baseUrl || defaultBaseUrl;
      const targetUrl = toRequestUrl(targetBaseUrl, sample.path, {});
      const targetBody = applyRealtimeSubscriptionKey(sample.body ?? {}, realtimeSubscriptionKey);

      setSelectedRealtimeSample(sample);
      setSelectedSampleId(sample.id);
      setSelectedSampleLabel(sample.label);
      setRealtimeUrl(targetUrl);
      setRealtimeMessageText(prettyJson(JSON.stringify(targetBody, null, 2)));
      setError("");
      setIsRealtimeEditorOpen(true);
    },
    [defaultBaseUrl, realtimeSubscriptionKey]
  );

  const closeRealtimeEditor = useCallback(() => {
    setIsRealtimeEditorOpen(false);
    setSelectedRealtimeSample(null);
  }, []);

  useEffect(() => {
    const closeSocketOnPageExit = () => {
      closeManagedRealtimeSocketQuietly();
    };
    window.addEventListener("pagehide", closeSocketOnPageExit);
    window.addEventListener("beforeunload", closeSocketOnPageExit);
    return () => {
      window.removeEventListener("pagehide", closeSocketOnPageExit);
      window.removeEventListener("beforeunload", closeSocketOnPageExit);
      closeManagedRealtimeSocketQuietly();
    };
  }, [closeManagedRealtimeSocketQuietly]);

  const isEditorBodyMethod = useCallback((targetMethod: OpenApiMethod) => {
    return targetMethod === "POST" || targetMethod === "PUT" || targetMethod === "PATCH";
  }, []);

  const saveCredentials = () => {
    setShouldPersistCredentials(true);
  };

  const tokenExpiresAtTimestamp = accessTokenExpiresAtTimestamp(accessTokenExpiresAt);
  const hasTokenExpiry = Boolean(tokenExpiresAtTimestamp);
  const isAccessTokenExpired = Boolean(accessToken && hasTokenExpiry && tokenExpiresAtTimestamp <= Date.now());
  const hasUsableAccessToken = isUsableAccessToken(accessToken, accessTokenExpiresAt);
  const isTokenSetupStepComplete = (stepKey: TokenSetupStepKey) =>
    isTokenIssueStepKey(stepKey) ? hasUsableAccessToken : completedTokenSetupSteps.includes(stepKey);
  const tokenIssueUpdatedAtText = tokenIssueStatus.updatedAt
    ? new Date(tokenIssueStatus.updatedAt).toLocaleString("ko-KR")
    : "";
  const tokenStatusLabel = accessToken
    ? isAccessTokenExpired
      ? "토큰 만료"
      : "토큰 발급 완료"
    : tokenIssueStatus.state === "running"
    ? "토큰 발급 중"
    : tokenIssueStatus.state === "issuedWithoutToken"
    ? "토큰 발급 응답 확인"
    : tokenIssueStatus.state === "failed"
    ? "토큰 발급 실패"
    : "토큰 없음";
  const tokenStatusDescription = accessToken
    ? isAccessTokenExpired
      ? "토큰 만료시간이 지났습니다. 토큰을 다시 발급하세요."
      : "전문 전송에 사용할 유효한 토큰이 저장되어 있습니다."
    : tokenIssueStatus.state === "running"
    ? "토큰 발급 요청을 전송하고 있습니다."
    : tokenIssueStatus.state === "issuedWithoutToken"
    ? "토큰 발급 응답은 성공했지만 화면에서 사용할 토큰 값을 찾지 못했습니다. 결과내역의 응답 본문을 확인하세요."
    : tokenIssueStatus.state === "failed"
    ? "토큰 발급 요청이 실패했습니다. 결과내역의 응답 상태와 본문을 확인하세요."
    : "전문 전송 전 토큰발급을 먼저 진행하세요.";
  const tokenExpiresAtText = hasTokenExpiry ? new Date(tokenExpiresAtTimestamp).toLocaleString("ko-KR") : "만료시간 정보 없음";
  const tokenStatusClass = accessToken
    ? isAccessTokenExpired
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald-200 bg-emerald-50 text-emerald-700"
    : tokenIssueStatus.state === "running"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : tokenIssueStatus.state === "issuedWithoutToken"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : tokenIssueStatus.state === "failed"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
  const selectedRealtimeManagedState = selectedRealtimeSample ? managedRealtimeStates[selectedRealtimeSample.id] : undefined;
  const selectedRealtimeEnabled = Boolean(selectedRealtimeManagedState?.enabled);
  const selectedRealtimeStatus = selectedRealtimeManagedState?.status || "OFF";
  const selectedRealtimeHasData = Boolean(selectedRealtimeManagedState?.messages.some((message) => message.includes("] 수신")));
  const selectedRealtimeLatestIsData = Boolean(selectedRealtimeManagedState?.messages[0]?.includes("] 수신"));
  const selectedRealtimeReceiveMessages = (selectedRealtimeManagedState?.messages ?? [])
    .filter((message) => message.includes("] 수신"))
    .slice(0, 12);
  const selectedRealtimeSubscriptionStatus =
    selectedRealtimeStatus === "구독 확인 중" ? "확인 중" : selectedRealtimeStatus === "구독 재시도" ? "재시도" : selectedRealtimeStatus;
  const selectedRealtimeReceiveStatus =
    selectedRealtimeStatus === "오류" || selectedRealtimeManagedState?.connectionStatus?.includes("오류")
      ? "오류"
      : !selectedRealtimeEnabled
      ? "수신 OFF"
      : selectedRealtimeLatestIsData
      ? "수신 중"
      : selectedRealtimeHasData
      ? "수신됨"
      : "수신 대기";
  const renderAllHistoryList = () => {
    if (history.length === 0) {
      return (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
          아직 전송 이력이 없습니다.
        </p>
      );
    }

    if (filteredAllHistory.length === 0) {
      return (
        <p className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
          검색 조건에 맞는 결과내역이 없습니다.
        </p>
      );
    }

    return (
      <div className="mt-3 max-h-80 overflow-y-auto pr-1">
        <ul className="grid gap-2">
          {filteredAllHistory.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedAllHistoryDeleteIds.includes(item.id)}
                    onChange={() => toggleAllHistoryDeleteSelection(item.id)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                    style={CHECKBOX_INPUT_STYLE}
                    aria-label={`${item.executedAt} 전체 결과내역 선택`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-slate-800">{item.sampleLabel || item.sampleId}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-black ${
                          item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {item.method} {item.requestUrl}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.executedAt} / {item.elapsedMs}ms
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSampleId(item.sampleId);
                    setSelectedSampleLabel(item.sampleLabel || item.sampleId);
                    setSelectedHistoryResultId(item.id);
                    setIsResultHistoryOpen(true);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black hover:bg-slate-100"
                >
                  결과 보기
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 bg-white px-4 py-8 text-sm text-slate-900">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {modeSelectorContent ? <div className="mb-4 flex flex-wrap items-center gap-2">{modeSelectorContent}</div> : null}
        {headerContent ? <div>{headerContent}</div> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsInfoSettingsOpen((isOpen) => !isOpen)}
            aria-expanded={isInfoSettingsOpen}
            className={`rounded-md border border-slate-300 px-3 py-2 text-sm font-black ${
              isInfoSettingsOpen ? "bg-[#2c2a26] text-white" : "text-[#2c2a26]"
            }`}
          >
            정보설정
          </button>
          <button
            type="button"
            onClick={() => setIsTokenSectionOpen((isOpen) => !isOpen)}
            aria-expanded={isTokenSectionOpen}
            className={`rounded-md border border-slate-300 px-3 py-2 text-sm font-black ${
              isTokenSectionOpen ? "bg-[#2c2a26] text-white" : "text-[#2c2a26]"
            }`}
          >
            토큰발급
          </button>
          <button
            type="button"
            onClick={() => setIsAllHistoryOpen((isOpen) => !isOpen)}
            aria-expanded={isAllHistoryOpen}
            className={`rounded-md border border-slate-300 px-3 py-2 text-sm font-black ${
              isAllHistoryOpen ? "bg-[#2c2a26] text-white" : "text-[#2c2a26]"
            }`}
          >
            결과내역
          </button>
        </div>
        <section className={`mt-3 rounded-lg border px-4 py-3 ${tokenStatusClass}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black">전문 전송 상태</p>
              <p className="mt-1 text-sm font-black">{tokenStatusLabel}</p>
              <p className="mt-1 text-xs">{tokenStatusDescription}</p>
            </div>
            <div className="grid gap-1 text-right text-xs">
              <span className="font-mono font-bold">토큰: {accessToken ? maskToken(accessToken) : "-"}</span>
              <span className="font-bold">만료시간: {tokenExpiresAtText}</span>
              {tokenIssueUpdatedAtText ? <span className="font-bold">최근 발급: {tokenIssueUpdatedAtText}</span> : null}
              {tokenIssueStatus.status !== undefined ? <span className="font-bold">응답상태: {tokenIssueStatus.status}</span> : null}
            </div>
          </div>
        </section>

        {isInfoSettingsOpen ? (
          <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h2 className="text-sm font-black text-slate-700">정보설정</h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                clientId
                <input
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    saveCredentials();
                  }}
                  autoComplete="off"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                  placeholder="clientId 입력"
                />
              </label>
              <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                clientSecret
                <input
                  type="password"
                  value={secretKey}
                  onChange={(event) => {
                    setSecretKey(event.target.value);
                    saveCredentials();
                  }}
                  autoComplete="off"
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                  placeholder="clientSecret 입력"
                />
              </label>
            </div>
            {tokenProcedureModes.includes("B2B") ? (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  ciNo
                  <input
                    value={ciNo}
                    onChange={(event) => setCiNo(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="ciNo 입력"
                  />
                </label>
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  userInfo
                  <input
                    value={userInfo}
                    onChange={(event) => setUserInfo(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="userInfo 입력"
                  />
                </label>
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  userInfo 키(infoType)
                  <input
                    value={userInfoKey}
                    onChange={(event) => setUserInfoKey(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="1"
                  />
                </label>
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  계좌번호
                  <input
                    value={accountNo}
                    onChange={(event) => setAccountNo(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="계좌번호 입력"
                  />
                </label>
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  상품코드
                  <input
                    value={productCode}
                    onChange={(event) => setProductCode(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="01"
                  />
                </label>
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  계좌비밀번호
                  <input
                    type="password"
                    value={accountPassword}
                    onChange={(event) => setAccountPassword(event.target.value)}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="암호화된 비밀번호 입력"
                  />
                </label>
              </div>
            ) : null}
            {normalizedBroker === "kis" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="inline-flex w-full flex-col gap-1 text-sm font-semibold text-slate-700">
                  approval_key
                  <input
                    value={approvalKey}
                    onChange={(event) => {
                      setApprovalKey(event.target.value);
                      saveCredentials();
                    }}
                    autoComplete="off"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                    placeholder="실시간 웹소켓 접속키"
                  />
                </label>
              </div>
            ) : null}
            {accessToken ? (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                액세스 토큰 준비됨: <span className="font-mono">{maskToken(accessToken)}</span>
              </p>
            ) : null}
            {normalizedBroker === "kis" && approvalKey ? (
              <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                웹소켓 접속키 준비됨: <span className="font-mono">{maskToken(approvalKey)}</span>
              </p>
            ) : null}
          </section>
        ) : null}

        {isTokenSectionOpen ? (
          <>
            {normalizedTokenProcedures.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                인증 정보를 입력한 뒤 전문을 전송하세요. 기본 URL은 상단 선택값을 사용합니다.
              </p>
            ) : (
              <div className="mt-3 grid gap-3">
                {normalizedTokenProcedures.map((procedure) => (
                  <article key={procedure.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <h3 className="text-sm font-black text-slate-700">{procedure.label}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      환경: <span className="font-black text-slate-700">{procedure.environment}</span>
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
                      {procedure.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {procedure.recommendedHeaders && procedure.recommendedHeaders.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-xs font-black text-slate-700">권장 헤더</p>
                        <ul className="mt-1 space-y-1 text-xs text-slate-500">
                          {procedure.recommendedHeaders.map((header) => (
                            <li key={header} className="font-mono break-all">
                              {header}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {procedure.note ? <p className="mt-2 text-xs text-slate-500">{procedure.note}</p> : null}
                  </article>
                ))}
              </div>
            )}

            {tokenRequestDrafts.length > 0 ? (
              <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-700">{tokenSetupSteps.length > 0 ? "토큰 발급 순차 진행" : "토큰 요청 전문"}</h3>
                  {isLoadingTokenDefaults ? <span className="text-xs font-bold text-slate-500">기본값 불러오는 중...</span> : null}
                </div>
                {tokenDefaultsError ? (
                  <p className="mt-2 text-xs text-amber-700">기본값 대체 사용: {tokenDefaultsError}</p>
                ) : null}
                {tokenSetupSteps.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className={`grid gap-2 ${tokenSetupSteps.length >= 4 ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
                      {tokenSetupSteps.map(({ stepKey }, index) => {
                        const meta = TOKEN_SETUP_STEP_META[stepKey];
                        const previousStepsComplete = tokenSetupSteps
                          .slice(0, index)
                          .every((previousStep) => isTokenSetupStepComplete(previousStep.stepKey));
                        const isComplete = isTokenSetupStepComplete(stepKey);
                        const isAgreementStep = stepKey === "terms" || stepKey === "financial";
                        const canSkipAgreementPrerequisites = isB2BTokenFlow && stepKey === "authCode";
                        const hasAuthCodePrerequisite =
                          isTokenSetupStepComplete("authCode") || Boolean(authorizationCode.trim());
                        const prerequisiteComplete =
                          canSkipAgreementPrerequisites || (isB2BTokenFlow && stepKey === "token" ? hasAuthCodePrerequisite : previousStepsComplete);
                        const canSelect = prerequisiteComplete || isComplete || index === 0;
                        const isSelected = selectedTokenSetupStep === stepKey;
                        return (
                          <button
                            key={stepKey}
                            type="button"
                            onClick={() => setSelectedTokenSetupStep(stepKey)}
                            disabled={!canSelect}
                            className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isSelected ? "border-[#2c2a26] bg-[#2c2a26] text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-black ${
                                isSelected
                                  ? "border-white/50 bg-white/15 text-white"
                                  : isComplete
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-slate-300 bg-white text-slate-500"
                              }`}
                            >
                              {isComplete ? "✓" : index + 1}
                            </span>
                            <span className="mt-2 block text-sm font-black">{meta.label}</span>
                            <span className={`mt-1 block text-xs ${isSelected ? "text-white/75" : "text-slate-500"}`}>
                              {isComplete ? (isAgreementStep ? "등록됨" : "완료") : canSelect ? "진행 가능" : "대기"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {(() => {
                      const selectedStep = tokenSetupSteps.find((step) => step.stepKey === selectedTokenSetupStep) ?? tokenSetupSteps[0];
                      if (!selectedStep) return null;
                      const { stepKey, draft } = selectedStep;
                      const index = tokenSetupSteps.findIndex((step) => step.stepKey === stepKey);
                      const meta = TOKEN_SETUP_STEP_META[stepKey];
                      const previousStepsComplete = tokenSetupSteps
                        .slice(0, index)
                        .every((previousStep) => isTokenSetupStepComplete(previousStep.stepKey));
                      const isComplete = isTokenSetupStepComplete(stepKey);
                      const isAgreementStep = stepKey === "terms" || stepKey === "financial";
                      const canSkipAgreementPrerequisites = isB2BTokenFlow && stepKey === "authCode";
                      const hasAuthCodePrerequisite =
                        isTokenSetupStepComplete("authCode") || Boolean(authorizationCode.trim());
                      const prerequisiteComplete =
                        canSkipAgreementPrerequisites || (isB2BTokenFlow && stepKey === "token" ? hasAuthCodePrerequisite : previousStepsComplete);
                      const canRun = prerequisiteComplete && !isRunning;
                      return (
                        <article key={draft.id} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                                  isComplete ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-50 text-slate-500"
                                }`}
                              >
                                {isComplete ? "✓" : index + 1}
                              </span>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="text-sm font-black text-slate-800">{meta.label}</h4>
                                  {isComplete ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">
                                      {isAgreementStep ? "등록됨" : "완료"}
                                    </span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
                                <p className="mt-1 break-all font-mono text-xs text-slate-500">
                                  {draft.method} {draft.baseUrl}
                                  {draft.path}
                                </p>
                                {!prerequisiteComplete ? (
                                  <p className="mt-1 text-xs font-bold text-amber-700">
                                    {isB2BTokenFlow && stepKey === "token"
                                      ? "인가코드발급을 먼저 완료하세요."
                                      : "이전 단계를 먼저 완료하세요."}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => sendTokenDraft(draft)}
                              disabled={!canRun}
                              className="rounded-md bg-[#2c2a26] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#3b352c] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isRunning ? "진행 중..." : isComplete ? "다시 실행" : "실행"}
                            </button>
                          </div>
                          <textarea
                            value={applyRequestVariables(draft.bodyText, requestVariables)}
                            onChange={(event) => updateTokenDraftBody(draft.id, event.target.value)}
                            rows={draft.id.includes("auth") ? 10 : 9}
                            className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#fcb514]"
                          />
                        </article>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="mt-3 grid max-h-[520px] gap-3 overflow-y-auto pr-1">
                    {tokenRequestDrafts.map((draft) => (
                      <article key={draft.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black text-slate-500">{draft.mode}</p>
                            <h4 className="text-sm font-black text-slate-800">{draft.label}</h4>
                            <p className="mt-1 break-all font-mono text-xs text-slate-500">
                              {draft.method} {draft.baseUrl}
                              {draft.path}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => sendTokenDraft(draft)}
                            disabled={isRunning}
                            className="rounded-md bg-[#2c2a26] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#3b352c] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isRunning ? "전송 중..." : "전송"}
                          </button>
                        </div>
                        <textarea
                          value={applyRequestVariables(draft.bodyText, requestVariables)}
                          onChange={(event) => updateTokenDraftBody(draft.id, event.target.value)}
                          rows={draft.id.includes("auth") ? 10 : 9}
                          className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#fcb514]"
                        />
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

          </>
        ) : null}

        {isAllHistoryOpen ? (
          <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-slate-700">결과내역</h2>
                <p className="mt-1 text-xs text-slate-500">토큰발급과 전문 전송 결과가 최신순으로 누적됩니다.</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                {allHistorySearchTerm.trim() ? `${filteredAllHistory.length} / ${history.length}건` : `${history.length}건`}
              </span>
            </div>
            <label className="mt-3 grid gap-1 text-xs font-black text-slate-700">
              결과내역 검색
              <input
                value={allHistorySearchTerm}
                onChange={(event) => setAllHistorySearchTerm(event.target.value)}
                placeholder="토큰발급, API명, URL, 상태, 요청/응답 전문 검색"
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#fcb514]"
              />
            </label>
            {history.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFilteredHistoryForDelete}
                  disabled={filteredAllHistory.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  검색 결과 전체 선택
                </button>
                <button
                  type="button"
                  onClick={clearAllHistoryDeleteSelection}
                  disabled={selectedAllHistoryDeleteIds.length === 0}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedAllHistory}
                  disabled={selectedAllHistoryDeleteIds.length === 0}
                  className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  선택 삭제 ({selectedAllHistoryDeleteIds.length})
                </button>
              </div>
            ) : null}
            {renderAllHistoryList()}
          </section>
        ) : null}
      </section>

      {isRealtimeView ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-[#2c2a26]">실시간 정보</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                {realtimeSummaryText}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={managedRealtimeConnectionState.connected}
                onClick={toggleManagedRealtimeConnection}
                disabled={!realtimeConnectionTarget || isRealtimeConnectionBusy}
                className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-50 ${
                  managedRealtimeConnectionState.connected
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-300 bg-white text-[#2c2a26]"
                } ${!realtimeConnectionTarget || isRealtimeConnectionBusy ? "" : "hover:bg-slate-100"}`}
              >
                <span
                  className={`relative h-5 w-9 rounded-full border transition ${
                    managedRealtimeConnectionState.connected ? "border-blue-500 bg-blue-500" : "border-slate-300 bg-slate-200"
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                      managedRealtimeConnectionState.connected ? "left-[1.125rem]" : "left-0.5"
                    }`}
                  />
                </span>
                <span>
                  {isRealtimeConnectionBusy
                    ? "웹소켓 연결 중"
                    : managedRealtimeConnectionState.connected
                    ? "웹소켓 해제"
                    : "웹소켓 연결하기"}
                </span>
              </button>
              <button
                type="button"
                onClick={turnOnAllRealtimeSamples}
                disabled={
                  !managedRealtimeConnectionState.connected ||
                  autoSubscribableRealtimeSamples.length === 0 ||
                  isAllRealtimeEnabled ||
                  isRealtimeBulkBusy
                }
                className="rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRealtimeBulkBusy ? "전체 처리 중" : "전체 ON"}
              </button>
              <button
                type="button"
                onClick={turnOffAllRealtimeSamples}
                disabled={!managedRealtimeConnectionState.connected || activeRealtimeCount === 0 || isRealtimeBulkBusy}
                className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isRealtimeBulkBusy ? "전체 처리 중" : "전체 OFF"}
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(180px,240px)_1fr]">
            <label className="flex flex-col gap-1 text-xs font-black text-slate-600">
              기본 종목코드
              <input
                value={realtimeSubscriptionKey}
                onChange={(event) => setRealtimeSubscriptionKey(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-[#fcb514]"
                placeholder="005930"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-black text-slate-600">
              실시간 검색
              <input
                value={realtimeSearchTerm}
                onChange={(event) => setRealtimeSearchTerm(event.target.value)}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#fcb514]"
                placeholder="TR ID, 이름, 설명, URL"
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {filteredRealtimeSamples.map((sample) => {
              const state = managedRealtimeStates[sample.id];
              const isEnabled = Boolean(state?.enabled);
              const trId = findStringValue(sample.body, ["tr_id", "trId"]) || "-";
              const trKey = findStringValue(sample.body, ["tr_key", "trKey"]) || "-";
              const status = state?.status || "OFF";
              const hasRealtimeData = Boolean(state?.messages.some((message) => message.includes("] 수신")));
              const latestIsRealtimeData = Boolean(state?.messages[0]?.includes("] 수신"));
              const subscriptionStatus = status === "구독 확인 중" ? "확인 중" : status === "구독 재시도" ? "재시도" : status;
              const receiveStatus =
                status === "오류" || state?.connectionStatus?.includes("오류")
                  ? "오류"
                  : !isEnabled
                  ? "수신 OFF"
                  : latestIsRealtimeData
                  ? "수신 중"
                  : hasRealtimeData
                  ? "수신됨"
                  : "수신 대기";
              return (
                <article key={sample.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-[220px] flex-1">
                      <h3 className="truncate text-sm font-black text-[#2c2a26]">{sample.label}</h3>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 font-mono text-[11px] font-black text-slate-600">
                      TR {trId}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1 font-mono text-[11px] font-black text-slate-600">
                      KEY {trKey}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-black ${
                        subscriptionStatus.includes("오류")
                          ? "bg-red-100 text-red-700"
                          : isEnabled
                          ? "bg-emerald-100 text-emerald-700"
                          : subscriptionStatus.includes("확인") || subscriptionStatus.includes("재시도")
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      구독 {subscriptionStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-black ${
                        receiveStatus.includes("오류")
                          ? "bg-red-100 text-red-700"
                          : receiveStatus === "수신 중"
                          ? "bg-blue-100 text-blue-700"
                          : receiveStatus === "수신 대기" || receiveStatus === "수신됨"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {receiveStatus}
                    </span>
                    {state?.lastUpdatedAt ? (
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                        {state.lastUpdatedAt}
                      </span>
                    ) : null}
                    <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => (isEnabled ? turnOffRealtimeSample(sample) : turnOnRealtimeSample(sample))}
                        className="sr-only"
                        style={CHECKBOX_INPUT_STYLE}
                      />
                      <span
                        className={`relative h-6 w-11 rounded-full border transition ${
                          isEnabled ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-slate-200"
                        }`}
                        aria-hidden="true"
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                            isEnabled ? "left-[1.25rem]" : "left-0.5"
                          }`}
                        />
                      </span>
                      <span className={`w-7 text-xs font-black ${isEnabled ? "text-emerald-700" : "text-slate-500"}`}>
                        {isEnabled ? "ON" : "OFF"}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => openRealtimeSample(sample)}
                      className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-100"
                    >
                      설정
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {filteredRealtimeSamples.length === 0 ? <p className="mt-4 text-sm text-slate-500">검색된 실시간 정보가 없습니다.</p> : null}
        </section>
      ) : null}

      {!isRealtimeView ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-black text-[#2c2a26]">전문 API</h2>
            <label className="flex min-w-[280px] max-w-md flex-1 items-center gap-2 text-sm font-bold text-slate-700">
              검색
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none"
                placeholder="ID, 이름, 설명으로 검색"
              />
            </label>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-500">
              총 {samples.length}건 중 {displayedSampleCount}건 표시
            </span>
          </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleBusinessCategoryOptions.map((category) => {
            const count = category === "전체목록" ? samples.length : allBusinessCategoryCounts[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => setBusinessCategoryFilter(category)}
                className={`rounded-md border border-slate-300 px-3 py-1.5 text-xs font-black transition ${
                  businessCategoryFilter === category ? "bg-[#2c2a26] text-white" : "text-[#2c2a26] hover:bg-slate-50"
                }`}
              >
                {category} ({count})
              </button>
            );
          })}
        </div>
        <div className="mt-3 max-h-[420px] overflow-y-auto pr-1">
          {displayedCategorizedSamples.map(([category, items]) => (
            <section key={category} className="mb-5">
              <h3 className="text-sm font-black text-slate-700">
                {category} ({items.length})
              </h3>
              {items.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">{category} 전문이 없습니다.</p>
              ) : (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {items.map((sample) => {
                    const sampleIsWebSocket = isWebSocketSample(sample);
                    return (
                      <article key={sample.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="mt-1 font-bold text-slate-700">
                              {sample.label}
                              {sampleIsWebSocket ? (
                                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-black text-blue-700">
                                  WEBSOCKET
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => (sampleIsWebSocket ? openRealtimeSample(sample) : openSampleInEditor(sample))}
                              disabled={isRunning}
                              className="rounded-md bg-[#2c2a26] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#3b352c] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isRunning ? "불러오는 중..." : sampleIsWebSocket ? "실시간 연결" : "전문 전송"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
          {displayedSampleCount === 0 ? <p className="text-sm text-slate-500">조건에 맞는 전문이 없습니다.</p> : null}
        </div>
      </section>
      ) : null}

      {isSampleEditorOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeSampleEditor();
            }
          }}
        >
          <section className="flex max-h-[min(92vh,860px)] w-full max-w-[96rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[#2c2a26]">
                  요청 전문 수정
                </h2>
                <p className="mt-1 text-xs text-slate-500">{selectedSampleLabel}</p>
              </div>
              <button
                type="button"
                onClick={closeSampleEditor}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-black"
              >
                닫기
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_440px]">
              <div className="min-h-0 overflow-y-auto pr-1 pb-3">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm font-black text-slate-700">
                  API 기본 URL
                  <input
                    value={editorBaseUrl}
                    onChange={(event) => setEditorBaseUrl(event.target.value)}
                    placeholder="https://api.example.com"
                    className="rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-[#fcb514]"
                  />
                </label>
                <label className="grid gap-1 text-sm font-black text-slate-700">
                  메서드
                  <select
                    value={editorMethod}
                    onChange={(event) => setEditorMethod(ensureMethod(event.target.value))}
                    className="rounded-md border border-slate-200 px-3 py-2"
                  >
                    {METHOD_OPTIONS.map((methodOption) => (
                      <option key={methodOption} value={methodOption}>
                        {methodOption}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-black text-slate-700">
                  엔드포인트 경로
                  <input
                    value={editorPath}
                    onChange={(event) => setEditorPath(event.target.value)}
                    className="rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none"
                    placeholder="/api/health"
                  />
                </label>
              </div>

              <label className="mt-4 grid gap-1 text-sm font-black text-slate-700">
                헤더 (JSON)
                <textarea
                  value={editorHeadersText}
                  onChange={(event) => setEditorHeadersText(event.target.value)}
                  rows={4}
                  className="rounded-md border border-slate-200 px-3 py-2 font-mono text-sm outline-none"
                />
              </label>

              {isEditorBodyMethod(editorMethod) ? (
                <label className="mt-4 grid gap-1 text-sm font-black text-slate-700">
                  바디 (JSON)
                  <RequiredJsonBodyEditor
                    value={editorBodyText}
                    onChange={setEditorBodyText}
                    rows={10}
                  />
                </label>
              ) : null}

              <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-700">요청 이력</h3>
                  <button
                    type="button"
                    onClick={clearHistory}
                    disabled={!selectedSampleId || selectedSampleHistory.length === 0}
                    className="rounded-md border border-slate-200 px-3 py-1 text-xs font-black hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    이력 삭제
                  </button>
                </div>
                {selectedSampleHistory.length === 0 ? (
                  <p className="text-xs text-slate-500">이 API의 요청 이력이 아직 없습니다.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedSampleHistory.map((item) => (
                      <li key={item.id} className="rounded-md border border-slate-100 bg-white p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-700">{item.executedAt}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-black ${
                              item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {item.method} {item.requestUrl}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-500">소요시간: {item.elapsedMs}ms</p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedHistoryResultId(item.id);
                              setIsResultHistoryOpen(true);
                            }}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-black hover:bg-slate-50"
                          >
                            결과 보기
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              </div>

              <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                <SampleSpecPanel sample={selectedSample} />
              </aside>
            </div>

            <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={closeSampleEditor}
                className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black"
              >
                취소
              </button>
              <button
                type="button"
                onClick={sendEditedSample}
                disabled={isRunning}
                className="rounded-md bg-[#2c2a26] px-3 py-2 text-xs font-black text-white transition hover:bg-[#3b352c] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRunning ? "전송 중..." : "전문 전송"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isRealtimeEditorOpen && selectedRealtimeSample ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeRealtimeEditor();
            }
          }}
        >
          <section className="flex max-h-[min(92vh,860px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[#2c2a26]">실시간 구독 설정</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedRealtimeSample.label}</p>
              </div>
              <button
                type="button"
                onClick={closeRealtimeEditor}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-black"
              >
                닫기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 pb-3">
              <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                <label className="grid gap-1 text-sm font-black text-slate-700">
                  WebSocket URL
                  <input
                    value={realtimeUrl}
                    readOnly
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 outline-none"
                  />
                </label>
                <div className="grid gap-1 text-sm font-black text-slate-700">
                  구독 상태
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-black ${
                        selectedRealtimeSubscriptionStatus.includes("오류")
                          ? "bg-red-100 text-red-700"
                          : selectedRealtimeEnabled
                          ? "bg-emerald-100 text-emerald-700"
                          : selectedRealtimeSubscriptionStatus.includes("확인") || selectedRealtimeSubscriptionStatus.includes("재시도")
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {selectedRealtimeSubscriptionStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-black ${
                        selectedRealtimeReceiveStatus.includes("오류")
                          ? "bg-red-100 text-red-700"
                          : selectedRealtimeReceiveStatus === "수신 중"
                          ? "bg-blue-100 text-blue-700"
                          : selectedRealtimeReceiveStatus === "수신 대기" || selectedRealtimeReceiveStatus === "수신됨"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {selectedRealtimeReceiveStatus}
                    </span>
                  </div>
                </div>
              </div>

              <label className="mt-4 grid gap-1 text-sm font-black text-slate-700">
                구독 메시지 (현재 설정)
                <textarea
                  value={realtimeMessageText}
                  readOnly
                  rows={13}
                  className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 outline-none"
                />
              </label>

              <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-slate-700">수신 데이터</h3>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                    최근 {selectedRealtimeReceiveMessages.length}건
                  </span>
                </div>
                {selectedRealtimeReceiveMessages.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white">
                    <ul className="divide-y divide-slate-100">
                      {selectedRealtimeReceiveMessages.map((message, index) => (
                        <li key={`${message}-${index}`} className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
                          {message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                    수신 데이터가 아직 없습니다.
                  </p>
                )}
              </section>
            </div>

            <div className="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => (selectedRealtimeEnabled ? turnOffRealtimeSample(selectedRealtimeSample) : turnOnRealtimeSample(selectedRealtimeSample))}
                className={`rounded-md px-3 py-2 text-xs font-black transition ${
                  selectedRealtimeEnabled
                    ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    : "bg-[#2c2a26] text-white hover:bg-[#3b352c]"
                }`}
              >
                {selectedRealtimeEnabled ? "구독 OFF" : "구독 ON"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isResultHistoryOpen && selectedHistoryResult ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 px-4 py-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsResultHistoryOpen(false);
            }
          }}
        >
          <section className="flex max-h-[min(90vh,820px)] w-full max-w-[100rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-[#2c2a26]">전문 전송 결과</h2>
                <p className="mt-1 text-xs text-slate-500">{selectedSampleLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsResultHistoryOpen(false)}
                className="rounded-md border border-slate-200 px-3 py-1 text-xs font-black"
              >
                닫기
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_440px]">
              <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-black text-slate-700">전송 이력</h3>
                  <button
                    type="button"
                    onClick={deleteSelectedHistory}
                    disabled={selectedHistoryDeleteIds.length === 0}
                    className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-black text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    선택 삭제 ({selectedHistoryDeleteIds.length})
                  </button>
                </div>
                <label className="mt-3 grid gap-1 text-xs font-black text-slate-700">
                  결과내역 검색
                  <input
                    value={historySearchTerm}
                    onChange={(event) => setHistorySearchTerm(event.target.value)}
                    placeholder="URL, 상태, 요청/응답 전문 검색"
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#fcb514]"
                  />
                </label>
                {selectedSampleHistory.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleHistoryForDelete}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-100"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={clearHistoryDeleteSelection}
                      disabled={selectedHistoryDeleteIds.length === 0}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      선택 해제
                    </button>
                  </div>
                ) : null}
                {selectedSampleHistory.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">표시할 결과 이력이 없습니다.</p>
                ) : filteredSelectedSampleHistory.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">검색 조건에 맞는 결과내역이 없습니다.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {filteredSelectedSampleHistory.map((item) => (
                      <li key={item.id}>
                        <div
                          className={`w-full rounded-md border p-2 text-left transition ${
                            selectedHistoryResult.id === item.id
                              ? "border-[#2c2a26] bg-white"
                              : "border-slate-200 bg-white hover:bg-slate-100"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={selectedHistoryDeleteIds.includes(item.id)}
                              onChange={() => toggleHistoryDeleteSelection(item.id)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                              style={CHECKBOX_INPUT_STYLE}
                              aria-label={`${item.executedAt} 결과내역 선택`}
                            />
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryResultId(item.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-700">{item.executedAt}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-black ${
                                    item.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {item.status}
                                </span>
                              </div>
                              <p className="mt-1 truncate font-mono text-xs text-slate-500">{item.method}</p>
                              <p className="mt-1 text-xs text-slate-500">{item.elapsedMs}ms</p>
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>

              <article className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-slate-800">선택 결과</h3>
                    <p className="mt-1 break-all font-mono text-xs text-slate-500">
                      {selectedHistoryResult.method} {selectedHistoryResult.requestUrl}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-black ${
                      selectedHistoryResult.ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    상태 {selectedHistoryResult.status} / {selectedHistoryResult.ok ? "성공" : "실패"} / {selectedHistoryResult.elapsedMs}ms
                  </span>
                </div>

                {selectedHistoryResult.headers ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs font-black text-slate-700">응답 헤더</summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs">
                      {selectedHistoryResult.headers}
                    </pre>
                  </details>
                ) : null}

                <h4 className="mt-4 text-xs font-black text-slate-700">응답 본문</h4>
                <pre className="mt-2 max-h-[520px] overflow-auto rounded-md bg-slate-50 p-3 text-xs">
                  {prettyJson(selectedHistoryResult.body ?? "")}
                </pre>

                <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-slate-700">전송 전문 수정</h4>
                    <button
                      type="button"
                      onClick={async () => {
                        await runRequestWithValues({
                          targetMethod: historyReplayMethod,
                          targetBaseUrl: historyReplayBaseUrl,
                          targetPath: historyReplayPath,
                          targetHeadersText: historyReplayHeadersText,
                          targetQueryText: "{}",
                          targetBodyText: historyReplayBodyText,
                          historySampleId: selectedHistoryResult.sampleId,
                          historySampleLabel: selectedHistoryResult.sampleLabel || selectedHistoryResult.sampleId,
                        });
                      }}
                      disabled={isRunning}
                      className="rounded-md bg-[#2c2a26] px-3 py-1.5 text-xs font-black text-white transition hover:bg-[#3b352c] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRunning ? "전송 중..." : "수정 전문 전송"}
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1 text-xs font-black text-slate-700">
                      API 기본 URL
                      <input
                        value={historyReplayBaseUrl}
                        onChange={(event) => setHistoryReplayBaseUrl(event.target.value)}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-black text-slate-700">
                      메서드
                      <select
                        value={historyReplayMethod}
                        onChange={(event) => setHistoryReplayMethod(ensureMethod(event.target.value))}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        {METHOD_OPTIONS.map((methodOption) => (
                          <option key={methodOption} value={methodOption}>
                            {methodOption}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-black text-slate-700 md:col-span-2">
                      엔드포인트 경로
                      <input
                        value={historyReplayPath}
                        onChange={(event) => setHistoryReplayPath(event.target.value)}
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none"
                      />
                    </label>
                  </div>
                  <label className="mt-3 grid gap-1 text-xs font-black text-slate-700">
                    전송 헤더 (JSON)
                    <textarea
                      value={historyReplayHeadersText}
                      onChange={(event) => setHistoryReplayHeadersText(event.target.value)}
                      rows={4}
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none"
                    />
                  </label>
                  {isBodyMethod(historyReplayMethod) ? (
                    <label className="mt-3 grid gap-1 text-xs font-black text-slate-700">
                      전송 바디 (JSON)
                      <RequiredJsonBodyEditor
                        value={historyReplayBodyText}
                        onChange={setHistoryReplayBodyText}
                        rows={12}
                        textClassName="text-xs"
                      />
                    </label>
                  ) : null}
                </section>
              </article>
              <aside className="min-h-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                <SampleSpecPanel sample={selectedHistorySample} />
              </aside>
            </div>
          </section>
        </div>
      ) : null}

      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">오류: {error}</p> : null}

      {result && !latestResultIsSampleTest ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-[#2c2a26]">응답 결과</h2>
          <p
            className={`mt-2 rounded-md border px-3 py-2 text-xs font-black ${
              result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            상태 {result.status} / {result.ok ? "성공" : "실패"} / {result.elapsedMs}ms
          </p>
          {result.headers ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-black text-slate-700">응답 헤더</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-slate-50 p-2 text-xs">{result.headers}</pre>
            </details>
          ) : null}
          <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-50 p-3 text-xs">{resultText || result.body}</pre>
        </section>
      ) : null}
    </main>
  );
}
