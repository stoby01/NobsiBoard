const STORAGE_KEY = "dartabend.local.v1";
const DEFAULT_FAMILY_CODE = "NOBSI-DART-8K4P";

const firebaseConfig = {
  apiKey: "AIzaSyAXzYL6c9-XyN_zv7K8VTyAfclxSx4Ta4Y",
  authDomain: "nobsiboard.firebaseapp.com",
  projectId: "nobsiboard",
  storageBucket: "nobsiboard.firebasestorage.app",
  messagingSenderId: "71935410937",
  appId: "1:71935410937:web:523dc03a75ecbc89cbd828"
};

const colors = ["#0f766e", "#dc2626", "#2563eb", "#ca8a04", "#7c3aed", "#16a34a"];
const dartNumbers = Array.from({ length: 20 }, (_, index) => index + 1);
const avatarOptions = {
  skin: ["#f2c29b", "#d99a6c", "#8d5524", "#f7d7b5", "#c68642", "#ffdbac"],
  hair: ["short", "spike", "side", "cap", "bald", "mohawk", "curls", "sweep"],
  hairColor: ["#111827", "#5b341f", "#9a6a2f", "#d6a33a", "#e5e7eb", "#7f1d1d"],
  hairTexture: ["plain", "shine", "streaks", "salt"],
  brows: ["soft", "thick", "focus", "wild"],
  eyes: ["normal", "happy", "focus", "sleepy", "wide"],
  mouth: ["smile", "grin", "focus", "open", "smirk"],
  facialHair: ["none", "stache", "goatee", "beard", "full", "chops"],
  beardTexture: ["plain", "shine", "streaks", "salt"],
  shirt: ["#0f766e", "#dc2626", "#2563eb", "#ca8a04", "#7c3aed", "#16a34a", "#111827", "#f97316"],
  shirtPattern: ["plain", "stripe", "sash", "dots"],
  glasses: ["no", "round", "square", "sun"],
  accessory: ["none", "dart", "medal", "star"]
};

const defaultState = {
  activeView: "game",
  players: [
    createPlayer("Papa", colors[0]),
    createPlayer("Piet", colors[1])
  ],
  matches: [],
  setup: {
    startScore: 501,
    checkout: "straight",
    selectedPlayerIds: []
  },
  sync: {
    enabled: true,
    familyCode: DEFAULT_FAMILY_CODE,
    lastSyncedAt: "",
    deletedPlayerIds: []
  },
  activeGame: null,
  message: ""
};

let state = loadState();
let guestPlayers = [];
let avatarEditorPlayerId = null;
let activeStatsPlayerId = null;
let deferredInstallPrompt = null;
let installHelpOpen = false;
let familyCodeEditorOpen = false;
let updateReady = false;
let updateWorker = null;
let updateReloading = false;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebasePersistenceTried = false;
let syncTimer = null;
let syncRunning = false;
let syncRuntime = {
  status: navigator.onLine ? "syncing" : "offline",
  detail: navigator.onLine ? "Familien-Daten werden geladen." : "Offline. Ergebnisse werden spaeter automatisch gesendet.",
  error: ""
};

if (state.setup.selectedPlayerIds.length === 0) {
  state.setup.selectedPlayerIds = state.players.slice(0, 2).map((player) => player.id);
  saveState();
}

const app = document.querySelector("#app");

function createPlayer(name, color) {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name,
    color,
    avatar: createDefaultAvatar(color),
    createdAt: now,
    updatedAt: now
  };
}

function createDefaultAvatar(shirtColor) {
  return {
    skin: "#f2c29b",
    hair: "short",
    hairColor: "#111827",
    eyes: "normal",
    mouth: "smile",
    facialHair: "none",
    hairTexture: "plain",
    beardTexture: "plain",
    brows: "soft",
    glasses: "no",
    shirt: shirtColor || colors[0],
    shirtPattern: "plain",
    accessory: "none"
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
      sync: normalizeSync(parsed.sync),
      players: normalizePlayers(parsed.players && parsed.players.length ? parsed.players : clone(defaultState.players)),
      matches: parsed.matches || [],
      activeGame: parsed.activeGame || null,
      message: parsed.message || ""
    };
  } catch {
    return clone(defaultState);
  }
}

function normalizeSync(sync) {
  const familyCode = normalizeFamilyCode(sync && sync.familyCode ? sync.familyCode : DEFAULT_FAMILY_CODE);
  return {
    ...defaultState.sync,
    ...(sync || {}),
    enabled: true,
    familyCode,
    deletedPlayerIds: Array.isArray(sync && sync.deletedPlayerIds) ? sync.deletedPlayerIds : []
  };
}

function normalizePlayers(players) {
  return players.map((player, index) => ({
    ...player,
    id: player.id || createId(),
    name: String(player.name || "Spieler").slice(0, 18),
    color: player.color || colors[index % colors.length],
    avatar: normalizeAvatar(player.avatar, player.color || colors[index % colors.length]),
    createdAt: player.createdAt || new Date().toISOString(),
    updatedAt: player.updatedAt || player.createdAt || new Date().toISOString()
  }));
}

function normalizeAvatar(avatar, fallbackColor) {
  const base = createDefaultAvatar(fallbackColor);
  const source = { ...(avatar || {}) };
  if (source.glasses === "yes") source.glasses = "round";
  Object.keys(avatarOptions).forEach((field) => {
    if (avatarOptions[field].includes(source[field])) {
      base[field] = source[field];
    }
  });
  return base;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    state.message = "Speicher ist voll. Bitte alte Browserdaten pruefen.";
  }
}

function normalizeFamilyCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 36);
}

function isSyncEnabled() {
  return Boolean(state.sync && state.sync.enabled && state.sync.familyCode);
}

function getSyncLabel() {
  if (!isSyncEnabled()) return "Familie";
  if (syncRuntime.status === "syncing") return "Wird synchronisiert";
  if (syncRuntime.status === "synced") return "Synchron";
  if (syncRuntime.status === "offline") return "Offline bereit";
  if (syncRuntime.status === "error") return "Sync-Fehler";
  return "Familie verbunden";
}

