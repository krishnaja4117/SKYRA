# SKYRA — Phase 16: Docker & Containerization Guide

## 1. Overview
SKYRA is containerized into a multi-service architecture via Docker Compose (`docker-compose.yml`). The stack is designed to run in zero-configuration offline mode or with full cloud integrations when environment variables are supplied.

```
+-------------------------------------------------------------+
|                      Host Machine                           |
|                                                             |
|   Port 3000                 Port 5000            Port 8000  |
|       |                         |                    |      |
+-------|-------------------------|--------------------|------+
        |                         |                    |
+-------v-------------------------v--------------------v------+
|                         Docker Network (skyra-network)      |
|                                                             |
|  +------------------+     +------------------+              |
|  | frontend         |     | backend          |              |
|  | Nginx 1.27       |---->| Node.js 20       |              |
|  | (React 19 / Vite)|     | (Express 5)      |              |
|  +------------------+     +--------+---------+              |
|                                    |                        |
|                                    +--------> +-----------+ |
|                                    |          | ml        | |
|                                    |          | Python 3.11| |
|                                    |          | FastAPI   | |
|                                    |          | FAISS     | |
|                                    |          +-----------+ |
|                                    |                        |
|                                    +--------> +-----------+ |
|                                               | mongo     | |
|                                               | Mongo 7.0 | |
|                                               +-----------+ |
+-------------------------------------------------------------+
```

---

## 2. Docker Services

| Service | Base Image | Internal Port | Host Port | Purpose |
|---|---|---|---|---|
| `frontend` | `node:20-alpine` (build) -> `nginx:1.27-alpine` | `80` | `3000` | Serves Vite production build & reverse-proxies `/api/*` to `backend:5000` |
| `backend` | `node:20-alpine` | `5000` | `5000` | Express 5 API Gateway, Orchestrator, Alert Engine, RAG dispatcher |
| `ml` | `python:3.11-slim` | `8000` | `8000` | FastAPI ML Microservice (Calibrated RF + XGBoost ensemble & FAISS RAG) |
| `mongo` | `mongo:7.0` | `27017` | `27017` | Document database for telemetry & alerts (optional; backend has in-memory fallback) |

---

## 3. Container Networking & Addressing
- All containers communicate over an isolated bridge network: `skyra-network`.
- **Frontend -> Backend:** Nginx proxies `/api/*` to `http://backend:5000/api/`. `VITE_API_URL` is configured empty during build so frontend uses relative URLs, eliminating hardcoded `localhost` issues in production.
- **Backend -> ML:** Backend calls `ML_SERVICE_URL=http://ml:8000` using the internal Docker DNS service name.
- **Backend -> MongoDB:** Backend connects to `MONGODB_URI=mongodb://mongo:27017/skyra`.

---

## 4. Health Checks

| Service | Health Check Command | Interval | Timeout | Retries |
|---|---|---|---|---|
| `ml` | `python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)"` | 20s | 8s | 5 |
| `backend` | `node -e "require('http').get('http://localhost:5000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"` | 15s | 8s | 5 |
| `frontend` | `wget -q --spider http://127.0.0.1:80/` | 10s | 3s | 3 |
| `mongo` | `mongosh --eval "db.adminCommand('ping')"` | 10s | 5s | 5 |

Startup dependencies:
- `backend` waits for `ml` to be `service_healthy` and `mongo` to be `service_started`.
- `frontend` waits for `backend` to be `service_healthy`.

---

## 5. Startup Instructions

### Quickstart (Zero Configuration)
```bash
# Clone & build
docker compose up --build
```

### With Optional Cloud Configurations
```bash
cp .env.example .env
# Edit .env with your credentials (OpenAI, Pinecone, Bhashini, AWS, etc.)
docker compose --env-file .env up --build
```

---

## 6. Fallback Behavior & Offline Capabilities
- **MongoDB:** If MongoDB container fails or is unconfigured, backend automatically operates in in-memory fallback mode.
- **ML Models:** Pre-trained Random Forest and XGBoost pickle files are copied directly into the image; no model training occurs at runtime. Heuristic fallback remains active if inference fails.
- **RAG / Vector Knowledge:** Local FAISS index initializes in memory inside the `ml` container with 22 built-in disaster mitigation procedures. Pinecone remains credential-gated.
- **OpenAI / Bhashini / IMD:** Built-in deterministic mock generators and browser Web Speech APIs ensure complete offline testability.
