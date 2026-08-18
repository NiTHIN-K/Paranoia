# Paranoia

A browser-based social party game for 3–12 players. One person asks a secret question, another answers with someone in the room, and a coin flip decides whether the question is revealed.

Paranoia is designed for phones around the same table: there are no accounts, downloads, or saved questions—just a four-digit room code and a live Socket.IO connection.

## Highlights

- Real-time multiplayer rooms with host controls and live player rosters
- Complete ask → answer → reveal → coin-flip game loop
- Private, role-specific state so only the answering player sees the question early
- Fair, rotating turns with random or hand-picked respondents
- Responsive, keyboard-accessible interface built without a frontend framework
- Server-side input validation, safe DOM rendering, security headers, and graceful shutdown
- Disconnect handling, host migration, room cleanup, and automated tests

## How to play

1. A host creates a room and shares its four-digit code.
2. At least three players join with unique names.
3. The current asker writes a question and picks who must answer—or leaves the choice to chance.
4. The chosen player answers with another person in the room.
5. The asker flips the coin. Heads reveals the question; tails keeps it secret.
6. The host starts the next round and the role of asker rotates.

## Run locally

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/NiTHIN-K/Paranoia.git
cd Paranoia
npm install
npm run dev
```

Open `http://localhost:3000`. To test the full flow on one computer, open three browser windows and join the same room from each one.

## Quality checks

```bash
npm run check
npm test
```

The test suite exercises validation, room membership, host migration, private game state, the complete round lifecycle, random selection, and disconnect recovery. CI runs the same checks on every push and pull request.

## Architecture

```text
Browser clients
    ↕ Socket.IO events
Express + Socket.IO server
    ↕ validated commands
In-memory GameManager
```

The UI receives a player-specific snapshot after every state transition. This keeps the browser simple and prevents unrevealed questions from being broadcast to players who should not see them.

```text
public/                 Responsive client and visual system
src/create-server.js    HTTP, Socket.IO, and event orchestration
src/game-manager.js     Room rules, game state, and validation
test/                   Node.js test suite
server.js               Production entry point and shutdown handling
```

## Deployment notes

The server honors the `PORT` and `HOST` environment variables and exposes `GET /health` for platform health checks. Any Node.js host that supports WebSockets can run the application with:

```bash
npm ci
npm start
```

Rooms intentionally live in memory and disappear when the server restarts. That keeps sessions ephemeral and is appropriate for a single-instance party game. A production scale-out would move room state to a shared store and add the Socket.IO Redis adapter.

## License

Released under the [MIT License](LICENSE).