function getLastSyncText() {
  if (!state.sync.lastSyncedAt) return "Noch nicht synchronisiert.";
  return `Zuletzt: ${new Date(state.sync.lastSyncedAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`;
}

function setSyncRuntime(status, detail, error = "", shouldRender = true) {
  syncRuntime = { status, detail, error };
  if (shouldRender && app && app.innerHTML) renderMainOnly();
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div>
            <h1 class="header-logo">
              <img src="./header-transparent.png" alt="NobsiBoard">
            </h1>
            <p class="subtitle">Einfach zaehlen, lokal speichern, spaeter feiern.</p>
          </div>
        </div>
        ${renderInstallButton()}
      </header>

      <nav class="tabs" aria-label="Hauptbereiche">
        ${tabButton("game", "Spiel")}
        ${tabButton("stats", "Statistik")}
        ${tabButton("players", "Spieler")}
      </nav>
      ${renderUpdateNotice()}

      <main class="main">
        ${renderMainContent()}
      </main>
      <div id="overlay-root">
        ${renderOverlays()}
      </div>
    </div>
  `;
}

function renderMainContent() {
  if (state.activeView === "game") return renderGameView();
  if (state.activeView === "stats") return renderStatsView();
  if (state.activeView === "players") return renderPlayersView();
  return "";
}

function renderOverlays() {
  return `
    ${avatarEditorPlayerId ? renderAvatarEditor() : ""}
    ${installHelpOpen ? renderInstallHelp() : ""}
    ${familyCodeEditorOpen ? renderFamilyCodeEditor() : ""}
  `;
}

function renderMainOnly() {
  const main = app.querySelector(".main");
  if (!main) {
    render();
    return;
  }
  main.innerHTML = renderMainContent();
  const overlayRoot = app.querySelector("#overlay-root");
  if (overlayRoot) overlayRoot.innerHTML = renderOverlays();
}

function renderInstallButton() {
  if (isStandaloneApp()) {
    return `<span class="install-state">Installiert</span>`;
  }
  return `<button class="install-button" data-action="install-app">App installieren</button>`;
}

function renderUpdateNotice() {
  if (!updateReady) return "";
  return `
    <div class="update-notice" role="status">
      <div>
        <strong>Update bereit</strong>
        <p>Neue Version laden?</p>
      </div>
      <button class="primary compact-button" data-action="apply-update">Laden</button>
    </div>
  `;
}

function renderInstallHelp() {
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  return `
    <div class="modal-backdrop">
      <section class="install-card" role="dialog" aria-modal="true" aria-label="App installieren">
        <div class="editor-head">
          <div>
            <h2>App installieren</h2>
            <p class="hint">${isiOS ? "Auf dem iPhone geht das ueber das Teilen-Menue." : "Falls kein Installationsfenster erscheint, nutze das Browser-Menue."}</p>
          </div>
          <button class="icon-button" data-action="close-install-help" aria-label="Schliessen">X</button>
        </div>
        <div class="install-steps">
          ${isiOS ? `
            <div><strong>1</strong><span>In Safari oeffnen.</span></div>
            <div><strong>2</strong><span>Teilen-Symbol antippen.</span></div>
            <div><strong>3</strong><span>Zum Home-Bildschirm waehlen.</span></div>
          ` : `
            <div><strong>1</strong><span>Browser-Menue oeffnen.</span></div>
            <div><strong>2</strong><span>App installieren oder Zum Startbildschirm waehlen.</span></div>
            <div><strong>3</strong><span>NobsiBoard ueber das neue Symbol starten.</span></div>
          `}
        </div>
        <button class="primary" data-action="close-install-help">Verstanden</button>
      </section>
    </div>
  `;
}

function isStandaloneApp() {
  return Boolean(
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    || (window.navigator && window.navigator.standalone === true)
    || navigator.standalone === true
  );
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
            <p class="hint">Checkout</p>
            <div class="segmented" role="group" aria-label="Checkout-Regel">
              <button class="choice ${state.setup.checkout === "straight" ? "active" : ""}" data-action="set-checkout" data-checkout="straight">Einfach<span>genau 0</span></button>
              <button class="choice ${state.setup.checkout === "double" ? "active" : ""}" data-action="set-checkout" data-checkout="double">Double Out<span>mit Double</span></button>
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
        ${renderSyncPanel()}
      </aside>
    </section>
  `;
}

function renderSyncPanel() {
  return `
    <div class="sync-panel">
      <div class="sync-row">
        <span class="sync-dot ${syncRuntime.status}"></span>
        <div>
          <strong>${getSyncLabel()}</strong>
          <p class="hint">${escapeHtml(syncRuntime.detail || getLastSyncText())}</p>
        </div>
      </div>
      <div class="sync-code">Familie ${escapeHtml(state.sync.familyCode)}</div>
      <div class="sync-actions">
        <button class="secondary compact-button" data-action="sync-now" ${syncRunning ? "disabled" : ""}>Jetzt pruefen</button>
        <button class="ghost compact-button" data-action="open-family-code">Code aendern</button>
      </div>
    </div>
  `;
}

function renderFamilyCodeEditor() {
  return `
    <div class="modal-backdrop">
      <section class="install-card" role="dialog" aria-modal="true" aria-label="Familien-Code aendern">
        <div class="editor-head">
          <div>
            <h2>Familien-Code</h2>
            <p class="hint">Alle Geraete mit demselben Code teilen Spieler und Statistiken.</p>
          </div>
          <button class="icon-button" data-action="close-family-code" aria-label="Schliessen">X</button>
        </div>
        <form class="sync-form" data-action="family-code-form">
          <input class="text-input" name="familyCode" maxlength="36" autocomplete="off" autocapitalize="characters" value="${escapeHtml(state.sync.familyCode)}" aria-label="Familien-Code">
          <button class="primary" type="submit">Code speichern</button>
        </form>
        <p class="footer-note">Aktuelle Daten bleiben auf diesem Handy und werden mit dem neuen Code abgeglichen.</p>
      </section>
    </div>
  `;
}

