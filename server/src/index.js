import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './game/RoomManager.js';
import { attachSocketHandlers } from './transport/socketServer.js';

const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

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
