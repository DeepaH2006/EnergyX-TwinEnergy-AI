# EnergyX 2.0 — Windows local run guide

This export keeps the existing React application and FastAPI backend. The frontend and backend
must run as two local processes. The Vite development server proxies `/api/v1` requests to
`http://127.0.0.1:8000`.

## 1. Start the FastAPI backend (Terminal 1)

From the project root in VS Code:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation, run this once in that terminal:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```
Then activate the environment again.

Backend health check:
`http://127.0.0.1:8000/api/v1/health`

## 2. Start the React frontend (Terminal 2)

Open a second terminal at the project root (not inside `backend`):

```powershell
npm install
npm run dev
```

Open:
`http://localhost:3000`

## 3. If your backend is already running from the separate EnergyX_2.0_backend_foundation folder

Do not create another backend process. Leave that existing backend running on port 8000,
then start only the frontend with `npm run dev` from this project's root folder.

## Notes

- `127.0.0.1` refers to this same computer. This setup is for running the frontend locally in
  VS Code, not inside a cloud-hosted AI Studio preview.
- The sample telemetry in the prototype is synthetic unless you upload a real dataset.
- If the backend uses a different port, set `FASTAPI_PROXY_TARGET` before starting Vite, e.g.:
  `$env:FASTAPI_PROXY_TARGET = "http://127.0.0.1:8001"; npm run dev`