function renderPlayerOption(player) {
  const selected = state.setup.selectedPlayerIds.includes(player.id);
  return `
    <button class="player-option ${selected ? "active" : ""}" data-action="toggle-player" data-player-id="${player.id}">
      <span class="player-name">
        ${renderAvatar(player, "tiny")}
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
        ${renderAvatar(player, "tiny")}
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
            <div class="turn-rules">
              <span class="small-pill">${game.startScore}</span>
              <span class="small-pill">${game.checkout === "double" ? "Double Out" : "Einfach"}</span>
            </div>
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
  return `<button class="dart-button ${type}" data-action="add-dart" data-value="${value}" data-label="${label}" data-type="${type}" ${enabled ? "" : "disabled"}>${label}</button>`;
}

function renderScoreCard(player, active) {
  const reaction = state.activeGame && state.activeGame.lastReaction && state.activeGame.lastReaction.playerId === player.id
    ? state.activeGame.lastReaction.type
    : "";
  return `
    <article class="scorecard ${active ? "active" : ""}" style="--player-color:${player.color}">
      <div class="scorecard-head">
        <div class="player-name">
          ${renderAvatar(player, "small", active ? "active" : reaction)}
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
      <div class="winner-line">
        ${winner ? renderAvatar(winner, "small", "winner") : ""}
        <h2>${escapeHtml(winner ? winner.name : "Gewinner")} gewinnt!</h2>
      </div>
      <p>Das Spiel wurde gespeichert und ist jetzt in der Statistik.</p>
      <button class="primary" data-action="new-game">Neues Spiel</button>
    </div>
  `;
}

function renderStatsView() {
  const stats = getStats();
  const ranked = [...stats.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.average - a.average);
  const recent = [...state.matches].slice(-6).reverse();

  if (activeStatsPlayerId) {
    const detail = stats.get(activeStatsPlayerId);
    if (detail) return renderPlayerStatsView(detail, recent);
    activeStatsPlayerId = null;
  }

  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Globale Statistik</h2>
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
    <button class="rank-row rank-button" data-action="show-player-stats" data-player-id="${row.id}">
      <div class="rank-number">${index + 1}</div>
      <div>
        <div class="player-name">
          ${renderAvatar(row, "tiny")}
          <strong>${escapeHtml(row.name)}</strong>
        </div>
        <div class="metric-line">${row.wins} Siege - ${row.games} Spiele - Schnitt ${row.average}</div>
      </div>
      <span class="small-pill">${row.points} Pkt</span>
    </button>
  `;
}

