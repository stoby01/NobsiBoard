const STORAGE_KEY = "dartabend.local.v1";

const colors = ["#0f766e", "#dc2626", "#2563eb", "#ca8a04", "#7c3aed", "#16a34a"];
const dartNumbers = Array.from({ length: 20 }, (_, index) => index + 1);

const defaultState = {
  activeView: "game",
  players: [
    createPlayer("Papa", colors[0]),
    createPlayer("Piet", colors[1])
  ],
  matches: [],
  setup: {
    startScore: 501,
    selectedPlayerIds: []
  },
  activeGame: null,
  message: ""
};

let state = loadState();
let guestPlayers = [];

if (state.setup.selectedPlayerIds.length === 0) {
  state.setup.selectedPlayerIds = state.players.slice(0, 2).map((player) => player.id);
  saveState();
}

const app = document.querySelector("#app");

function createPlayer(name, color) {
  return {
    id: createId(),
    name,
    color,
    createdAt: new Date().toISOString()
  };
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return clone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      ...clone(defaultState),
      ...parsed,
      setup: { ...defaultState.setup, ...(parsed.setup || {}) },
      players: parsed.players && parsed.players.length ? parsed.players : clone(defaultState.players),
      matches: parsed.matches || [],
      activeGame: parsed.activeGame || null,
      message: parsed.message || ""
    };
  } catch {
    return clone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div>
            <h1 class="wordmark" aria-label="NobsiBoard">
              <span aria-hidden="true">N</span><span class="logo-o board-o" aria-hidden="true"></span><span aria-hidden="true">bsiB</span><span class="logo-o dart-o" aria-hidden="true"></span><span aria-hidden="true">ard</span>
            </h1>
            <p class="subtitle">Einfach zaehlen, lokal speichern, spaeter feiern.</p>
          </div>
        </div>
      </header>

      <nav class="tabs" aria-label="Hauptbereiche">
        ${tabButton("game", "Spiel")}
        ${tabButton("stats", "Statistik")}
        ${tabButton("players", "Spieler")}
      </nav>

      <main class="main">
        ${state.activeView === "game" ? renderGameView() : ""}
        ${state.activeView === "stats" ? renderStatsView() : ""}
        ${state.activeView === "players" ? renderPlayersView() : ""}
      </main>
    </div>
  `;
}

function tabButton(view, label) {
  return `<button class="tab ${state.activeView === view ? "active" : ""}" data-action="set-view" data-view="${view}">${label}</button>`;
}

function renderGameView() {
  if (state.activeGame) return renderActiveGame();
  const playerCount = state.setup.selectedPlayerIds.length + guestPlayers.length;

  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Neues Spiel</h2>
          <span class="small-pill">${state.setup.startScore}</span>
        </div>
        <div class="grid">
          <div>
            <p class="hint">Modus</p>
            <div class="segmented" role="group" aria-label="Spielmodus">
              <button class="choice ${state.setup.startScore === 301 ? "active" : ""}" data-action="set-mode" data-score="301">301<span>kurz</span></button>
              <button class="choice ${state.setup.startScore === 501 ? "active" : ""}" data-action="set-mode" data-score="501">501<span>klassisch</span></button>
            </div>
          </div>

          <div>
            <div class="section-title">
              <h2>Spieler</h2>
              <span class="small-pill">${playerCount} dabei</span>
            </div>
            <div class="player-list">
              ${state.players.map((player) => renderPlayerOption(player)).join("")}
              ${guestPlayers.map((player) => renderGuestOption(player)).join("")}
            </div>
            ${state.players.length < 2 ? `<p class="footer-note">Lege mindestens zwei Spieler an.</p>` : ""}
          </div>

          <form class="form-row compact-form" data-action="add-guest-form">
            <input class="text-input" name="guestName" maxlength="18" autocomplete="off" placeholder="Gastname" aria-label="Gastspieler fuer dieses Spiel">
            <button class="secondary" type="submit">Gast dazu</button>
          </form>

          <button class="primary" data-action="start-game" ${playerCount < 2 ? "disabled" : ""}>Spiel starten</button>
        </div>
      </div>

      <aside class="panel panel-pad">
        <div class="section-title">
          <h2>Schnellstart</h2>
        </div>
        <p class="hint">Waehle gespeicherte Spieler aus oder fuege Gaeste nur fuer diese Partie hinzu. Gespeichert werden spaeter nur die festen Spieler.</p>
        <div class="footer-note">Alle Daten bleiben nur auf diesem Geraet.</div>
      </aside>
    </section>
  `;
}

