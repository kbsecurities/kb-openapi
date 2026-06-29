"""KB OpenAPI production test FastAPI backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import config, openapi_test
from backend.settings import get_runtime_settings


settings = get_runtime_settings()

app = FastAPI(
    title="KB OpenAPI Production",
    description="KB OpenAPI production backend",
    version="1.0.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials="*" not in settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(openapi_test.router, prefix="/api/openapi-test", tags=["openapi-test"])


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "mode": settings.mode}


@app.get("/")
async def root():
    return {
        "message": "KB OpenAPI Production API",
        "mode": settings.mode,
        "docs": "/docs" if settings.docs_enabled else None,
    }


if __name__ == "__main__":
    import uvicorn

    print("=" * 50)
    print(" KB OpenAPI Production server starting")
    print("=" * 50)
    print(f" Mode: {settings.mode}")
    print(f" URL: http://localhost:{settings.port}")
    print("=" * 50)

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
