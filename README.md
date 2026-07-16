# Soundbite

A party game: the Actor gets a secret prompt, records it through a voice
disguise effect, and everyone else guesses what it is from the disguised
audio alone.

- `client/` — React + Vite frontend
- `server/` — Node/Express + Socket.io game server (rooms, timers, scoring all live here; the client is a thin renderer of server state)

## Local development

Requires Node 18+.

```bash
# server
cd server
cp .env.example .env
npm install
npm run dev        # http://localhost:3001

# client (separate terminal)
cd client
cp .env.example .env
npm install
npm run dev         # http://localhost:5173
```

Open `http://localhost:5173` in a few browser tabs (or on other devices on
your LAN, pointing `VITE_SERVER_URL` at your machine's IP) to play with
multiple players.

### Playing solo

A game needs `MIN_PLAYERS` (3) to start. `server/scripts/bots.mjs` joins
fake players into a room so you can test alone:

```bash
cd server
npm run bots -- <ROOM_CODE> [count]   # count defaults to 2
```

### Tests

```bash
cd server
npm test
```

## Environment variables

**server/.env**
| Var | Purpose |
| --- | --- |
| `PORT` | Port the server listens on (default `3001`) |
| `CLIENT_ORIGIN` | Comma-separated allowlist of origins allowed to connect (CORS + Socket.io). **Required in production** — the server refuses to start without it when `NODE_ENV=production`. |

**client/.env**
| Var | Purpose |
| --- | --- |
| `VITE_SERVER_URL` | URL of the game server. Baked in at build time. |

## Deployment

Deployed as two separate services: the server on Render, the client on Vercel.

**Server (Render)**

This repo includes a [`render.yaml`](render.yaml) blueprint. In the Render
dashboard, "New +" → "Blueprint", point it at this repo. It builds from
`server/`, runs `npm start`, and health-checks `/health`. After the first
deploy, set `CLIENT_ORIGIN` in the service's environment settings to your
Vercel domain(s) (comma-separated if you also want preview URLs allowed).

**Client (Vercel)**

Import this repo into Vercel and set the project's **Root Directory** to
`client`. [`client/vercel.json`](client/vercel.json) pins the Vite build
settings. Add an environment variable `VITE_SERVER_URL` pointing at your
Render service's URL (e.g. `https://soundbite-server.onrender.com`), for
both Production and Preview environments.

Once both are deployed, update the server's `CLIENT_ORIGIN` to match the
final Vercel URL and redeploy the server.