function renderPlayerOption(player) {
  const selected = state.setup.selectedPlayerIds.includes(player.id);
  return `
    <button class="player-option ${selected ? "active" : ""}" data-action="toggle-player" data-player-id="${player.id}">
      <span class="player-name">
        <span class="dot" style="background:${player.color}"></span>
        <span>${escapeHtml(player.name)}</span>
      </span>
      <span class="small-pill">${selected ? "dabei" : "waehlen"}</span>
    </button>
  `;
}

function renderGuestOption(player) {
  return `
    <div class="player-option guest-option">
      <span class="player-name">
        <span class="dot" style="background:${player.color}"></span>
        <span>${escapeHtml(player.name)}</span>
      </span>
      <button class="small-remove" data-action="remove-guest" data-player-id="${player.id}" aria-label="${escapeHtml(player.name)} entfernen">X</button>
    </div>
  `;
}

function renderActiveGame() {
  const game = state.activeGame;
  const current = game.players[game.currentIndex];
  const isFinished = Boolean(game.finishedAt);
  const throws = game.currentThrows || [];
  const roundTotal = throws.reduce((sum, dart) => sum + dart.value, 0);
  const canAddThrow = throws.length < 3;

  return `
    <section class="game-board">
      ${isFinished ? renderWinner(game) : ""}
      <div class="scorecards">
        ${game.players.map((player, index) => renderScoreCard(player, index === game.currentIndex && !isFinished)).join("")}
      </div>

      ${!isFinished ? `
        <div class="turn-panel">
          <div class="turn-head">
            <div>
              <p class="hint" style="color:rgba(255,255,255,.72)">Am Zug</p>
              <div class="turn-player">${escapeHtml(current.name)}</div>
            </div>
            <span class="small-pill">${game.startScore}</span>
          </div>

          <div class="throw-summary">
            <div>
              <span class="throw-label">Runde</span>
              <strong>${roundTotal}</strong>
            </div>
            <div class="throw-list" aria-label="Geworfene Darts">
              ${throws.length ? throws.map((dart) => `<span>${escapeHtml(dart.label)}</span>`).join("") : `<span>1. Dart</span><span>2. Dart</span><span>3. Dart</span>`}
            </div>
          </div>

          <div class="dart-pad" aria-label="Dartfelder">
            <div class="dart-section">
              <div class="pad-title">Single</div>
              <div class="dart-grid">${dartNumbers.map((number) => renderDartButton(number, String(number), "single", canAddThrow)).join("")}</div>
            </div>
            <div class="dart-section">
              <div class="pad-title">Double</div>
              <div class="dart-grid">${dartNumbers.map((number) => renderDartButton(number * 2, `D${number}`, "double", canAddThrow)).join("")}</div>
            </div>
            <div class="dart-section">
              <div class="pad-title">Triple</div>
              <div class="dart-grid">${dartNumbers.map((number) => renderDartButton(number * 3, `T${number}`, "triple", canAddThrow)).join("")}</div>
            </div>
            <div class="bull-grid">
              ${renderDartButton(25, "Bull", "bull", canAddThrow)}
              ${renderDartButton(50, "Bullseye", "bullseye", canAddThrow)}
              ${renderDartButton(0, "Vorbei", "miss", canAddThrow)}
            </div>
          </div>

          <div class="actions">
            <button class="primary" data-action="submit-round" ${throws.length === 0 ? "disabled" : ""}>Runde speichern</button>
            <button class="secondary" data-action="remove-last-dart" ${throws.length === 0 ? "disabled" : ""}>Wurf zurueck</button>
            <button class="secondary" data-action="undo" ${game.history.length === 0 ? "disabled" : ""}>Runde zurueck</button>
            <button class="ghost" data-action="clear-throws">Runde leeren</button>
            <button class="danger" data-action="cancel-game">Spiel abbrechen</button>
          </div>
        </div>
      ` : ""}

      ${state.message ? `<div class="message">${escapeHtml(state.message)}</div>` : ""}
    </section>
  `;
}

function renderDartButton(value, label, type, enabled) {
  return `<button class="dart-button ${type}" data-action="add-dart" data-value="${value}" data-label="${label}" ${enabled ? "" : "disabled"}>${label}</button>`;
}