function renderPlayerStatsView(row) {
  const playerMatches = [...state.matches]
    .filter((match) => match.players.some((player) => player.id === row.id))
    .slice(-6)
    .reverse();
  const topDarts = getTopDarts(row.dartCounts, 8);

  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <button class="secondary compact-button" data-action="back-to-global">Zurueck</button>
          <span class="small-pill">${row.points} Punkte</span>
        </div>
        <div class="player-detail-head">
          ${renderAvatar(row, "large", "active")}
          <div>
            <h2>${escapeHtml(row.name)}</h2>
            <p class="hint">${row.games} Spiele - ${row.wins} Siege - ${row.losses} Niederlagen</p>
          </div>
        </div>

        <div class="stats-grid personal-grid">
          <div class="stat-box"><span class="stat-value">${row.average}</span><span class="stat-label">Schnitt pro Runde</span></div>
          <div class="stat-box"><span class="stat-value">${row.highestThrow}</span><span class="stat-label">Bester Wurf</span></div>
          <div class="stat-box"><span class="stat-value">${row.bestRound}</span><span class="stat-label">Beste Runde</span></div>
          <div class="stat-box"><span class="stat-value">${row.totalDarts}</span><span class="stat-label">Darts erfasst</span></div>
          <div class="stat-box"><span class="stat-value">${row.typeCounts.triple}</span><span class="stat-label">Triple getroffen</span></div>
          <div class="stat-box"><span class="stat-value">${row.typeCounts.double}</span><span class="stat-label">Double getroffen</span></div>
        </div>
      </div>

      <div class="grid">
        <div class="panel panel-pad">
          <div class="section-title">
            <h2>Haeufige Felder</h2>
          </div>
          <div class="dart-frequency">
            ${topDarts.length ? topDarts.map((item) => renderDartFrequency(item, row.totalDarts)).join("") : `<div class="empty">Noch keine einzelnen Dartfelder gespeichert.</div>`}
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="section-title">
            <h2>Wurfarten</h2>
          </div>
          <div class="stats-grid">
            <div class="stat-box"><span class="stat-value">${row.typeCounts.single}</span><span class="stat-label">Single</span></div>
            <div class="stat-box"><span class="stat-value">${row.typeCounts.double}</span><span class="stat-label">Double</span></div>
            <div class="stat-box"><span class="stat-value">${row.typeCounts.triple}</span><span class="stat-label">Triple</span></div>
            <div class="stat-box"><span class="stat-value">${row.typeCounts.bull + row.typeCounts.bullseye}</span><span class="stat-label">Bull</span></div>
            <div class="stat-box"><span class="stat-value">${row.typeCounts.miss}</span><span class="stat-label">Vorbei</span></div>
            <div class="stat-box"><span class="stat-value">${row.winRate}%</span><span class="stat-label">Siegquote</span></div>
          </div>
        </div>

        <div class="panel panel-pad">
          <div class="section-title">
            <h2>Letzte Spiele</h2>
          </div>
          <div class="table">
            ${playerMatches.length ? playerMatches.map(renderHistoryRow).join("") : `<div class="empty">Noch keine Spiele fuer diesen Spieler.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderDartFrequency(item, totalDarts) {
  const percent = totalDarts ? Math.round((item.count / totalDarts) * 100) : 0;
  return `
    <div class="frequency-row">
      <strong>${escapeHtml(item.label)}</strong>
      <div class="frequency-track"><span style="width:${percent}%"></span></div>
      <span class="small-pill">${item.count}x</span>
    </div>
  `;
}

function getTopDarts(counts, limit) {
  return Object.entries(counts || {})
    .map(([label, count]) => ({ label, count }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
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
        <div class="metric-line">${date} - ${match.startScore} - ${match.checkout === "double" ? "Double Out" : "Einfach"} - ${match.players.map((player) => escapeHtml(player.name)).join(" gegen ")}</div>
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
          ${renderAvatar(player, "tiny")}
          <strong>${escapeHtml(player.name)}</strong>
        </div>
        <div class="metric-line">${stat ? stat.games : 0} Spiele - ${stat ? stat.wins : 0} Siege - ${stat ? stat.points : 0} Punkte</div>
      </div>
      <div class="row-actions">
        <button class="avatar-open-button" title="Avatar erstellen" aria-label="${escapeHtml(player.name)} Avatar erstellen" data-action="open-avatar" data-player-id="${player.id}">Avatar</button>
        <button class="icon-button" title="Umbenennen" aria-label="${escapeHtml(player.name)} umbenennen" data-action="rename-player" data-player-id="${player.id}">A</button>
        <button class="icon-button" title="Loeschen" aria-label="${escapeHtml(player.name)} loeschen" data-action="delete-player" data-player-id="${player.id}">X</button>
      </div>
    </article>
  `;
}

function renderAvatar(player, size = "tiny", reaction = "") {
  const avatar = normalizeAvatar(player.avatar, player.color);
  const classes = [
    "mi-avatar",
    `mi-${size}`,
    `hair-${avatar.hair}`,
    `eyes-${avatar.eyes}`,
    `mouth-${avatar.mouth}`,
    `facial-${avatar.facialHair}`,
    `hairtex-${avatar.hairTexture}`,
    `beardtex-${avatar.beardTexture}`,
    `brows-${avatar.brows}`,
    `shirt-${avatar.shirtPattern}`,
    `accessory-${avatar.accessory}`,
    avatar.glasses !== "no" ? "has-glasses" : "",
    `glasses-${avatar.glasses}`,
    reaction ? `react-${reaction}` : ""
  ].filter(Boolean).join(" ");
  const style = `--skin:${avatar.skin};--hair:${avatar.hairColor};--shirt:${avatar.shirt}`;

  return `
    <span class="${classes}" style="${style}" aria-hidden="true">
      <span class="mi-body"></span>
      <span class="mi-neck"></span>
      <span class="mi-head">
        <span class="mi-ear left"></span>
        <span class="mi-ear right"></span>
        <span class="mi-hair"></span>
        <span class="mi-eye left"></span>
        <span class="mi-eye right"></span>
        <span class="mi-brow left"></span>
        <span class="mi-brow right"></span>
        <span class="mi-glasses"></span>
        <span class="mi-nose"></span>
        <span class="mi-mouth"></span>
        <span class="mi-stache"></span>
        <span class="mi-beard"></span>
      </span>
      <span class="mi-accessory"></span>
    </span>
  `;
}

function renderAvatarEditor() {
  const player = state.players.find((item) => item.id === avatarEditorPlayerId);
  if (!player) return "";
  const avatar = normalizeAvatar(player.avatar, player.color);
  return `
    <div class="modal-backdrop">
      <section class="avatar-editor" role="dialog" aria-modal="true" aria-label="Figur erstellen">
        <div class="editor-head">
          <div>
            <h2>${escapeHtml(player.name)}s Mi</h2>
            <p class="hint">Kleine Figur fuer Spiel und Spielerkarte.</p>
          </div>
          <button class="icon-button" data-action="close-avatar" aria-label="Schliessen">X</button>
        </div>

        <div class="editor-preview">
          ${renderAvatar({ ...player, avatar }, "large", "active")}
        </div>

        ${renderAvatarField("Haut", "skin", avatarOptions.skin, avatar.skin, "color")}
        ${renderAvatarField("Haare", "hair", avatarOptions.hair, avatar.hair, "label")}
        ${renderAvatarField("Haarfarbe", "hairColor", avatarOptions.hairColor, avatar.hairColor, "color")}
        ${renderAvatarField("Haarstruktur", "hairTexture", avatarOptions.hairTexture, avatar.hairTexture, "label")}
        ${renderAvatarField("Augenbrauen", "brows", avatarOptions.brows, avatar.brows, "label")}
        ${renderAvatarField("Augen", "eyes", avatarOptions.eyes, avatar.eyes, "label")}
        ${renderAvatarField("Mund", "mouth", avatarOptions.mouth, avatar.mouth, "label")}
        ${renderAvatarField("Bart", "facialHair", avatarOptions.facialHair, avatar.facialHair, "label")}
        ${renderAvatarField("Bartstruktur", "beardTexture", avatarOptions.beardTexture, avatar.beardTexture, "label")}
        ${renderAvatarField("Brille", "glasses", avatarOptions.glasses, avatar.glasses, "label")}
        ${renderAvatarField("Trikot", "shirt", avatarOptions.shirt, avatar.shirt, "color")}
        ${renderAvatarField("Trikotmuster", "shirtPattern", avatarOptions.shirtPattern, avatar.shirtPattern, "label")}
        ${renderAvatarField("Extra", "accessory", avatarOptions.accessory, avatar.accessory, "label")}
      </section>
    </div>
  `;
}

function renderAvatarField(title, field, values, current, type) {
  return `
    <div class="avatar-field">
      <div class="pad-title">${title}</div>
      <div class="avatar-options">
        ${values.map((value) => {
          const active = value === current;
          const content = type === "color"
            ? `<span class="swatch" style="background:${value}"></span>`
            : escapeHtml(getAvatarLabel(field, value));
          return `<button class="avatar-choice ${active ? "active" : ""}" data-action="set-avatar" data-field="${field}" data-value="${value}" aria-label="${escapeHtml(title)} ${escapeHtml(getAvatarLabel(field, value))}">${content}</button>`;
        }).join("")}
      </div>
    </div>
  `;
}

function getAvatarLabel(field, value) {
  const labels = {
    hair: { short: "Kurz", spike: "Wild", side: "Seitlich", cap: "Cap", bald: "Glatze" },
    hairTexture: { plain: "Glatt", shine: "Glanz", streaks: "Straehnen", salt: "Grau" },
    brows: { soft: "Normal", thick: "Dick", focus: "Fokus", wild: "Wild" },
    eyes: { normal: "Normal", happy: "Froh", focus: "Fokus", sleepy: "Muede", wide: "Gross" },
    mouth: { smile: "Lachen", grin: "Grinsen", focus: "Ernst", open: "Oh!", smirk: "Schief" },
    facialHair: { none: "Ohne", stache: "Schnauzer", goatee: "Kinnbart", beard: "Bart", full: "Vollbart", chops: "Koteletten" },
    beardTexture: { plain: "Glatt", shine: "Glanz", streaks: "Straehnen", salt: "Grau" },
    glasses: { no: "Nein", round: "Rund", square: "Eckig", sun: "Sonne" },
    shirtPattern: { plain: "Glatt", stripe: "Streifen", sash: "Schraeg", dots: "Punkte" },
    accessory: { none: "Ohne", dart: "Dart", medal: "Medaille", star: "Stern" }
  };
  return labels[field] && labels[field][value] ? labels[field][value] : value;
}

function getStats() {
  const stats = new Map();
  state.players.forEach((player) => {
    stats.set(player.id, {
      id: player.id,
      name: player.name,
      color: player.color,
      avatar: normalizeAvatar(player.avatar, player.color),
      games: 0,
      wins: 0,
      losses: 0,
      points: 0,
      throwsTotal: 0,
      rounds: 0,
      highestThrow: 0,
      average: 0,
      bestRound: 0,
      winRate: 0,
      totalDarts: 0,
      dartCounts: {},
      typeCounts: createTypeCounts(),
      roundScores: []
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
      row.totalDarts += snapshot.totalDarts || 0;
      mergeCounts(row.dartCounts, snapshot.dartCounts);
      mergeCounts(row.typeCounts, snapshot.typeCounts);
      if (Array.isArray(snapshot.roundScores)) {
        row.roundScores.push(...snapshot.roundScores);
      }
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
    row.bestRound = row.roundScores.length ? Math.max(...row.roundScores) : row.highestThrow;
    row.winRate = row.games ? Math.round((row.wins / row.games) * 100) : 0;
  });

  return stats;
}

function mergeCounts(target, source) {
  Object.entries(source || {}).forEach(([key, value]) => {
    target[key] = (target[key] || 0) + Number(value || 0);
  });
}

function openFamilyCodeEditor() {
  familyCodeEditorOpen = true;
  render();
}

function closeFamilyCodeEditor() {
  familyCodeEditorOpen = false;
  render();
}

function changeFamilyCode(code) {
  const familyCode = normalizeFamilyCode(code);
  if (!familyCode || familyCode.length < 4) {
    state.message = "Bitte einen Familien-Code mit mindestens 4 Zeichen eingeben.";
    familyCodeEditorOpen = false;
    saveAndRender();
    return;
  }

  if (familyCode === state.sync.familyCode) {
    familyCodeEditorOpen = false;
    render();
    return;
  }

  state.sync.enabled = true;
  state.sync.familyCode = familyCode;
  state.sync.lastSyncedAt = "";
  state.sync.deletedPlayerIds = [];
  state.message = "Familien-Code geaendert.";
  familyCodeEditorOpen = false;
  setSyncRuntime(navigator.onLine ? "syncing" : "offline", navigator.onLine ? "Neue Familie wird abgeglichen." : "Offline. Der neue Code wird spaeter abgeglichen.", "", false);
  saveAndRender();
  queueSync();
}

function queueSync() {
  if (!isSyncEnabled()) return;
  if (!navigator.onLine) {
    setSyncRuntime("offline", "Offline. Neue Ergebnisse bleiben gespeichert und werden automatisch gesendet.");
    return;
  }
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncWithFirebase({ manual: false });
  }, 700);
}

async function syncWithFirebase({ manual = false } = {}) {
  if (!isSyncEnabled() || syncRunning) return;
  if (!navigator.onLine) {
    const detail = "Offline. Neue Ergebnisse bleiben gespeichert und werden automatisch gesendet.";
    setSyncRuntime("offline", detail, "", false);
    if (manual) state.message = detail;
    saveState();
    renderMainOnly();
    return;
  }
  syncRunning = true;
  setSyncRuntime("syncing", "Spieler und fertige Spiele werden abgeglichen.");

  try {
    const db = await ensureFirebaseSession();
    const familyRef = db.collection("families").doc(state.sync.familyCode);
    await familyRef.set({
      code: state.sync.familyCode,
      app: "NobsiBoard",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await deleteQueuedRemotePlayers(familyRef);
    await pullRemoteData(familyRef);
    await pushLocalData(familyRef);

    state.sync.lastSyncedAt = new Date().toISOString();
    state.message = manual ? "Alles ist aktuell." : state.message;
    setSyncRuntime("synced", getLastSyncText(), "", false);
    saveState();
  } catch (error) {
    const offline = !navigator.onLine || /network|offline|unavailable/i.test(String(error && error.message));
    const detail = offline
      ? "Offline. Neue Ergebnisse bleiben gespeichert und werden automatisch gesendet."
      : "Firebase ist noch nicht erreichbar. Pruefe Regeln und Internet.";
    setSyncRuntime(offline ? "offline" : "error", detail, error && error.message ? error.message : "", false);
    if (manual) state.message = detail;
    saveState();
  } finally {
    syncRunning = false;
    renderMainOnly();
  }
}

async function ensureFirebaseSession() {
  if (!window.firebase || !window.firebase.initializeApp || !window.firebase.firestore || !window.firebase.auth) {
    throw new Error("Firebase SDK wurde nicht geladen.");
  }

  if (!firebaseApp) {
    firebaseApp = window.firebase.apps && window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(firebaseConfig);
    firebaseDb = window.firebase.firestore();
    if (!firebasePersistenceTried) {
      firebasePersistenceTried = true;
      await firebaseDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }
    firebaseAuth = window.firebase.auth();
  }

  if (!firebaseAuth.currentUser) {
    await firebaseAuth.signInAnonymously();
  }

  return firebaseDb;
}

async function pullRemoteData(familyRef) {
  const [playerSnapshot, matchSnapshot] = await Promise.all([
    familyRef.collection("players").get(),
    familyRef.collection("matches").get()
  ]);

  const deletedPlayerIds = playerSnapshot.docs
    .filter((doc) => doc.data() && doc.data().deleted === true)
    .map((doc) => doc.id);
  removeDeletedPlayers(deletedPlayerIds);

  const pendingDeletes = new Set(state.sync.deletedPlayerIds || []);
  const remotePlayers = playerSnapshot.docs
    .filter((doc) => !(doc.data() && doc.data().deleted === true) && !pendingDeletes.has(doc.id))
    .map((doc) => normalizeRemotePlayer(doc.id, doc.data()))
    .filter(Boolean);
  const remoteMatches = matchSnapshot.docs
    .map((doc) => normalizeRemoteMatch(doc.id, doc.data()))
    .filter(Boolean);

  mergeRemotePlayers(remotePlayers);
  mergeRemoteMatches(remoteMatches);
  ensureSelectedPlayers();
  saveState();
}

function removeDeletedPlayers(ids) {
  const deletedIds = new Set(ids || []);
  if (!deletedIds.size) return;
  state.players = state.players.filter((player) => !deletedIds.has(player.id));
  state.setup.selectedPlayerIds = state.setup.selectedPlayerIds.filter((id) => !deletedIds.has(id));
  if (state.activeGame) {
    state.activeGame.players = state.activeGame.players.filter((player) => !deletedIds.has(player.id));
  }
}

function mergeRemotePlayers(remotePlayers) {
  if (!remotePlayers.length) return;

  if (isFreshDefaultLocalState()) {
    state.players = normalizePlayers(remotePlayers);
    return;
  }

  const byId = new Map(normalizePlayers(state.players).map((player) => [player.id, player]));

  remotePlayers.forEach((remotePlayer) => {
    const matchingLocal = byId.get(remotePlayer.id) || findPlayerByName([...byId.values()], remotePlayer.name, remotePlayer.id);
    if (!matchingLocal) {
      byId.set(remotePlayer.id, remotePlayer);
      return;
    }

    if (matchingLocal.id !== remotePlayer.id) {
      migratePlayerId(matchingLocal.id, remotePlayer.id);
      byId.delete(matchingLocal.id);
    }

    byId.set(remotePlayer.id, chooseLatestPlayer({ ...matchingLocal, id: remotePlayer.id }, remotePlayer));
  });

  state.players = [...byId.values()].sort(compareCreatedAt);
}

function mergeRemoteMatches(remoteMatches) {
  const byId = new Map((state.matches || []).map((match) => [match.id, normalizeLocalMatch(match)]));
  remoteMatches.forEach((remoteMatch) => {
    const localMatch = byId.get(remoteMatch.id);
    if (!localMatch || getTime(remoteMatch.finishedAt || remoteMatch.createdAt) > getTime(localMatch.finishedAt || localMatch.createdAt)) {
      byId.set(remoteMatch.id, remoteMatch);
    }
  });
  state.matches = [...byId.values()].sort((a, b) => getTime(a.finishedAt || a.createdAt) - getTime(b.finishedAt || b.createdAt));
}

function findPlayerByName(players, name, excludeId) {
  const key = playerNameKey(name);
  return players.find((player) => player.id !== excludeId && playerNameKey(player.name) === key);
}

function playerNameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function chooseLatestPlayer(localPlayer, remotePlayer) {
  const localTime = getTime(localPlayer.updatedAt || localPlayer.createdAt);
  const remoteTime = getTime(remotePlayer.updatedAt || remotePlayer.createdAt);
  return remoteTime > localTime ? remotePlayer : localPlayer;
}

function migratePlayerId(fromId, toId) {
  state.setup.selectedPlayerIds = state.setup.selectedPlayerIds.map((id) => id === fromId ? toId : id);
  if (state.activeGame) {
    state.activeGame.players.forEach((player) => {
      if (player.id === fromId) player.id = toId;
    });
    if (state.activeGame.winnerId === fromId) state.activeGame.winnerId = toId;
  }
  (state.matches || []).forEach((match) => {
    if (match.winnerId === fromId) match.winnerId = toId;
    (match.players || []).forEach((player) => {
      if (player.id === fromId) player.id = toId;
    });
  });
}

function isFreshDefaultLocalState() {
  if (state.sync.lastSyncedAt || (state.matches && state.matches.length) || state.activeGame) return false;
  if (!state.players || state.players.length !== 2) return false;
  return state.players.some((player) => playerNameKey(player.name) === "papa")
    && state.players.some((player) => playerNameKey(player.name) === "piet");
}

function ensureSelectedPlayers() {
  const existingIds = new Set(state.players.map((player) => player.id));
  state.setup.selectedPlayerIds = state.setup.selectedPlayerIds.filter((id) => existingIds.has(id));
  state.players.forEach((player) => {
    if (state.setup.selectedPlayerIds.length < 2 && !state.setup.selectedPlayerIds.includes(player.id)) {
      state.setup.selectedPlayerIds.push(player.id);
    }
  });
}

async function deleteQueuedRemotePlayers(familyRef) {
  const deletedIds = [...new Set(state.sync.deletedPlayerIds || [])];
  if (!deletedIds.length) return;
  const deletedAt = new Date().toISOString();
  await Promise.all(deletedIds.map((id) => familyRef.collection("players").doc(id).set({
    deleted: true,
    deletedAt,
    updatedAt: deletedAt
  }, { merge: true })));
  state.sync.deletedPlayerIds = [];
}

async function pushLocalData(familyRef) {
  const playerWrites = normalizePlayers(state.players).map((player) => (
    familyRef.collection("players").doc(player.id).set(preparePlayerForRemote(player), { merge: true })
  ));
  const matchWrites = (state.matches || []).map((match) => {
    const normalized = normalizeLocalMatch(match);
    return familyRef.collection("matches").doc(normalized.id).set(prepareMatchForRemote(normalized), { merge: true });
  });
  await Promise.all([...playerWrites, ...matchWrites]);
}

function normalizeRemotePlayer(id, data) {
  if (!data) return null;
  return normalizePlayers([{
    id,
    name: data.name,
    color: data.color,
    avatar: data.avatar,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt
  }])[0];
}

function normalizeLocalMatch(match) {
  return normalizeRemoteMatch(match.id, match);
}

function normalizeRemoteMatch(id, data) {
  if (!data || !id || !Array.isArray(data.players)) return null;
  return {
    id,
    startScore: Number(data.startScore || 501),
    createdAt: data.createdAt || data.finishedAt || new Date().toISOString(),
    finishedAt: data.finishedAt || data.createdAt || new Date().toISOString(),
    checkout: data.checkout === "double" ? "double" : "straight",
    winnerId: data.winnerId || "",
    players: data.players.map((player, index) => ({
      id: player.id || `unknown-${index}`,
      name: String(player.name || "Spieler").slice(0, 24),
      color: player.color || colors[index % colors.length],
      avatar: normalizeAvatar(player.avatar, player.color || colors[index % colors.length]),
      guest: Boolean(player.guest),
      remaining: Number(player.remaining || 0),
      rounds: Number(player.rounds || 0),
      throwsTotal: Number(player.throwsTotal || 0),
      highestThrow: Number(player.highestThrow || 0),
      totalDarts: Number(player.totalDarts || 0),
      dartCounts: player.dartCounts || {},
      typeCounts: { ...createTypeCounts(), ...(player.typeCounts || {}) },
      roundScores: Array.isArray(player.roundScores) ? player.roundScores.map(Number) : []
    }))
  };
}

function preparePlayerForRemote(player) {
  return {
    name: String(player.name || "Spieler").slice(0, 18),
    color: player.color || colors[0],
    avatar: normalizeAvatar(player.avatar, player.color || colors[0]),
    deleted: false,
    createdAt: player.createdAt || new Date().toISOString(),
    updatedAt: player.updatedAt || new Date().toISOString()
  };
}

function prepareMatchForRemote(match) {
  return {
    id: match.id,
    startScore: match.startScore,
    createdAt: match.createdAt,
    finishedAt: match.finishedAt,
    checkout: match.checkout,
    winnerId: match.winnerId,
    players: match.players
  };
}

function compareCreatedAt(a, b) {
  return getTime(a.createdAt) - getTime(b.createdAt);
}

function getTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
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
    checkout: state.setup.checkout || "straight",
    currentIndex: 0,
    currentThrows: [],
    history: [],
    lastReaction: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    winnerId: null,
    players: allPlayers.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      avatar: normalizeAvatar(player.avatar, player.color),
      guest: Boolean(player.guest),
      remaining: state.setup.startScore,
      rounds: 0,
      throwsTotal: 0,
      highestThrow: 0,
      totalDarts: 0,
      dartCounts: {},
      typeCounts: createTypeCounts(),
      roundScores: []
    }))
  };
  guestPlayers = [];
  state.message = "";
  saveAndRender();
}

