from fastapi import FastAPI

app = FastAPI(title="ThermalWatch", version="0.1.0")


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "service": "thermalwatch-backend"}


@app.get("/")
def root() -> dict:
    return {"message": "ThermalWatch backend is running."}
