import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { RoomManager } from './RoomManager.js';
import { RoomResponse } from '../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

// Serve static client bundle if built
const clientDistPath = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientDistPath));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    game: 'Coin Rush Arena',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Attach Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const roomManager = new RoomManager(io);

// Public API endpoint for active rooms
app.get('/api/rooms', (_req, res) => {
  res.json({
    rooms: roomManager.getPublicRooms(),
    timestamp: Date.now(),
  });
});

// Socket.io Connection & Event Routing
io.on('connection', (socket: Socket) => {
  // Send public rooms directory immediately
  socket.emit('public_rooms_update', roomManager.getPublicRooms());

  // 1. Create Room Handler
  socket.on(
    'create_room',
    (data: { nickname?: string; withBots?: boolean }, callback: (res: RoomResponse) => void) => {
      try {
        const room = roomManager.createRoom();
        const nickname = (data?.nickname || '').trim() || `Player-${socket.id.slice(0, 4)}`;
        const { playerId, sessionToken, isHost } = room.addPlayer(socket, nickname);
        roomManager.registerSocketInRoom(socket.id, room.code);

        // If Solo Practice mode requested, add 2 AI bots immediately!
        if (data?.withBots) {
          room.addBot();
          room.addBot();
        }

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: room.code,
            playerId,
            sessionToken,
            isHost,
          });
        }
      } catch (err: any) {
        console.error('[Server] Error creating room:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: 'Failed to create room' });
        }
      }
    }
  );

  // 2. Join Room Handler (with Session Reconnection)
  socket.on(
    'join_room',
    (
      data: { roomCode: string; nickname?: string; sessionToken?: string },
      callback: (res: RoomResponse) => void
    ) => {
      try {
        const roomCode = (data?.roomCode || '').toUpperCase().trim();
        const room = roomManager.getRoom(roomCode);

        if (!room) {
          if (typeof callback === 'function') {
            callback({ success: false, error: 'Room not found. Check code.' });
          }
          return;
        }

        const nickname = (data?.nickname || '').trim() || `Player-${socket.id.slice(0, 4)}`;
        const { playerId, sessionToken, isHost } = room.addPlayer(
          socket,
          nickname,
          data?.sessionToken
        );
        roomManager.registerSocketInRoom(socket.id, room.code);

        if (typeof callback === 'function') {
          callback({
            success: true,
            roomCode: room.code,
            playerId,
            sessionToken,
            isHost,
          });
        }
      } catch (err: any) {
        console.error('[Server] Error joining room:', err);
        if (typeof callback === 'function') {
          callback({ success: false, error: err.message || 'Unable to join room' });
        }
      }
    }
  );

  // 3. Add AI Bot (Host feature)
  socket.on('add_bot', (callback?: () => void) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room) {
      room.addBot();
    }
    if (typeof callback === 'function') {
      callback();
    }
  });

  // 4. Toggle Ready State
  socket.on('set_ready', (data: { playerId: string; ready: boolean }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room && data?.playerId) {
      room.setPlayerReady(data.playerId, Boolean(data.ready));
    }
  });

  // 5. Start Game (Host only)
  socket.on('start_game', (data: { playerId: string }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room && data?.playerId) {
      room.startCountdown(data.playerId);
    }
  });

  // 6. Player Movement Intent (Authoritative Processing)
  socket.on('player_move', (data: { playerId: string; dir: { x: number; y: number } }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room && data?.playerId && data?.dir) {
      room.handlePlayerMove(data.playerId, data.dir);
    }
  });

  // 7. Request Rematch (Host only)
  socket.on('request_rematch', (data: { playerId: string }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room && data?.playerId) {
      room.handleRematch(data.playerId);
    }
  });

  // 8. Intentional Leave Room
  socket.on('leave_room', (data: { playerId: string }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (room && data?.playerId) {
      room.removePlayerPermanently(data.playerId);
      socket.leave(room.code);
    }
    roomManager.unregisterSocket(socket.id);
  });

  // 9. Latency Ping
  socket.on('ping_check', (timestamp: number, callback: (clientTime: number) => void) => {
    if (typeof callback === 'function') {
      callback(timestamp);
    }
  });

  // 10. Disconnect Handling (Grace Period)
  socket.on('disconnect', () => {
    roomManager.unregisterSocket(socket.id);
  });
});

// Fallback to index.html for client-side routing
app.get('*', (_req, res) => {
  res.sendFile(path.resolve(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Coin Rush Arena Server Running. Start Vite client or build client.');
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`[Coin Rush Arena] Server active on port ${PORT}`);
  console.log(`[Coin Rush Arena] Health endpoint: http://localhost:${PORT}/health`);
  console.log(`==================================================`);
});

// Graceful Shutdown
const shutdown = () => {
  console.log('[Server] Gracefully shutting down...');
  httpServer.close(() => {
    console.log('[Server] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