function submitRound() {
  const game = state.activeGame;
  if (!game || game.finishedAt) return;
  let finishedMatch = false;
  const throws = game.currentThrows || [];
  if (throws.length === 0) {
    state.message = "Bitte erst mindestens einen Dart auswaehlen.";
    renderMainOnly();
    return;
  }
  const score = throws.reduce((sum, dart) => sum + dart.value, 0);

  const player = game.players[game.currentIndex];
  const before = createUndoSnapshot(game);
  const nextRemaining = player.remaining - score;
  const lastDart = throws[throws.length - 1];
  const isDoubleFinish = lastDart && (lastDart.type === "double" || lastDart.type === "bullseye");

  game.history.push(before);
  player.rounds += 1;
  recordDartDetails(player, throws);

  const invalidDoubleOut = game.checkout === "double" && (nextRemaining === 1 || (nextRemaining === 0 && !isDoubleFinish));

  if (nextRemaining < 0 || invalidDoubleOut) {
    game.lastReaction = { playerId: player.id, type: "bust" };
    player.roundScores.push(0);
    state.message = invalidDoubleOut
      ? `Double Out: ${player.name} braucht ein passendes Double.`
      : `${player.name} ist ueberworfen. Runde zaehlt als 0.`;
  } else {
    player.remaining = nextRemaining;
    player.throwsTotal += score;
    player.highestThrow = Math.max(player.highestThrow, score);
    player.roundScores.push(score);
    game.lastReaction = score >= 100 ? { playerId: player.id, type: "big" } : null;
    state.message = score === 180 ? "180! Sehr stark." : "";
  }

  game.currentThrows = [];

  if (player.remaining === 0) {
    game.finishedAt = new Date().toISOString();
    game.winnerId = player.id;
    game.lastReaction = { playerId: player.id, type: "winner" };
    state.matches.push({
      id: game.id,
      startScore: game.startScore,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      checkout: game.checkout,
      winnerId: game.winnerId,
      players: game.players.map((snapshot) => ({ ...snapshot }))
    });
    state.message = "";
    finishedMatch = true;
  } else {
    game.currentIndex = (game.currentIndex + 1) % game.players.length;
  }

  saveAndRenderMain();
  if (finishedMatch) queueSync();
}

