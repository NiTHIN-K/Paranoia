/* global io */
'use strict';

const socket = io();
const views = {
  home: document.querySelector('#home-view'),
  lobby: document.querySelector('#lobby-view'),
  game: document.querySelector('#game-view'),
};
const elements = {
  connectionDot: document.querySelector('#connection-dot'),
  connectionLabel: document.querySelector('#connection-label'),
  copyCode: document.querySelector('#copy-code'),
  createForm: document.querySelector('#create-form'),
  gamePlayerCount: document.querySelector('#game-player-count'),
  gamePlayerList: document.querySelector('#game-player-list'),
  gameRoomCode: document.querySelector('#game-room-code'),
  gameStage: document.querySelector('#game-stage'),
  joinCode: document.querySelector('#join-code'),
  joinForm: document.querySelector('#join-form'),
  lobbyHint: document.querySelector('#lobby-hint'),
  playerCount: document.querySelector('#player-count'),
  playerList: document.querySelector('#player-list'),
  roomCode: document.querySelector('#room-code'),
  roundLabel: document.querySelector('#round-label'),
  startGame: document.querySelector('#start-game'),
  toast: document.querySelector('#toast'),
};

let currentState = null;
let disconnectedFromRoom = false;
let toastTimer;

socket.on('connect', () => {
  setConnectionStatus(true);

  if (disconnectedFromRoom) {
    disconnectedFromRoom = false;
    currentState = null;
    showView('home');
    showToast('Connection restored. Join or create a room to keep playing.');
  }
});

socket.on('disconnect', () => {
  setConnectionStatus(false);
  disconnectedFromRoom = Boolean(currentState);
});

socket.on('game_state', (state) => {
  currentState = state;
  render(state);
});

socket.on('game_error', (error) => {
  showToast(error?.message || 'Something went wrong.', true);
});

socket.on('left_room', () => {
  currentState = null;
  showView('home');
  showToast('You left the room.');
});

elements.createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await runFormAction(form, 'create_room', { name: data.get('name') });
});

elements.joinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  await runFormAction(form, 'join_room', {
    code: data.get('code'),
    name: data.get('name'),
  });
});

elements.joinCode.addEventListener('input', (event) => {
  event.currentTarget.value = event.currentTarget.value.replace(/\D/g, '').slice(0, 4);
});

elements.startGame.addEventListener('click', async () => {
  await runAction('start_game');
});

elements.copyCode.addEventListener('click', async () => {
  if (!currentState) {
    return;
  }

  try {
    await navigator.clipboard.writeText(currentState.code);
    showToast('Room code copied.');
  } catch {
    showToast(`Room code: ${currentState.code}`);
  }
});

for (const button of document.querySelectorAll('.leave-room')) {
  button.addEventListener('click', async () => {
    await runAction('leave_room');
  });
}

function render(state) {
  if (state.phase === 'lobby') {
    renderLobby(state);
    showView('lobby');
    return;
  }

  renderGame(state);
  showView('game');
}

function renderLobby(state) {
  elements.roomCode.textContent = state.code;
  elements.playerCount.textContent = `${state.players.length} / ${state.limits.maximumPlayers}`;
  renderPlayers(elements.playerList, state.players, state.hostId);

  elements.startGame.hidden = !state.isHost;
  elements.startGame.disabled = state.players.length < state.limits.minimumPlayers;

  if (state.isHost && state.players.length < state.limits.minimumPlayers) {
    const remaining = state.limits.minimumPlayers - state.players.length;
    elements.lobbyHint.textContent = `Waiting for ${remaining} more ${remaining === 1 ? 'player' : 'players'}.`;
  } else if (state.isHost) {
    elements.lobbyHint.textContent = 'Everyone is here. Start whenever you are ready.';
  } else {
    elements.lobbyHint.textContent = 'Waiting for the host to start the game.';
  }
}

function renderGame(state) {
  elements.gameRoomCode.textContent = state.code;
  elements.roundLabel.textContent = `Round ${state.roundNumber}`;
  elements.gamePlayerCount.textContent = String(state.players.length);
  renderPlayers(elements.gamePlayerList, state.players, state.hostId);
  elements.gameStage.replaceChildren();

  if (state.phase === 'question') {
    renderQuestionPhase(state);
  } else if (state.phase === 'answer') {
    renderAnswerPhase(state);
  } else if (state.phase === 'reveal') {
    renderRevealPhase(state);
  } else if (state.phase === 'coin') {
    renderCoinPhase(state);
  }
}

function renderQuestionPhase(state) {
  if (state.role !== 'ask') {
    appendStageIntro(
      'Question in progress',
      `${state.round.askerName} is writing a question.`,
      'Keep a straight face. You could be the person they choose.',
    );
    return;
  }

  appendStageIntro(
    'You are the asker',
    'Make them wonder.',
    'Write a question that can be answered with someone in the room.',
  );

  const form = createElement('form', 'stage-form');
  const questionGroup = createElement('div');
  const questionLabel = createElement('label', null, 'Your question');
  questionLabel.htmlFor = 'question-input';
  const questionInput = createElement('textarea');
  questionInput.id = 'question-input';
  questionInput.name = 'question';
  questionInput.maxLength = state.limits.questionLength;
  questionInput.placeholder = 'Who is most likely to disappear on a spontaneous road trip?';
  questionInput.required = true;
  questionGroup.append(questionLabel, questionInput);

  const victimGroup = createElement('div');
  const victimLabel = createElement('label', null, 'Who should answer?');
  victimLabel.htmlFor = 'victim-select';
  const victimSelect = createElement('select');
  victimSelect.id = 'victim-select';
  victimSelect.name = 'victim';
  const randomOption = createElement('option', null, 'Surprise me — choose at random');
  randomOption.value = '__random__';
  victimSelect.append(randomOption);

  for (const player of state.options) {
    const option = createElement('option', null, player.name);
    option.value = player.id;
    victimSelect.append(option);
  }

  victimGroup.append(victimLabel, victimSelect);
  const submit = createElement('button', 'button button-primary', 'Lock it in');
  submit.type = 'submit';
  form.append(questionGroup, victimGroup, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const victimId = data.get('victim');
    await runFormAction(form, 'submit_question', {
      question: data.get('question'),
      randomVictim: victimId === '__random__',
      victimId: victimId === '__random__' ? null : victimId,
    });
  });
  elements.gameStage.append(form);
  questionInput.focus();
}

