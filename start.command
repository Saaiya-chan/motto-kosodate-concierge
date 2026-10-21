#!/bin/zsh
cd -- "${0:A:h}"
if ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  echo 'Ollamaを起動しています。'
  ollama serve >/dev/null 2>&1 &
  for attempt in {1..30}; do
    curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 && break
    sleep 1
  done
fi
if curl -fsS http://127.0.0.1:4317/api/status >/dev/null 2>&1; then
  open 'http://127.0.0.1:4317'
else
  (sleep 1; open 'http://127.0.0.1:4317') &
  RURI_PRELOAD=1 node src/server.mjs
fi