function undo() {
  const game = state.activeGame;
  if (!game || !game.history.length) return;
  const previous = game.history.pop();
  state.activeGame = { ...previous, history: game.history };
  state.message = "Letzte Eingabe wurde zurueckgenommen.";
  saveAndRenderMain();
}

function createUndoSnapshot(game) {
  const snapshot = clone(game);
  snapshot.history = [];
  return snapshot;
}

function addDart(value, label, type) {
  const game = state.activeGame;
  if (!game || game.finishedAt) return;
  if (!game.currentThrows) game.currentThrows = [];
  if (game.currentThrows.length >= 3) return;
  game.currentThrows.push({ value: Number(value), label, type });
  state.message = "";
  renderMainOnly();
}

function createTypeCounts() {
  return { single: 0, double: 0, triple: 0, bull: 0, bullseye: 0, miss: 0 };
}

function recordDartDetails(player, throws) {
  if (!player.dartCounts) player.dartCounts = {};
  if (!player.typeCounts) player.typeCounts = createTypeCounts();
  if (!player.roundScores) player.roundScores = [];
  if (!player.totalDarts) player.totalDarts = 0;

  throws.forEach((dart) => {
    const label = dart.label || String(dart.value);
    const type = dart.type || "single";
    player.dartCounts[label] = (player.dartCounts[label] || 0) + 1;
    player.typeCounts[type] = (player.typeCounts[type] || 0) + 1;
    player.totalDarts += 1;
  });
}

