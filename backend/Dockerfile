FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# Parquet snapshot and precomputed JSON are baked in; refresh with
# `python -m app.pipeline && python -m app.precompute`.
COPY data ./data
# Docker runs the live pandas path; Vercel serves the precomputed JSON.
ENV WINDBOOK_LIVE=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
