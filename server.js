'use strict';

const { createGameServer } = require('./src/create-server');

const port = normalizePort(process.env.PORT || '3000');
const host = process.env.HOST || '0.0.0.0';
const { httpServer, io } = createGameServer();

httpServer.listen(port, host, () => {
  console.log(`Paranoia is running on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing active connections.`);
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function normalizePort(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new TypeError(`Invalid port: ${value}`);
  }

  return parsed;
}

module.exports = { normalizePort };