function removeLastDart() {
  const game = state.activeGame;
  if (!game || !game.currentThrows || game.currentThrows.length === 0) return;
  game.currentThrows.pop();
  renderMainOnly();
}

function clearThrows() {
  if (!state.activeGame) return;
  state.activeGame.currentThrows = [];
  renderMainOnly();
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
    avatar: createDefaultAvatar(color),
    guest: true
  });
  render();
}

function removeGuest(id) {
  guestPlayers = guestPlayers.filter((player) => player.id !== id);
  render();
}

function openAvatarEditor(id) {
  avatarEditorPlayerId = id;
  render();
}

function closeAvatarEditor() {
  avatarEditorPlayerId = null;
  render();
}

function setAvatarPart(field, value) {
  const player = state.players.find((item) => item.id === avatarEditorPlayerId);
  if (!player || !avatarOptions[field] || !avatarOptions[field].includes(value)) return;
  player.avatar = normalizeAvatar(player.avatar, player.color);
  player.avatar[field] = value;
  if (field === "shirt") player.color = value;
  player.updatedAt = new Date().toISOString();
  saveAndRender();
  queueSync();
}

async function installApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    render();
    return;
  }
  installHelpOpen = true;
  render();
}

function closeInstallHelp() {
  installHelpOpen = false;
  render();
}

