# MathVision PRO — image chạy cả backend (FastAPI) + phục vụ frontend tĩnh
FROM python:3.12-slim

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY . .
WORKDIR /app/backend

# Host (Render/HF/Cloud Run) truyền $PORT; mặc định 7860 cho HF Spaces.
ENV PORT=7860
EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
