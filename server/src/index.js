import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './game/RoomManager.js';
import { attachSocketHandlers } from './transport/socketServer.js';

const PORT = process.env.PORT || 3001;

// CLIENT_ORIGIN is a comma-separated allowlist (e.g. your Vercel prod domain
// plus any preview deployment URLs). In production this must be set
// explicitly — falling back to '*' would let any site's script open a
// socket to this server. Dev keeps the '*' fallback for convenience.
const rawOrigins = process.env.CLIENT_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
if (!rawOrigins?.length && process.env.NODE_ENV === 'production') {
  throw new Error('CLIENT_ORIGIN must be set in production (comma-separated list of allowed origins).');
}
const CLIENT_ORIGIN = rawOrigins?.length ? rawOrigins : '*';

const manager = new RoomManager();

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', rooms: manager.roomCount });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 2 * 1024 * 1024, // ~2MB headroom for a 15s compressed audio blob
});

attachSocketHandlers(io, manager);

httpServer.listen(PORT, () => {
  console.log(`Soundbite server listening on port ${PORT}`);
});
