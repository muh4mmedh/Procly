# MSSQL to PostgreSQL DB Converter

A premium, AI-powered migration tool designed to help developers migrate database logic (functions and procedures) from MSSQL to PostgreSQL with ease.

## Features
- **Interactive Migration**: Select and convert functions/procedures one by one.
- **AI-Powered Translation**: Uses Gemini AI (configurable via .env) to accurately translate T-SQL to PL/pgSQL.
- **Side-by-Side Review**: Compare original and converted code before deployment.
- **Direct Deployment**: Execute converted SQL directly on the target PostgreSQL instance.
- **Premium UI**: Built with React and Ant Design, featuring a sleek dark-mode glassmorphism design.

## Prerequisites
- **Go** (1.20+)
- **Node.js** (v20+)
- **Gemini API Key** (Get it from [Google AI Studio](https://aistudio.google.com/))
- **Gemini API Key** (Set via the frontend UI; stored in browser localStorage — get one from [Google AI Studio](https://aistudio.google.com/))

## Getting Started

### 1. Gemini API Key
The frontend provides a simple control in the top bar to save your Gemini API key to your browser's `localStorage`. Click the `?` help button next to the key control for a direct link to Google AI Studio where you can obtain a (free) API key.

If you prefer to run the backend with an environment variable, you may still set `GEMINI_API_KEY` in your environment — the server will accept a key from either the `X-Gemini-Key` request header (preferred for per-user keys) or from `GEMINI_API_KEY`.

### 2. Run Backend
```bash
cd backend
go run main.go
```
The backend will start on `http://localhost:5000`.

### 3. Run Frontend
```bash
cd frontend
npm run dev
```
The frontend will start on the Vite default port (usually `http://localhost:5173`).

## Technology Stack
- **Frontend**: React, Ant Design, Axios
- **Backend**: Go (Fiber), MSSQL & Postgres Drivers, Gemini AI SDK
- **Styling**: Vanilla CSS with Ant Design Theme Personalization
