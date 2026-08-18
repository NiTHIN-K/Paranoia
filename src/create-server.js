'use strict';

const path = require('node:path');
const { createServer } = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const { GameError, GameManager } = require('./game-manager');

function createGameServer(options = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    maxHttpBufferSize: 100_000,
  });
  const games = options.games || new GameManager();
  const publicDirectory = path.join(__dirname, '..', 'public');

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  app.use(
    express.static(publicDirectory, {
      extensions: ['html'],
      maxAge: options.staticMaxAge ?? '1h',
    }),
  );

  io.on('connection', (socket) => {
    socket.on('create_room', (payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.createRoom(socket.id, payload?.name);
        socket.join(room.code);
        broadcastRoom(room);
        return { code: room.code };
      });
    });

    socket.on('join_room', (payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.joinRoom(socket.id, payload?.code, payload?.name);
        socket.join(room.code);
        broadcastRoom(room);
        return { code: room.code };
      });
    });

    socket.on('start_game', (_payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.startGame(socket.id);
        broadcastRoom(room);
      });
    });

    socket.on('submit_question', (payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.submitQuestion(socket.id, payload);
        broadcastRoom(room);
      });
    });

    socket.on('submit_answer', (payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.submitAnswer(socket.id, payload?.answerId);
        broadcastRoom(room);
      });
    });

    socket.on('flip_coin', (_payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.flipCoin(socket.id);
        broadcastRoom(room);
      });
    });

    socket.on('next_round', (_payload, reply) => {
      handleAction(socket, reply, () => {
        const room = games.nextRound(socket.id);
        broadcastRoom(room);
      });
    });

    socket.on('leave_room', (_payload, reply) => {
      handleAction(socket, reply, () => {
        const currentRoom = games.getRoomForSocket(socket.id);

        if (currentRoom) {
          socket.leave(currentRoom.code);
        }

        const remainingRoom = games.leaveRoom(socket.id);
        broadcastRoom(remainingRoom);
        socket.emit('left_room');
      });
    });

    socket.on('disconnect', () => {
      const remainingRoom = games.leaveRoom(socket.id);
      broadcastRoom(remainingRoom);
    });
  });

  function handleAction(socket, reply, action) {
    try {
      const result = action() || {};
      safeReply(reply, { ok: true, ...result });
    } catch (error) {
      const publicError = toPublicError(error);
      safeReply(reply, { ok: false, error: publicError });

      if (typeof reply !== 'function') {
        socket.emit('game_error', publicError);
      }

      if (!(error instanceof GameError)) {
        console.error('Unexpected game error:', error);
      }
    }
  }

  function broadcastRoom(room) {
    if (!room) {
      return;
    }

    for (const socketId of room.players.keys()) {
      io.to(socketId).emit('game_state', games.getState(socketId));
    }
  }

  return { app, games, httpServer, io };
}

function securityHeaders(_request, response, next) {
  response.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "connect-src 'self' ws: wss:",
      "font-src 'self'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "object-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  next();
}

function safeReply(reply, payload) {
  if (typeof reply === 'function') {
    reply(payload);
  }
}

function toPublicError(error) {
  if (error instanceof GameError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  };
}

module.exports = { createGameServer, securityHeaders, toPublicError };
