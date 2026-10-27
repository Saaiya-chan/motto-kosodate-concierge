FROM arc53/docsgpt:1.0.0@sha256:df854d647b08ad2d460f2529e7d63e626c0a1fd745eb6bfafb7d3bfe9efca5ef
USER root
COPY search.py index.faiss index.json /opt/search/
COPY model /opt/search/cache/models--ibm-granite--granite-embedding-311m-multilingual-r2
ENV EMBEDDINGS_NAME=ibm-granite/granite-embedding-311m-multilingual-r2 \
    EMBEDDINGS_CACHE_DIR=/opt/search/cache HF_HUB_CACHE=/opt/search/cache \
    HF_HUB_OFFLINE=1 EMBEDDINGS_THREADS=2 EMBEDDINGS_LOCAL_MAX_TOKENS=2048 \
    EMBEDDINGS_MAX_QUERY_TOKENS=512 EMBEDDINGS_MODEL_BATCH_SIZE=1 \
    EMBEDDINGS_DELEGATE_TO_WORKER=false TRACES_ENABLED=false \
    HOME=/tmp PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=/app
EXPOSE 8080
USER appuser
CMD ["python", "/opt/search/search.py"]
