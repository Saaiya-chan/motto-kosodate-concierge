FROM arc53/docsgpt:1.0.0
USER root
COPY deployment/docsgpt/start.py /opt/concierge/start.py
COPY deployment/docsgpt/seed.py /opt/concierge/seed.py
COPY data /opt/concierge/data
COPY deployment/docsgpt/google.yaml /opt/concierge/models/google.yaml
ENV MODELS_CONFIG_DIR=/opt/concierge/models EMBEDDINGS_NAME=ibm-granite/granite-embedding-311m-multilingual-r2 EMBEDDINGS_THREADS=2 EMBEDDINGS_LOCAL_MAX_TOKENS=2048 EMBEDDINGS_BATCH_SIZE=8 EMBEDDINGS_MODEL_BATCH_SIZE=1 DOCSGPT_HOME=/data HF_HUB_CACHE=/data/models DOCLING_ARTIFACTS_PATH=/data/models/docling TRACES_ENABLED=false TRACES_CAPTURE_CONTENT=false
# start.py drops root privileges after preparing the mounted volume.
CMD ["python", "/opt/concierge/start.py"]
