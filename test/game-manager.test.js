'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  GameError,
  GameManager,
  LIMITS,
  normalizeCode,
  normalizeName,
  normalizeQuestion,
} = require('../src/game-manager');

function createManager(randomValues = [1234]) {
  let index = 0;
  return new GameManager({
    random(maximum) {
      const value = randomValues[index] ?? 0;
      index += 1;
      return value % maximum;
    },
  });
}

function createReadyRoom(randomValues) {
  const games = createManager(randomValues);
  const room = games.createRoom('host', 'Nithin');
  games.joinRoom('maya', room.code, 'Maya');
  games.joinRoom('leo', room.code, 'Leo');
  return { games, room };
}

function expectGameError(action, code) {
  assert.throws(action, (error) => error instanceof GameError && error.code === code);
}

describe('input validation', () => {
  it('normalizes player names, room codes, and questions', () => {
    assert.equal(normalizeName("  D'Arcy   K. "), "D'Arcy K.");
    assert.equal(normalizeCode(' 0042 '), '0042');
    assert.equal(normalizeQuestion('  Who   would host?  '), 'Who would host?');
  });

  it('rejects invalid public input', () => {
    expectGameError(() => normalizeName('<script>'), 'INVALID_NAME');
    expectGameError(() => normalizeName('x'), 'INVALID_NAME');
    expectGameError(() => normalizeCode('123'), 'INVALID_CODE');
    expectGameError(() => normalizeQuestion('  '), 'INVALID_QUESTION');
    expectGameError(
      () => normalizeQuestion('x'.repeat(LIMITS.questionLength + 1)),
      'INVALID_QUESTION',
    );
  });
});

describe('room lifecycle', () => {
  it('creates a four-digit room and adds players with unique names', () => {
    const games = createManager([42]);
    const room = games.createRoom('host', 'Nithin');

    assert.equal(room.code, '0042');
    assert.equal(games.joinRoom('maya', '0042', 'Maya'), room);
    expectGameError(() => games.joinRoom('other', '0042', 'maya'), 'NAME_TAKEN');
    expectGameError(() => games.joinRoom('lost', '9999', 'Leo'), 'ROOM_NOT_FOUND');
  });

  it('requires the host and at least three players to start', () => {
    const games = createManager();
    const room = games.createRoom('host', 'Nithin');
    games.joinRoom('maya', room.code, 'Maya');

    expectGameError(() => games.startGame('maya'), 'HOST_ONLY');
    expectGameError(() => games.startGame('host'), 'NOT_ENOUGH_PLAYERS');

    games.joinRoom('leo', room.code, 'Leo');
    games.startGame('host');

    assert.equal(room.phase, 'question');
    assert.equal(room.round.asker.id, 'host');
    assert.equal(room.roundNumber, 1);
  });

  it('transfers host ownership and cleans up empty rooms', () => {
    const { games, room } = createReadyRoom();

    games.leaveRoom('host');
    assert.equal(room.hostId, 'maya');
    games.leaveRoom('maya');
    games.leaveRoom('leo');

    assert.equal(games.rooms.has(room.code), false);
  });
});

describe('game flow', () => {
  it('keeps the question private until a heads result', () => {
    const { games, room } = createReadyRoom([3141, 1]);
    games.startGame('host');
    games.submitQuestion('host', {
      question: 'Who would survive on a desert island?',
      victimId: 'maya',
    });

    assert.equal(games.getState('maya').round.question, 'Who would survive on a desert island?');
    assert.equal(games.getState('leo').round.question, null);

    games.submitAnswer('maya', 'leo');
    assert.equal(games.getState('host').round.answerName, 'Leo');
    assert.equal(games.getState('host').round.question, null);

    games.flipCoin('host');
    assert.equal(room.round.coin, 'heads');
    assert.equal(games.getState('leo').round.question, 'Who would survive on a desert island?');

    games.nextRound('host');
    assert.equal(room.roundNumber, 2);
    assert.equal(room.round.asker.id, 'maya');
  });

  it('supports random victims and hides the question on tails', () => {
    const { games, room } = createReadyRoom([2718, 1, 0]);
    games.startGame('host');
    games.submitQuestion('host', {
      question: 'Who has the best poker face?',
      randomVictim: true,
    });

    assert.equal(room.round.victim.id, 'leo');
    games.submitAnswer('leo', 'maya');
    games.flipCoin('host');

    assert.equal(room.round.coin, 'tails');
    assert.equal(games.getState('maya').round.question, null);
  });

  it('recovers the room if an active player disconnects', () => {
    const { games, room } = createReadyRoom();
    games.joinRoom('sana', room.code, 'Sana');
    games.startGame('host');

    games.leaveRoom('host');

    assert.equal(room.hostId, 'maya');
    assert.equal(room.phase, 'question');
    assert.equal(room.round.asker.id, 'maya');
    assert.equal(room.roundNumber, 2);
  });

  it('starts a fresh round if the asker leaves while an answer is pending', () => {
    const { games, room } = createReadyRoom();
    games.joinRoom('sana', room.code, 'Sana');
    games.startGame('host');
    games.submitQuestion('host', {
      question: 'Who would remember every birthday?',
      victimId: 'maya',
    });

    games.leaveRoom('host');

    assert.equal(room.phase, 'question');
    assert.equal(room.round.asker.id, 'maya');
    assert.equal(room.roundNumber, 2);
  });

  it('returns to the lobby when too few players remain', () => {
    const { games, room } = createReadyRoom();
    games.startGame('host');
    games.leaveRoom('leo');

    assert.equal(room.phase, 'lobby');
    assert.equal(room.round, null);
  });
});
