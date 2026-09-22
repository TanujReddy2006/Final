# LearnForge Deployment Guide: Vercel & Render

This guide provides step-by-step instructions to deploy your LearnForge application with the **frontend on Vercel** and the **backend on Render**.

---

## Architecture Overview

- **Frontend (Vercel)**: React + Vite Single Page Application with client-side routing rewrites (`vercel.json`).
- **Backend (Render)**: Node.js / Express REST API with automated self-healing PDF generation, dynamic CORS for Vercel, and health check probes (`/healthz`).

---

## Step 1: Push Code to GitHub

Both Vercel and Render deploy directly from a Git repository.

1. Open your terminal in the project root (`d:\FInal Year`):
   ```bash
   git init
   git add .
   git commit -m "feat: configure deployment for Vercel and Render"
   ```

2. Create a new repository on [GitHub](https://github.com/new) (e.g. `learnforge-platform`).

3. Link and push your code:
   ```bash
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```

---

## Step 2: Deploy Backend on Render

1. Go to [Render Dashboard](https://dashboard.render.com/) and sign in.
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository (`learnforge-platform`).
4. Configure the Web Service settings:
   - **Name**: `learnforge-api` (or any name you prefer)
   - **Region**: Choose the region closest to you
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan Type**: `Free`

5. Click **Advanced** and configure **Environment Variables**:
   | Key | Value | Description |
   | --- | --- | --- |
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `10000` | Standard Render port |
   | `JWT_SECRET` | `your-secure-random-32-char-string` | Secret used to sign authentication tokens |
   | `FRONTEND_URL` | `https://*.vercel.app` *(update after Step 3)* | Allowed CORS origin |
   | `PUBLIC_BASE_URL` | `https://*.vercel.app` *(update after Step 3)* | Used for certificate QR codes |

6. Click **Create Web Service**.
7. Wait for deployment to finish. Once live, copy your Render service URL (e.g., `https://learnforge-api.onrender.com`).
8. You can verify backend health by visiting `https://learnforge-api.onrender.com/healthz` in your browser (should return `{"success": true, "data": {"status": "ok"}}`).

---

## Step 3: Deploy Frontend on Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard) and sign in.
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository (`learnforge-platform`).
4. In the configuration screen:
   - **Project Name**: `learnforge-web` (or any name)
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click **Edit** and select **`frontend`**
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
   - **Install Command**: `npm install` (default)

5. Expand the **Environment Variables** section and add:
   | Key | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://learnforge-api.onrender.com/api/v1` |
   *(Replace with your actual Render URL from Step 2)*

6. Click **Deploy**.
7. Vercel will build and deploy your frontend in ~1 minute.
8. Once deployed, copy your Vercel URL (e.g., `https://learnforge-web.vercel.app`).

---

## Step 4: Link Vercel URL back to Render

To ensure QR codes on certificates point directly to your live Vercel domain and CORS headers are strictly matched:

1. Return to your [Render Dashboard](https://dashboard.render.com/).
2. Select your `learnforge-api` service.
3. Go to **Environment**.
4. Update these two variables:
   - `FRONTEND_URL`: `https://learnforge-web.vercel.app`
   - `PUBLIC_BASE_URL`: `https://learnforge-web.vercel.app`
5. Click **Save Changes**. Render will automatically redeploy with the updated URLs.

---

## Step 5: (Optional) Persistent PostgreSQL on Render

On Render's free tier, the web service spins down after 15 minutes of inactivity and local container storage is ephemeral. The backend operates seamlessly in in-memory mode, but if you want full persistent data across container restarts:

1. In Render Dashboard, click **New +** -> **PostgreSQL**.
2. Name it (e.g., `learnforge-db`) and select **Free** plan.
3. Click **Create Database**.
4. Copy the **Internal Database URL** (or External Database URL).
5. Open your `learnforge-api` Web Service -> **Environment**.
6. Add environment variable:
   - `DATABASE_URL`: `<your-copied-database-url>`
7. Save changes. LearnForge will automatically initialize the 10 relational PostgreSQL tables (`companies`, `users`, `courses`, `enrollments`, `assessments`, `attempts`, `certificates`, `verifications`, `audit_logs`, `notifications`) and persist all records with standard relational foreign keys and indices!

---

## Summary Checklist

- [x] Frontend SPA routing rewrites enabled via `frontend/vercel.json`
- [x] Backend CORS configured for all `*.vercel.app` and custom domains
- [x] Self-healing certificate PDF generator enabled on ephemeral disks
- [x] Cloud PostgreSQL SSL connection enabled
- [x] Health check probes responding on `/healthz` and `/api/v1/health`
