"use client";

import { useEffect, useMemo, useState } from "react";
import kbCatalog from "./samples.generated.json";
import OpenApiTestClient, {
  type OpenApiFieldSpec,
  type OpenApiSample,
  type OpenApiTokenProcedure,
} from "@/components/openapi/OpenApiTestClient";

const FALLBACK_BASE_URL =
  process.env.NEXT_PUBLIC_OPENAPI_TEST_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8020";
const RUNTIME_MODE = "production";
const DEFAULT_ENVIRONMENT: Required<RuntimeEnvironmentConfig> = {
  kbBaseUrl: process.env.NEXT_PUBLIC_OPENAPI_PROD_KB_B2C_BASE_URL || "https://developer.kbsec.com:32484",
  kbB2cTokenBaseUrl: process.env.NEXT_PUBLIC_OPENAPI_PROD_KB_B2C_TOKEN_BASE_URL || "https://developer.kbsec.com:32484",
};

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RuntimeMode = "production";

type CatalogSample = {
  id: string;
  label: string;
  method: ApiMethod;
  endpoint?: string;
  path?: string;
  transactionCode?: string;
  businessCategory?: OpenApiSample["businessCategory"];
  description: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  inputSpec?: OpenApiFieldSpec[];
  outputSpec?: OpenApiFieldSpec[];
};

type KbCatalog = {
  b2c?: CatalogSample[];
};

type RuntimeEnvironmentConfig = {
  kbBaseUrl?: string;
  kbB2cTokenBaseUrl?: string;
};

type RuntimeConfig = {
  mode?: string;
  environment?: RuntimeEnvironmentConfig;
  environments?: Partial<Record<RuntimeMode, RuntimeEnvironmentConfig>>;
};

function environmentForConfig(config: RuntimeConfig | null): Required<RuntimeEnvironmentConfig> {
  const active = config?.environment ?? {};
  const production = config?.environments?.production ?? {};
  return {
    kbBaseUrl: active.kbBaseUrl || production.kbBaseUrl || DEFAULT_ENVIRONMENT.kbBaseUrl || FALLBACK_BASE_URL,
    kbB2cTokenBaseUrl:
      active.kbB2cTokenBaseUrl ||
      production.kbB2cTokenBaseUrl ||
      DEFAULT_ENVIRONMENT.kbB2cTokenBaseUrl ||
      FALLBACK_BASE_URL,
  };
}

function toKbServicePath(entry: CatalogSample) {
  return entry.path || entry.endpoint || "";
}

function toOpenApiSample(entry: CatalogSample, baseUrl: string): OpenApiSample {
  return {
    id: entry.id,
    label: entry.label.replace(/\.xml$/i, ""),
    method: entry.method,
    path: toKbServicePath(entry),
    description: entry.description.replace(/^B2C\s+/i, ""),
    businessCategory: entry.businessCategory,
    headers: {
      "Content-Type": "application/json",
      appKey: "{{clientId}}",
      Authorization: "bearer {{access_token}}",
      ...(entry.headers ?? {}),
    },
    query: entry.query,
    body: entry.body,
    baseUrl,
    source: "trx-rule",
    inputSpec: entry.inputSpec,
    outputSpec: entry.outputSpec,
  };
}

function tokenProcedure(tokenBaseUrl: string): OpenApiTokenProcedure {
  return {
    id: "kb-b2c-token",
    label: "KB OAuth2 토큰 발급",
    mode: "B2C",
    environment: tokenBaseUrl,
    steps: [
      `1) POST ${tokenBaseUrl}/oauth2/token 으로 access_token을 발급합니다.`,
      "2) 발급된 access_token을 API 요청의 Authorization 헤더에 사용합니다.",
    ],
    recommendedHeaders: [
      "Authorization: bearer <access_token>",
      "Content-Type: application/json",
    ],
  };
}

export default function OpenApiTestPage() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);

  useEffect(() => {
    let isCancelled = false;
    fetch("/api/config/runtime")
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (!isCancelled && config && typeof config === "object") {
          setRuntimeConfig(config as RuntimeConfig);
        }
      })
      .catch(() => {
        if (!isCancelled) setRuntimeConfig(null);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const activeEnvironment = useMemo(() => environmentForConfig(runtimeConfig), [runtimeConfig]);
  const defaultBaseUrl = activeEnvironment.kbBaseUrl || FALLBACK_BASE_URL;
  const samples = useMemo(
    () => ((kbCatalog as KbCatalog).b2c ?? []).map((entry) => toOpenApiSample(entry, defaultBaseUrl)),
    [defaultBaseUrl],
  );
  const tokenProcedures = useMemo(
    () => [tokenProcedure(activeEnvironment.kbB2cTokenBaseUrl)],
    [activeEnvironment.kbB2cTokenBaseUrl],
  );

  return (
    <OpenApiTestClient
      headerContent={
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-[#fcb514] pb-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[#fcb514] text-lg font-black text-[#2c2a26]">
              KB
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-[#8a6400]">KB OpenAPI</p>
              <h1 className="text-2xl font-black tracking-normal text-[#2c2a26]">KB OpenAPI</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">KB증권 OpenAPI 연동 확인</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-[#fff4cc] px-3 py-1 text-[#7a5500]">{samples.length}건</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">production</span>
          </div>
        </div>
      }
      runtimeMode={RUNTIME_MODE}
      samples={samples}
      historyStorageKey="kb.openapi.b2c.production.history"
      defaultBaseUrl={defaultBaseUrl}
      broker="Tkb"
      credentialStorageKey="kb.openapi.b2c.production.credentials"
      tokenProcedures={tokenProcedures}
    />
  );
}