function showUpdateReady(worker) {
  updateWorker = worker;
  updateReady = true;
  render();
}

function applyUpdate() {
  if (!updateWorker) {
    window.location.reload();
    return;
  }
  updateWorker.postMessage({ type: "SKIP_WAITING" });
}

function addPlayer(name) {
  const clean = name.trim();
  if (!clean) return;
  const color = colors[state.players.length % colors.length];
  const player = createPlayer(clean, color);
  state.players.push(player);
  if (state.setup.selectedPlayerIds.length < 2) state.setup.selectedPlayerIds.push(player.id);
  saveAndRender();
  queueSync();
}

function renamePlayer(id) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  const next = prompt("Neuer Name:", player.name);
  if (!next || !next.trim()) return;
  player.name = next.trim().slice(0, 18);
  player.updatedAt = new Date().toISOString();
  if (state.activeGame) {
    state.activeGame.players.forEach((snapshot) => {
      if (snapshot.id === id) snapshot.name = player.name;
    });
  }
  saveAndRender();
  queueSync();
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
  if (isSyncEnabled()) state.sync.deletedPlayerIds = [...new Set([...(state.sync.deletedPlayerIds || []), id])];
  saveAndRender();
  queueSync();
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

function saveAndRenderMain() {
  saveState();
  renderMainOnly();
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
    if (state.activeView !== "stats") activeStatsPlayerId = null;
    state.message = "";
    saveAndRender();
  }
  if (action === "set-mode") {
    state.setup.startScore = Number(button.dataset.score);
    saveAndRender();
  }
  if (action === "set-checkout") {
    state.setup.checkout = button.dataset.checkout;
    saveAndRender();
  }
  if (action === "toggle-player") togglePlayer(button.dataset.playerId);
  if (action === "remove-guest") removeGuest(button.dataset.playerId);
  if (action === "start-game") startGame();
  if (action === "add-dart") addDart(button.dataset.value, button.dataset.label, button.dataset.type);
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
  if (action === "open-avatar") openAvatarEditor(button.dataset.playerId);
  if (action === "close-avatar") closeAvatarEditor();
  if (action === "set-avatar") setAvatarPart(button.dataset.field, button.dataset.value);
  if (action === "show-player-stats") {
    activeStatsPlayerId = button.dataset.playerId;
    saveAndRender();
  }
  if (action === "back-to-global") {
    activeStatsPlayerId = null;
    saveAndRender();
  }
  if (action === "install-app") installApp();
  if (action === "close-install-help") closeInstallHelp();
  if (action === "rename-player") renamePlayer(button.dataset.playerId);
  if (action === "delete-player") deletePlayer(button.dataset.playerId);
  if (action === "sync-now") syncWithFirebase({ manual: true });
  if (action === "open-family-code") openFamilyCodeEditor();
  if (action === "close-family-code") closeFamilyCodeEditor();
  if (action === "apply-update") applyUpdate();
});

document.addEventListener("submit", (event) => {
  const familyCodeForm = event.target.closest("[data-action='family-code-form']");
  if (familyCodeForm) {
    event.preventDefault();
    changeFamilyCode(new FormData(familyCodeForm).get("familyCode"));
    return;
  }

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

if ("serviceWorker" in navigator && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updateReloading) return;
    updateReloading = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      watchServiceWorker(registration);
      registration.update().catch(() => {});
    }).catch(() => {});
  });
}

function watchServiceWorker(registration) {
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateReady(registration.waiting);
  }

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateReady(worker);
      }
    });
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  render();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installHelpOpen = false;
  render();
});

window.addEventListener("online", () => {
  setSyncRuntime("syncing", "Internet ist wieder da. Daten werden abgeglichen.");
  syncWithFirebase({ manual: false });
});

window.addEventListener("offline", () => {
  setSyncRuntime("offline", "Offline. Neue Ergebnisse bleiben gespeichert und werden automatisch gesendet.");
});

render();
if (isSyncEnabled()) {
  setSyncRuntime(navigator.onLine ? "syncing" : "offline", navigator.onLine ? "Familien-Daten werden geladen." : "Offline. Ergebnisse werden spaeter automatisch gesendet.", "", false);
  syncWithFirebase({ manual: false });
}
