# Build and bundle all browser assets for both Render and the Android APK.
FROM node:24-alpine AS web

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:web

# MathVision PRO — FastAPI backend + self-contained static frontend.
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY --from=web /src/www/ www/
WORKDIR /app/backend

# Host (Render/HF/Cloud Run) truyền $PORT; mặc định 7860 cho HF Spaces.
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
