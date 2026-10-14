# ResearchAI

A local-first website research assistant. Flask serves the interface and API; Ollama generates embeddings and answers, ChromaDB stores vectors, and SQLite stores source/session metadata. No external LLM API key is required.

## Requirements

- Windows 10/11, Python 3.10+, and Ollama.
- Ollama running locally with `qwen2.5:latest` and/or `llama3.2:latest`.
- `nomic-embed-text` in Ollama for indexing and retrieval.

The app uses your installed Llama 3.2 model by default. Qwen 2.5 is selectable in the sidebar.

## Run on Windows

In Command Prompt, from the project folder:

```bat
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
ollama list
```

Check the installed embedding model and pull it only if it is missing:

```bat
ollama list
ollama pull nomic-embed-text
```

The default Ollama endpoint is `http://localhost:11434`. Optional environment settings:

```bat
set OLLAMA_URL=http://localhost:11434
set OLLAMA_MODEL=llama3.2:latest
set OLLAMA_EMBED_MODEL=nomic-embed-text
```

Start the app and open `http://127.0.0.1:5000`:

```bat
python app.py
```

Add a public documentation URL, wait for indexing, then ask a question. Indexed vectors and research sessions persist under `data\`. Set `RESEARCHAI_DATA_DIR` to store them elsewhere.

## API

- `GET /api/health`, `GET /api/models`
- `GET|POST /api/sources`, `DELETE /api/sources/<id>`
- `POST /api/chat` with `question`, optional `model`, `session_id`, and `source_ids`
- `GET|POST /api/sessions`, `GET|DELETE /api/sessions/<id>`

Chat request example:

```json
{
  "question": "What is Flask?",
  "model": "qwen2.5:latest",
  "source_ids": []
}
```

## Safety and known limitations

The server accepts only public HTTP(S) pages, rejects private/reserved destinations, rechecks redirect targets, caps fetches to 2 MB, and accepts HTML only. JavaScript-rendered pages may not expose readable content. The app is intended for personal/controlled use; do not expose it to untrusted networks without additional authentication and hardening. Answers can be wrong: verify claims using the returned source passages. Ollama must be available locally, and the embedding model must be installed separately.