function renderAnswerPhase(state) {
  if (state.role !== 'answer') {
    appendStageIntro(
      'Answer in progress',
      `${state.round.victimName} is choosing a name.`,
      `${state.round.askerName} asked the question. The rest stays secret for now.`,
    );
    return;
  }

  appendStageIntro(
    `${state.round.askerName} asked you`,
    state.round.question,
    'Answer with one person in the room. Choose carefully.',
  );

  const choices = createElement('div', 'choice-grid');

  for (const player of state.options) {
    const button = createElement('button', 'choice-button', player.name);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      await runAction('submit_answer', { answerId: player.id });
      button.disabled = false;
    });
    choices.append(button);
  }

  elements.gameStage.append(choices);
}

function renderRevealPhase(state) {
  appendStageIntro(
    'The answer is in',
    `${state.round.victimName} made a choice.`,
    'One coin flip decides whether everyone gets to hear the question.',
  );

  const reveal = createElement('div', 'reveal-card');
  reveal.append(
    createElement('p', null, 'Asked by'),
    createElement('strong', null, state.round.askerName),
    createElement('p', null, 'Answer'),
    createElement('strong', null, state.round.answerName),
  );
  elements.gameStage.append(reveal);

  if (state.role === 'flip') {
    const button = createElement('button', 'button button-primary', 'Flip the coin');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      await runAction('flip_coin');
      button.disabled = false;
    });
    elements.gameStage.append(button);
  } else {
    elements.gameStage.append(createElement('p', 'stage-copy', 'Waiting for the asker to flip.'));
  }
}

function renderCoinPhase(state) {
  const isHeads = state.round.coin === 'heads';
  appendStageIntro(
    isHeads ? 'Heads — reveal it' : 'Tails — keep it secret',
    isHeads ? 'The question is out.' : 'The room keeps its secret.',
    isHeads
      ? `${state.round.askerName}'s question is now public.`
      : `${state.round.answerName} remains the answer, but the question stays hidden.`,
  );

  elements.gameStage.append(createElement('div', 'coin', isHeads ? 'H' : 'T'));

  if (isHeads) {
    const reveal = createElement('div', 'reveal-card');
    reveal.append(
      createElement('p', null, 'The question'),
      createElement('strong', 'question-reveal', state.round.question),
      createElement('p', null, 'The answer'),
      createElement('strong', null, state.round.answerName),
    );
    elements.gameStage.append(reveal);
  }

  if (state.role === 'next') {
    const button = createElement('button', 'button button-primary', 'Next round');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      await runAction('next_round');
      button.disabled = false;
    });
    elements.gameStage.append(button);
  } else {
    elements.gameStage.append(createElement('p', 'stage-copy', 'Waiting for the host to continue.'));
  }
}

function appendStageIntro(kicker, title, copy) {
  const content = createElement('div', 'stage-content');
  content.append(
    createElement('p', 'stage-kicker', kicker),
    createElement('h1', 'stage-title', title),
    createElement('p', 'stage-copy', copy),
  );
  elements.gameStage.append(content);
}

function renderPlayers(list, players, hostId) {
  list.replaceChildren();

  for (const player of players) {
    const item = createElement('li', 'player-item');
    const name = createElement('span', 'player-name', player.name);
    item.append(name);

    if (player.id === hostId) {
      item.append(createElement('span', 'player-badge', 'Host'));
    }

    list.append(item);
  }
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);

  if (className) {
    element.className = className;
  }

  if (text !== undefined) {
    element.textContent = text;
  }

  return element;
}

function showView(name) {
  for (const [viewName, view] of Object.entries(views)) {
    view.hidden = viewName !== name;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function runFormAction(form, eventName, payload) {
  const submit = form.querySelector('button[type="submit"]');
  const originalLabel = submit?.textContent;

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'One moment…';
  }

  const response = await emitWithReply(eventName, payload);

  if (submit) {
    submit.disabled = false;
    submit.textContent = originalLabel;
  }

  if (!response.ok) {
    showToast(response.error.message, true);
  }

  return response;
}

async function runAction(eventName, payload = {}) {
  const response = await emitWithReply(eventName, payload);

  if (!response.ok) {
    showToast(response.error.message, true);
  }

  return response;
}

function emitWithReply(eventName, payload) {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      resolve({
        ok: false,
        error: { message: 'The server took too long to respond. Try again.' },
      });
    }, 6_000);

    socket.emit(eventName, payload, (response) => {
      window.clearTimeout(timeout);
      resolve(response);
    });
  });
}

function setConnectionStatus(isOnline) {
  elements.connectionDot.classList.toggle('is-online', isOnline);
  elements.connectionLabel.textContent = isOnline ? 'Live' : 'Reconnecting';
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4_000);
}
