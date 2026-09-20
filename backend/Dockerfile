# ForgeAI backend — production image
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /srv

# Install dependencies first (better layer caching)
COPY requirements.txt .
RUN pip install -r requirements.txt

# App code + migrations
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY scripts ./scripts

# Non-root user; uploads dir writable
RUN useradd --create-home appuser \
    && mkdir -p /srv/uploads/photos /srv/uploads/videos \
    && chown -R appuser:appuser /srv
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status == 200 else 1)"

# Migrations run via docker-compose command (or manually: alembic upgrade head)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
