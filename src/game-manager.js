'use strict';

const { randomInt } = require('node:crypto');

const ROOM_CODE_PATTERN = /^\d{4}$/;

const LIMITS = Object.freeze({
  minimumPlayers: 3,
  maximumPlayers: 12,
  nameLength: 20,
  questionLength: 180,
});

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}

class GameManager {
  constructor({ random = randomInt } = {}) {
    this.rooms = new Map();
    this.memberships = new Map();
    this.random = random;
  }

  createRoom(socketId, rawName) {
    this.#assertAvailableSocket(socketId);

    const player = this.#createPlayer(socketId, rawName);
    const code = this.#generateRoomCode();
    const room = {
      code,
      hostId: socketId,
      players: new Map([[socketId, player]]),
      phase: 'lobby',
      roundNumber: 0,
      lastAskerId: null,
      round: null,
    };

    this.rooms.set(code, room);
    this.memberships.set(socketId, code);

    return room;
  }

  joinRoom(socketId, rawCode, rawName) {
    this.#assertAvailableSocket(socketId);

    const code = normalizeCode(rawCode);
    const room = this.rooms.get(code);

    if (!room) {
      throw new GameError('ROOM_NOT_FOUND', 'That room does not exist. Check the code and try again.');
    }

    if (room.phase !== 'lobby') {
      throw new GameError('GAME_IN_PROGRESS', 'That game has already started.');
    }

    if (room.players.size >= LIMITS.maximumPlayers) {
      throw new GameError('ROOM_FULL', 'That room is full.');
    }

    const player = this.#createPlayer(socketId, rawName);
    const duplicateName = [...room.players.values()].some(
      (candidate) => candidate.name.toLocaleLowerCase() === player.name.toLocaleLowerCase(),
    );

    if (duplicateName) {
      throw new GameError('NAME_TAKEN', 'That name is already being used in this room.');
    }

    room.players.set(socketId, player);
    this.memberships.set(socketId, code);

    return room;
  }

  startGame(socketId) {
    const room = this.#getRoomForMember(socketId);

    if (room.hostId !== socketId) {
      throw new GameError('HOST_ONLY', 'Only the host can start the game.');
    }

    if (room.phase !== 'lobby') {
      throw new GameError('INVALID_PHASE', 'The game has already started.');
    }

    if (room.players.size < LIMITS.minimumPlayers) {
      throw new GameError(
        'NOT_ENOUGH_PLAYERS',
        `Invite at least ${LIMITS.minimumPlayers} players before starting.`,
      );
    }

    this.#beginRound(room);
    return room;
  }

  submitQuestion(socketId, payload = {}) {
    const room = this.#getRoomForMember(socketId);
    const { round } = room;

    if (room.phase !== 'question' || !round) {
      throw new GameError('INVALID_PHASE', 'The room is not accepting a question right now.');
    }

    if (round.asker.id !== socketId) {
      throw new GameError('NOT_YOUR_TURN', 'It is not your turn to ask a question.');
    }

    const question = normalizeQuestion(payload.question);
    const candidates = [...room.players.values()].filter((player) => player.id !== socketId);
    let victim;

    if (payload.randomVictim === true) {
      victim = candidates[this.random(candidates.length)];
    } else {
      victim = candidates.find((player) => player.id === payload.victimId);
    }

    if (!victim) {
      throw new GameError('INVALID_PLAYER', 'Choose an available player.');
    }

    round.question = question;
    round.victim = { ...victim };
    room.phase = 'answer';

    return room;
  }

  submitAnswer(socketId, answerId) {
    const room = this.#getRoomForMember(socketId);
    const { round } = room;

    if (room.phase !== 'answer' || !round) {
      throw new GameError('INVALID_PHASE', 'The room is not accepting an answer right now.');
    }

    if (round.victim.id !== socketId) {
      throw new GameError('NOT_YOUR_TURN', 'This answer belongs to another player.');
    }

    const answer = room.players.get(answerId);

    if (!answer || answer.id === socketId) {
      throw new GameError('INVALID_PLAYER', 'Choose another player as your answer.');
    }

    round.answer = { ...answer };
    room.phase = 'reveal';

    return room;
  }

  flipCoin(socketId) {
    const room = this.#getRoomForMember(socketId);
    const { round } = room;

    if (room.phase !== 'reveal' || !round) {
      throw new GameError('INVALID_PHASE', 'The coin cannot be flipped right now.');
    }

    if (round.asker.id !== socketId) {
      throw new GameError('NOT_YOUR_TURN', 'The asker gets to flip the coin.');
    }

    round.coin = this.random(2) === 1 ? 'heads' : 'tails';
    room.phase = 'coin';

    return room;
  }

  nextRound(socketId) {
    const room = this.#getRoomForMember(socketId);

    if (room.phase !== 'coin') {
      throw new GameError('INVALID_PHASE', 'Finish the current round first.');
    }

    if (room.hostId !== socketId) {
      throw new GameError('HOST_ONLY', 'Only the host can begin the next round.');
    }

    this.#beginRound(room);
    return room;
  }

  leaveRoom(socketId) {
    const code = this.memberships.get(socketId);

    if (!code) {
      return null;
    }

    const room = this.rooms.get(code);
    this.memberships.delete(socketId);

    if (!room) {
      return null;
    }

    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return null;
    }