function renderScoreCard(player, active) {
  return `
    <article class="scorecard ${active ? "active" : ""}" style="--player-color:${player.color}">
      <div class="scorecard-head">
        <div class="player-name">
          <span class="dot" style="background:${player.color}"></span>
          <strong>${escapeHtml(player.name)}</strong>
        </div>
        ${active ? `<span class="turn-badge">DRAN</span>` : ""}
      </div>
      <div class="remaining">${player.remaining}</div>
      <div class="metric-line">Runden: ${player.rounds} - Bestwurf: ${player.highestThrow}</div>
    </article>
  `;
}

function renderWinner(game) {
  const winner = game.players.find((player) => player.id === game.winnerId);
  return `
    <div class="winner">
      <h2>${escapeHtml(winner ? winner.name : "Gewinner")} gewinnt!</h2>
      <p>Das Spiel wurde gespeichert und ist jetzt in der Statistik.</p>
      <button class="primary" data-action="new-game">Neues Spiel</button>
    </div>
  `;
}

function renderStatsView() {
  const stats = getStats();
  const ranked = [...stats.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.average - a.average);
  const recent = [...state.matches].slice(-6).reverse();

  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Rangliste</h2>
          <span class="small-pill">${state.matches.length} Spiele</span>
        </div>
        <div class="table">
          ${ranked.length ? ranked.map((row, index) => renderRankRow(row, index)).join("") : `<div class="empty">Noch keine gespeicherten Spiele.</div>`}
        </div>
      </div>

      <div class="grid">
        <div class="panel panel-pad">
          <div class="section-title">
            <h2>Bestwerte</h2>
          </div>
          ${renderBestStats(ranked)}
        </div>

        <div class="panel panel-pad">
          <div class="section-title">
            <h2>Letzte Spiele</h2>
          </div>
          <div class="table">
            ${recent.length ? recent.map(renderHistoryRow).join("") : `<div class="empty">Hier erscheinen spaeter die letzten Partien.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderRankRow(row, index) {
  return `
    <article class="rank-row">
      <div class="rank-number">${index + 1}</div>
      <div>
        <div class="player-name">
          <span class="dot" style="background:${row.color}"></span>
          <strong>${escapeHtml(row.name)}</strong>
        </div>
        <div class="metric-line">${row.wins} Siege - ${row.games} Spiele - Schnitt ${row.average}</div>
      </div>
      <span class="small-pill">${row.points} Pkt</span>
    </article>
  `;
}

function renderBestStats(ranked) {
  const mostWins = [...ranked].sort((a, b) => b.wins - a.wins)[0];
  const highest = [...ranked].sort((a, b) => b.highestThrow - a.highestThrow)[0];
  const bestAverage = [...ranked].filter((row) => row.rounds > 0).sort((a, b) => b.average - a.average)[0];
  const played = state.matches.length;

  return `
    <div class="stats-grid">
      <div class="stat-box"><span class="stat-value">${played}</span><span class="stat-label">Spiele</span></div>
      <div class="stat-box"><span class="stat-value">${mostWins ? escapeHtml(mostWins.name) : "-"}</span><span class="stat-label">Meiste Siege</span></div>
      <div class="stat-box"><span class="stat-value">${highest ? highest.highestThrow : 0}</span><span class="stat-label">Hoechster Wurf</span></div>
      <div class="stat-box"><span class="stat-value">${bestAverage ? bestAverage.average : 0}</span><span class="stat-label">Bester Schnitt</span></div>
    </div>
  `;
}

function renderHistoryRow(match) {
  const winner = state.players.find((player) => player.id === match.winnerId) || match.players.find((player) => player.id === match.winnerId);
  const date = new Date(match.finishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `
    <article class="history-row">
      <div>
        <strong>${escapeHtml(winner ? winner.name : "Unbekannt")} gewonnen</strong>
        <div class="metric-line">${date} - ${match.startScore} - ${match.players.map((player) => escapeHtml(player.name)).join(" gegen ")}</div>
      </div>
      <span class="small-pill">+3</span>
    </article>
  `;
}

function renderPlayersView() {
  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Spieler</h2>
          <span class="small-pill">${state.players.length}</span>
        </div>
        <div class="table">
          ${state.players.map(renderPlayerRow).join("")}
        </div>
      </div>

      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Neu anlegen</h2>
        </div>
        <form class="form-row" data-action="add-player-form">
          <input class="text-input" name="playerName" maxlength="18" autocomplete="off" placeholder="Name, z. B. Opa" aria-label="Neuer Spielername">
          <button class="primary" type="submit">Hinzufuegen</button>
        </form>
        <p class="footer-note">Tipp: Kurze Namen sind im Spiel am besten lesbar.</p>
      </div>
    </section>
  `;
}

function renderPlayerRow(player) {
  const stat = getStats().get(player.id);
  return `
    <article class="player-row">
      <div>
        <div class="player-name">
          <span class="dot" style="background:${player.color}"></span>
          <strong>${escapeHtml(player.name)}</strong>
        </div>
        <div class="metric-line">${stat ? stat.games : 0} Spiele - ${stat ? stat.wins : 0} Siege - ${stat ? stat.points : 0} Punkte</div>
      </div>
      <div class="row-actions">
        <button class="icon-button" title="Umbenennen" aria-label="${escapeHtml(player.name)} umbenennen" data-action="rename-player" data-player-id="${player.id}">A</button>
        <button class="icon-button" title="Loeschen" aria-label="${escapeHtml(player.name)} loeschen" data-action="delete-player" data-player-id="${player.id}">X</button>
      </div>
    </article>
  `;
}

function getStats() {
  const stats = new Map();
  state.players.forEach((player) => {
    stats.set(player.id, {
      id: player.id,
      name: player.name,
      color: player.color,
      games: 0,
      wins: 0,
      losses: 0,
      points: 0,
      throwsTotal: 0,
      rounds: 0,
      highestThrow: 0,
      average: 0
    });
  });

  state.matches.forEach((match) => {
    match.players.forEach((snapshot) => {
      const row = stats.get(snapshot.id);
      if (!row) return;
      row.games += 1;
      row.rounds += snapshot.rounds;
      row.throwsTotal += snapshot.throwsTotal;
      row.highestThrow = Math.max(row.highestThrow, snapshot.highestThrow);
      if (snapshot.id === match.winnerId) {
        row.wins += 1;
        row.points += 3;
      } else {
        row.losses += 1;
      }
    });
  });

  stats.forEach((row) => {
    row.average = row.rounds ? round(row.throwsTotal / row.rounds) : 0;
  });

  return stats;
}

function startGame() {
  const playerCount = state.setup.selectedPlayerIds.length + guestPlayers.length;
  if (playerCount < 2) return;
  const selected = state.setup.selectedPlayerIds
    .map((id) => state.players.find((player) => player.id === id))
    .filter(Boolean);
  const allPlayers = [...selected, ...guestPlayers];
  if (allPlayers.length < 2) return;

  state.activeGame = {
    id: createId(),
    startScore: state.setup.startScore,
    currentIndex: 0,
    currentThrows: [],
    history: [],
    createdAt: new Date().toISOString(),
    finishedAt: null,
    winnerId: null,
    players: allPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      guest: Boolean(player.guest),
      remaining: state.setup.startScore,
      rounds: 0,
      throwsTotal: 0,
      highestThrow: 0
    }))
  };
  guestPlayers = [];
  state.message = "";
  saveAndRender();
}

