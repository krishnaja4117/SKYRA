# SKYRA ML Microservice — Dockerfile (Phase 16)
# Python 3.11 slim — FastAPI + Uvicorn + scikit-learn + XGBoost + FAISS

FROM python:3.11-slim

WORKDIR /app

# Install minimal system build dependencies for numpy/scikit-learn/faiss-cpu
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy model artifacts (*.pkl) — required at startup
# These are pre-trained; no retraining happens inside Docker
COPY calibrated_risk_model.pkl .
COPY calibrated_xgboost_model.pkl .
COPY risk_model.pkl .
COPY xgboost_model.pkl .

# Copy application source modules
COPY predict_api.py .
COPY vector_knowledge_service.py .
COPY xai_tree_explainer.py .

# Copy dataset (used by build_dataset.py and tests; included for completeness)
COPY data ./data

EXPOSE 8000

ENV PORT=8000

# Start FastAPI via Uvicorn on all interfaces
CMD ["sh", "-c", "uvicorn predict_api:app --host 0.0.0.0 --port ${PORT:-8000}"]