    if (room.hostId === socketId) {
      room.hostId = room.players.keys().next().value;
    }

    if (room.phase === 'lobby') {
      return room;
    }

    if (room.players.size < LIMITS.minimumPlayers) {
      room.phase = 'lobby';
      room.round = null;
      room.lastAskerId = null;
      return room;
    }

    const activePlayerLeft =
      room.round &&
      ((room.phase === 'question' && room.round.asker.id === socketId) ||
        (room.phase === 'answer' &&
          (room.round.asker.id === socketId || room.round.victim.id === socketId)) ||
        (room.phase === 'reveal' && room.round.asker.id === socketId));

    if (activePlayerLeft) {
      this.#beginRound(room);
    }

    return room;
  }

  getRoomForSocket(socketId) {
    const code = this.memberships.get(socketId);
    return code ? this.rooms.get(code) || null : null;
  }

  getState(socketId) {
    const room = this.#getRoomForMember(socketId);
    const players = [...room.players.values()];
    const state = {
      code: room.code,
      phase: room.phase,
      roundNumber: room.roundNumber,
      players: players.map((player) => ({ ...player })),
      hostId: room.hostId,
      isHost: room.hostId === socketId,
      role: room.hostId === socketId ? 'host' : 'player',
      limits: LIMITS,
      round: null,
      options: [],
    };

    if (room.phase === 'lobby' || !room.round) {
      return state;
    }

    const { round } = room;
    state.round = {
      askerName: round.asker.name,
      victimName: round.victim?.name || null,
      answerName: round.answer?.name || null,
      coin: round.coin,
      question: null,
    };

    if (room.phase === 'question') {
      state.role = round.asker.id === socketId ? 'ask' : 'wait';

      if (state.role === 'ask') {
        state.options = players
          .filter((player) => player.id !== socketId)
          .map((player) => ({ ...player }));
      }
    }

    if (room.phase === 'answer') {
      state.role = round.victim.id === socketId ? 'answer' : 'wait';

      if (state.role === 'answer') {
        state.round.question = round.question;
        state.options = players
          .filter((player) => player.id !== socketId)
          .map((player) => ({ ...player }));
      }
    }

    if (room.phase === 'reveal') {
      state.role = round.asker.id === socketId ? 'flip' : 'wait';
    }

    if (room.phase === 'coin') {
      state.role = room.hostId === socketId ? 'next' : 'wait';

      if (round.coin === 'heads') {
        state.round.question = round.question;
      }
    }

    return state;
  }

  #assertAvailableSocket(socketId) {
    if (!socketId || typeof socketId !== 'string') {
      throw new GameError('INVALID_PLAYER', 'A valid connection is required.');
    }

    if (this.memberships.has(socketId)) {
      throw new GameError('ALREADY_IN_ROOM', 'Leave your current room before joining another one.');
    }
  }

  #createPlayer(socketId, rawName) {
    return { id: socketId, name: normalizeName(rawName) };
  }

  #getRoomForMember(socketId) {
    const room = this.getRoomForSocket(socketId);

    if (!room) {
      throw new GameError('NOT_IN_ROOM', 'Join a room first.');
    }

    return room;
  }

  #generateRoomCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = String(this.random(10_000)).padStart(4, '0');

      if (!this.rooms.has(code)) {
        return code;
      }
    }

    throw new GameError('ROOM_LIMIT', 'No room codes are available. Try again in a moment.');
  }

  #beginRound(room) {
    const players = [...room.players.values()];
    const previousIndex = players.findIndex((player) => player.id === room.lastAskerId);
    const nextIndex = previousIndex >= 0 ? (previousIndex + 1) % players.length : 0;
    const asker = players[nextIndex];

    room.phase = 'question';
    room.roundNumber += 1;
    room.lastAskerId = asker.id;
    room.round = {
      asker: { ...asker },
      victim: null,
      answer: null,
      question: null,
      coin: null,
    };
  }
}

function normalizeName(value) {
  if (typeof value !== 'string') {
    throw new GameError('INVALID_NAME', 'Enter a name to continue.');
  }

  const name = value.trim().replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > LIMITS.nameLength) {
    throw new GameError(
      'INVALID_NAME',
      `Names must be between 2 and ${LIMITS.nameLength} characters.`,
    );
  }

  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(name)) {
    throw new GameError(
      'INVALID_NAME',
      'Names can use letters, numbers, spaces, apostrophes, periods, and hyphens.',
    );
  }

  return name;
}

function normalizeCode(value) {
  const code = String(value ?? '').trim();

  if (!ROOM_CODE_PATTERN.test(code)) {
    throw new GameError('INVALID_CODE', 'Room codes contain exactly four numbers.');
  }

  return code;
}

function normalizeQuestion(value) {
  if (typeof value !== 'string') {
    throw new GameError('INVALID_QUESTION', 'Write a question before choosing a player.');
  }

  const question = value.trim().replace(/\s+/g, ' ');

  if (question.length < 3 || question.length > LIMITS.questionLength) {
    throw new GameError(
      'INVALID_QUESTION',
      `Questions must be between 3 and ${LIMITS.questionLength} characters.`,
    );
  }

  return question;
}

module.exports = {
  GameError,
  GameManager,
  LIMITS,
  normalizeCode,
  normalizeName,
  normalizeQuestion,
};