function submitRound() {
  const game = state.activeGame;
  if (!game || game.finishedAt) return;
  const throws = game.currentThrows || [];
  if (throws.length === 0) {
    state.message = "Bitte erst mindestens einen Dart auswaehlen.";
    saveAndRender();
    return;
  }
  const score = throws.reduce((sum, dart) => sum + dart.value, 0);

  const player = game.players[game.currentIndex];
  const before = clone(game);
  const nextRemaining = player.remaining - score;

  game.history.push(before);
  player.rounds += 1;

  if (nextRemaining < 0) {
    state.message = `${player.name} ist ueberworfen. Runde zaehlt als 0.`;
  } else {
    player.remaining = nextRemaining;
    player.throwsTotal += score;
    player.highestThrow = Math.max(player.highestThrow, score);
    state.message = score === 180 ? "180! Sehr stark." : "";
  }

  game.currentThrows = [];

  if (player.remaining === 0) {
    game.finishedAt = new Date().toISOString();
    game.winnerId = player.id;
    state.matches.push({
      id: game.id,
      startScore: game.startScore,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      winnerId: game.winnerId,
      players: game.players.map((snapshot) => ({ ...snapshot }))
    });
    state.message = "";
  } else {
    game.currentIndex = (game.currentIndex + 1) % game.players.length;
  }

  saveAndRender();
}

function undo() {
  const game = state.activeGame;
  if (!game || !game.history.length) return;
  state.activeGame = game.history.pop();
  state.message = "Letzte Eingabe wurde zurueckgenommen.";
  saveAndRender();
}

