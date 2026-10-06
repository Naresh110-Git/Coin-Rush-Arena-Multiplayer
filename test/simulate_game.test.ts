import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import express from 'express';
import { RoomManager } from '../src/server/RoomManager.js';
import { RoomResponse } from '../src/shared/types.js';

describe('Multiplayer Real-Time Integration Test Suite', () => {
  let httpServer: any;
  let ioServer: Server;
  let roomManager: RoomManager;
  let port: number;

  beforeAll(async () => {
    const app = express();
    httpServer = createServer(app);
    ioServer = new Server(httpServer, {
      cors: { origin: '*' },
    });
    roomManager = new RoomManager(ioServer);

    ioServer.on('connection', (socket) => {
      socket.emit('public_rooms_update', roomManager.getPublicRooms());

      socket.on('create_room', (data: any, callback: any) => {
        const room = roomManager.createRoom();
        const { playerId, sessionToken, isHost } = room.addPlayer(socket, data?.nickname || 'Host');
        roomManager.registerSocketInRoom(socket.id, room.code);

        if (data?.withBots) {
          room.addBot();
        }

        callback({ success: true, roomCode: room.code, playerId, sessionToken, isHost });
      });

      socket.on('join_room', (data: any, callback: any) => {
        const room = roomManager.getRoom(data.roomCode);
        if (!room) {
          callback({ success: false, error: 'Room not found' });
          return;
        }
        const { playerId, sessionToken, isHost } = room.addPlayer(socket, data?.nickname || 'Guest', data?.sessionToken);
        roomManager.registerSocketInRoom(socket.id, room.code);
        callback({ success: true, roomCode: room.code, playerId, sessionToken, isHost });
      });

      socket.on('add_bot', (callback?: any) => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (room) room.addBot();
        if (typeof callback === 'function') callback();
      });

      socket.on('player_move', (data: any) => {
        const room = roomManager.getRoomBySocket(socket.id);
        if (room) room.handlePlayerMove(data.playerId, data.dir);
      });

      socket.on('disconnect', () => {
        roomManager.unregisterSocket(socket.id);
      });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        port = (httpServer.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    ioServer.close();
    httpServer.close();
  });

  it('allows Host to create room and Guest to join with synchronized state', async () => {
    const client1: ClientSocket = ClientIO(`http://localhost:${port}`);
    const client2: ClientSocket = ClientIO(`http://localhost:${port}`);

    await new Promise((resolve) => client1.on('connect', resolve));
    await new Promise((resolve) => client2.on('connect', resolve));

    // 1. Host creates room
    const createRes: RoomResponse = await new Promise((resolve) => {
      client1.emit('create_room', { nickname: 'HostPlayer' }, resolve);
    });

    expect(createRes.success).toBe(true);
    expect(createRes.isHost).toBe(true);
    expect(createRes.roomCode).toMatch(/^[A-Z0-9]{4}$/);

    const roomCode = createRes.roomCode!;

    // 2. Guest joins room
    const joinRes: RoomResponse = await new Promise((resolve) => {
      client2.emit('join_room', { roomCode, nickname: 'GuestPlayer' }, resolve);
    });

    expect(joinRes.success).toBe(true);
    expect(joinRes.isHost).toBe(false);
    expect(joinRes.playerId).toBeDefined();

    // 3. Host adds AI Bot
    await new Promise<void>((resolve) => {
      client1.emit('add_bot', resolve);
    });

    const room = roomManager.getRoom(roomCode)!;
    expect(room).toBeDefined();
    expect(room.players.size).toBe(3); // Host + Guest + Bot

    // 4. Session Token Reconnection Test
    const originalGuestId = joinRes.playerId!;
    const guestToken = joinRes.sessionToken!;

    // Disconnect guest socket
    client2.disconnect();

    // Reconnect with a new socket using sessionToken
    const client3: ClientSocket = ClientIO(`http://localhost:${port}`);
    await new Promise((resolve) => client3.on('connect', resolve));

    const reconnectRes: RoomResponse = await new Promise((resolve) => {
      client3.emit('join_room', { roomCode, sessionToken: guestToken }, resolve);
    });

    expect(reconnectRes.success).toBe(true);
    expect(reconnectRes.playerId).toBe(originalGuestId); // Restored identity!

    client1.disconnect();
    client3.disconnect();
  });
});
