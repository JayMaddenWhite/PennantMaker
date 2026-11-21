# Putting Pennant Maker online (pennantmaker.com)

The web app is one small Node server (`server.js`) plus the files in `app/`. It needs a host that
runs Node — a plain static host won't do, because the server fetches team logos and data for the app.
Recommended: **Render** (free HTTPS on your own domain, deploys from GitHub). A `Dockerfile` is
included for any other host (Fly.io, Railway, a VPS).

## 1. Register the domain
At a registrar (Cloudflare Registrar, Porkbun or Namecheap) buy **pennantmaker.com**
(optionally pennantmaker.app too). Availability was checked on 2026-11-21 and can change.

## 2. Put the code on GitHub
1. Create a GitHub account and a new **private** repository, e.g. `pennant-maker`.
2. In this folder:
   ```
   git init
   git add .
   git commit -m "Pennant Maker"
   git branch -M main
   git remote add origin https://github.com/<you>/pennant-maker.git
   git push -u origin main
   ```
   `.gitignore` keeps out `node_modules/`, the built `.exe` (`dist/`) and icon scratch files.

## 3. Deploy on Render
1. Sign up at render.com and connect GitHub.
2. **New → Blueprint**, pick the repo. Render reads `render.yaml` and creates the `pennant-maker`
   web service (build: `npm install --omit=dev`, start: `node server.js`, health check `/healthz`).
3. Wait for "Live", then open the `https://pennant-maker-xxxx.onrender.com` address it gives you.
   - Plan is **free** in `render.yaml`: it sleeps after ~15 minutes idle, so the first visit after a
     break takes ~30–60 s. Switch `plan: starter` (paid, monthly) to keep it awake.
4. Every push to `main` redeploys automatically.

## 4. Point the domain at it
1. Render → your service → **Settings → Custom Domains** → add `pennantmaker.com` and `www.pennantmaker.com`.
2. Render shows the DNS records to create. At your registrar's DNS settings add exactly those, typically:
   - `www` → **CNAME** → `pennant-maker-xxxx.onrender.com`
   - root `@` → **A** record to the IP Render lists (or ALIAS/ANAME/CNAME-flattening to the onrender
     address if your DNS supports it — Cloudflare does).
3. Back in Render click **Verify**. HTTPS certificates are issued automatically (minutes to an hour).
   If you use Cloudflare DNS, set the records to **DNS only** (grey cloud) until the certificate is issued.

## What the server does to stay safe on the open internet
- Data (team lists, league info, logo histories) is only fetched from ESPN, TheSportsDB, Wikimedia
  Commons and Logopedia. Any other site may only return **images**, max 10 MB.
- Requests to private / local network addresses are refused, every redirect is re-checked.
- Only the app's own pages can use the proxy, and each visitor is rate-limited
  (`PROXY_RATE_PER_MIN`, default 240).
- Files starting with `_` in `app/` are never served.

## Before you make it public — logos
On a public site, automatic lookups of NFL/NBA/MLB/NHL/NCAA logos are a trademark risk, and ESPN's
feeds, Logopedia and TheSportsDB's free key aren't licensed for commercial use. Keep the URL private
(or for personal/mockup use) until you decide on a "store-safe" mode or licenses.

## Other hosts (Docker)
```
docker build -t pennant-maker .
docker run -p 8080:8080 pennant-maker
```
The container listens on port 8080 (`PORT` env to change). Fly.io: `fly launch` in this folder uses the Dockerfile.
