# Contributing to Procly

Thank you for your interest in contributing to Procly — this document explains how to get started, the BYOK (Bring Your Own Key) expectations, and the project's contribution workflow.

## Getting Started

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`.
2. Run the backend and frontend locally (see below). Make small, focused changes and include tests where appropriate.
3. Commit with clear messages and open a pull request against `main` that references related issues.

## Running Locally

- Backend:

```bash
cd backend
go run main.go
```

- Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:5000/api` by default.

## Environment & Secrets

- Keep any real API keys or database credentials out of commits. Use a local `.env` file and add it to `.gitignore`.
- The server reads environment variables such as `PORT`, `GEMINI_MODEL`, and `CONVERSION_SYSTEM_PROMPT`. `GEMINI_API_KEY` is optional as a server-side fallback.

## BYOK (Bring Your Own Key)

Procly supports BYOK for the Gemini API:

- UX: Users can set their Gemini API key in the frontend UI which stores it in `localStorage` under `gemini_api_key`.
- Flow: When converting code, the frontend includes the key in the `X-Gemini-Key` request header. The backend will prefer this header over any server-side `GEMINI_API_KEY` env var.

Security expectations for contributors:

- Do not log headers containing the `X-Gemini-Key` or persist user API keys on the server.
- Make BYOK tradeoffs explicit in the UI and docs when adding or changing features that touch keys.
- If you implement server-side key handling, prefer ephemeral tokens or secrets managers in production.

## Pull Request Checklist

- [ ] I tested my change locally (backend and/or frontend).
- [ ] I did not add any API keys, secrets, or credentials in code or screenshots.
- [ ] UI changes follow Ant Design patterns and are themable and accessible.
- [ ] I updated documentation for any new env vars or runtime behavior.

Use the repository PR template when opening a PR; maintainers will review for correctness and security.

## Code Style & Tests

- Go: run `gofmt` and `go vet` before committing. Keep `go.mod` tidy.
- Frontend: run `npm run lint` and follow project ESLint rules.
- Add unit or integration tests for non-trivial logic when possible.

## Security & Reporting Vulnerabilities

- Never commit real API keys. If you find a security vulnerability, do not disclose it in an issue — contact a maintainer directly or open a private security report as described in the project's `SECURITY.md` (if present).

## Questions

If you're unsure about API key handling, UX choices, or security implications, open a discussion or contact a maintainer before implementing large changes.

Thanks — we appreciate your contributions!
