# MSSQL to PostgreSQL DB Converter

A premium, AI-powered migration tool designed to help developers migrate database logic (functions and procedures) from MSSQL to PostgreSQL with ease.

## Features
- **Interactive Migration**: Select and convert functions/procedures one by one.
- **AI-Powered Translation**: Uses Gemini AI (configurable via .env) to accurately translate T-SQL to PL/pgSQL.
- **Side-by-Side Review**: Compare original and converted code before deployment.
- **Direct Deployment**: Execute converted SQL directly on the target PostgreSQL instance.
- **Premium UI**: Built with React and Ant Design, featuring a sleek dark-mode glassmorphism design.

# Procly — MSSQL to PostgreSQL DB Converter

Procly is an AI-assisted tool to help migrate database logic (stored procedures and functions) from Microsoft SQL Server (T-SQL) to PostgreSQL (PL/pgSQL). It pairs a Go/Fiber backend with a React + Vite frontend using Ant Design for UI.

## Key Features
- Interactive, per-routine conversion and review flow
- AI-powered translation (Gemini) with a customizable system prompt
- Schema creation and one-off data migration helpers
- Side-by-side review and direct deployment to Postgres
- Local vault for DB connection history (encrypted, optional WebAuthn/PIN)

## Prerequisites
- Go 1.20+ (backend)
- Node.js 20+ (frontend)

## Running Locally

Run the backend:

```bash
cd backend
go run main.go
```

Run the frontend:

```bash
cd frontend
npm install
npm run dev
```

By default the backend listens on `PORT` (see Environment section). The frontend expects the backend at `http://localhost:5000/api` by default.

## Environment Variables

The server reads configuration from environment variables. Typical values used in development are shown below (no real secrets should be committed):

- `PORT` — port the backend listens on (default 5000)
- `GEMINI_MODEL` — LLM model id (e.g. `gemini-2.5-flash`)
- `CONVERSION_SYSTEM_PROMPT` — system prompt used to instruct the model for conversions
- `GEMINI_API_KEY` (optional) — server-side fallback key if not provided per-request

Note: This repository previously included a `backend/.env.example` file. That example has been removed to avoid duplication with the root environment guidance — keep local secrets in a root `.env` (and add `.env` to `.gitignore` in your deployments).

## BYOK (Bring Your Own Key) — how Procly handles Gemini keys

Procly supports BYOK so contributors and users can use their own Gemini API keys securely:

- Frontend BYOK (default UX): Users set their Gemini key in the UI. The key is stored in the browser `localStorage` under `gemini_api_key` and used to call the backend conversion endpoint. The frontend sends the key in the `X-Gemini-Key` header for conversion requests.
- Server-side fallback: If `X-Gemini-Key` is not provided, the backend will fall back to `GEMINI_API_KEY` from the environment.

Security considerations and recommendations:

- The current implementation proxies user keys through your server for convenience. That means the server handles the key for the duration of the request — do not log headers or persist user keys.
- If you want to avoid user keys touching the server entirely, you must call the LLM directly from the browser (may not be feasible with some providers) or implement ephemeral tokens.
- Use HTTPS in production and document the BYOK tradeoffs clearly in the UI and `CONTRIBUTING.md` so contributors understand the model key flow.

## What this repo provides (summary)

- `backend/` — Go/Fiber API exposing endpoints for checking DB connections, listing routines/tables, schema creation, data migration, AI-driven conversion, and execution of SQL on Postgres.
- `frontend/` — React + Vite application with Ant Design components, Monaco editor integration, and a local encrypted vault for DB credentials.
- `README.md` — this file (updated to explain BYOK and contribution guidance).

## Contributing (open source guidelines)

We welcome contributions. Suggested steps for contributors:

1. Fork the repo and create a feature branch.
2. Run the backend and frontend locally (see Running Locally).
3. Ensure no API keys or secrets are committed. Use your own `GEMINI_API_KEY` locally if needed.
4. Follow Ant Design patterns for UI changes and keep components accessible and themable.
5. Create a clear PR description, reference related issues, and use the provided PR template.

Checklist for contributors (keep in mind when opening PRs):

- Tested locally (backend & frontend flows related to the change).
- No API keys or secrets in code, commit messages, or screenshots.
- UI changes follow Ant Design conventions and include screenshots where relevant.
- Add/update docs when introducing new env vars or runtime behavior.

Maintainers will review PRs for correctness and security (especially around key handling).

## Security & Privacy

- Never commit real API keys. Use `.env` locally and add it to `.gitignore`.
- The frontend stores user Gemini keys in `localStorage` for BYOK; document this clearly so users understand where their keys live.

## Next steps we recommend (maintainers)

- Keep `backend/.env.example` removed to avoid duplicate, stale docs, or reintroduce a single authoritative example at repo root if preferred.
- Consider adding a `CONTRIBUTING.md` with explicit setup, testing, and reviewer expectations (I can add this for you).

---
If you want, I can now add a `CONTRIBUTING.md` with a BYOK section and step-by-step developer onboarding. Or I can add `.env` to `.gitignore` for you. Which would you like next?