function addDart(value, label) {
  const game = state.activeGame;
  if (!game || game.finishedAt) return;
  if (!game.currentThrows) game.currentThrows = [];
  if (game.currentThrows.length >= 3) return;
  game.currentThrows.push({ value: Number(value), label });
  state.message = "";
  saveAndRender();
}

function removeLastDart() {
  const game = state.activeGame;
  if (!game || !game.currentThrows || game.currentThrows.length === 0) return;
  game.currentThrows.pop();
  saveAndRender();
}

function clearThrows() {
  if (!state.activeGame) return;
  state.activeGame.currentThrows = [];
  saveAndRender();
}

function togglePlayer(id) {
  const selected = state.setup.selectedPlayerIds;
  if (selected.includes(id)) {
    state.setup.selectedPlayerIds = selected.filter((playerId) => playerId !== id);
  } else {
    state.setup.selectedPlayerIds = [...selected, id];
  }
  saveAndRender();
}

function addGuest(name) {
  const clean = name.trim();
  if (!clean) return;
  const color = colors[(state.players.length + guestPlayers.length) % colors.length];
  guestPlayers.push({
    id: `guest-${createId()}`,
    name: `${clean} (Gast)`,
    color,
    guest: true
  });
  render();
}

function removeGuest(id) {
  guestPlayers = guestPlayers.filter((player) => player.id !== id);
  render();
}

function addPlayer(name) {
  const clean = name.trim();
  if (!clean) return;
  const color = colors[state.players.length % colors.length];
  const player = createPlayer(clean, color);
  state.players.push(player);
  if (state.setup.selectedPlayerIds.length < 2) state.setup.selectedPlayerIds.push(player.id);
  saveAndRender();
}

function renamePlayer(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  const next = prompt("Neuer Name:", player.name);
  if (!next || !next.trim()) return;
  player.name = next.trim().slice(0, 18);
  if (state.activeGame) {
    state.activeGame.players.forEach((snapshot) => {
      if (snapshot.id === id) snapshot.name = player.name;
    });
  }
  saveAndRender();
}

function deletePlayer(id) {
  if (state.players.length <= 2) {
    state.message = "Mindestens zwei Spieler bleiben erhalten.";
    state.activeView = "game";
    saveAndRender();
    return;
  }
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  if (!confirm(`${player.name} wirklich loeschen? Alte Spiele bleiben in der Historie.`)) return;
  state.players = state.players.filter((item) => item.id !== id);
  state.setup.selectedPlayerIds = state.setup.selectedPlayerIds.filter((playerId) => playerId !== id);
  saveAndRender();
}

function cancelGame() {
  if (!state.activeGame) return;
  if (!confirm("Aktuelles Spiel abbrechen?")) return;
  state.activeGame = null;
  state.message = "";
  saveAndRender();
}

function saveAndRender() {
  saveState();
  render();
}

function round(number) {
  return Math.round(number * 10) / 10;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "set-view") {
    state.activeView = button.dataset.view;
    state.message = "";
    saveAndRender();
  }
  if (action === "set-mode") {
    state.setup.startScore = Number(button.dataset.score);
    saveAndRender();
  }
  if (action === "toggle-player") togglePlayer(button.dataset.playerId);
  if (action === "remove-guest") removeGuest(button.dataset.playerId);
  if (action === "start-game") startGame();
  if (action === "add-dart") addDart(button.dataset.value, button.dataset.label);
  if (action === "remove-last-dart") removeLastDart();
  if (action === "clear-throws") clearThrows();
  if (action === "submit-round") submitRound();
  if (action === "undo") undo();
  if (action === "cancel-game") cancelGame();
  if (action === "new-game") {
    state.activeGame = null;
    state.message = "";
    saveAndRender();
  }
  if (action === "rename-player") renamePlayer(button.dataset.playerId);
  if (action === "delete-player") deletePlayer(button.dataset.playerId);
});

document.addEventListener("submit", (event) => {
  const playerForm = event.target.closest("[data-action='add-player-form']");
  if (playerForm) {
    event.preventDefault();
    addPlayer(new FormData(playerForm).get("playerName"));
    return;
  }

  const guestForm = event.target.closest("[data-action='add-guest-form']");
  if (guestForm) {
    event.preventDefault();
    addGuest(new FormData(guestForm).get("guestName"));
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && state.activeGame && state.activeView === "game") {
    event.preventDefault();
    submitRound();
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

render();
