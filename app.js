const STORAGE_KEY = "dartabend.local.v1";
const DEVICE_ID_KEY = "nobsiboard.device.id";
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
const featuredHistoryDarts = [
  { label: "T20", type: "triple" },
  { label: "T19", type: "triple" },
  { label: "T18", type: "triple" },
  { label: "Bull", type: "bull" },
  { label: "Bullseye", type: "bullseye" }
];
const globalTrackedDarts = [
  { label: "T18", type: "triple" },
  { label: "T17", type: "triple" },
  { label: "T20", type: "triple" },
  { label: "Bull", type: "bull" },
  { label: "Bullseye", type: "bullseye" }
];
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

const gameModes = [
  { id: "classic-301", kind: "classic", category: "classic", name: "301", subtitle: "Kurz", startScore: 301, minPlayers: 2, fixedCheckout: null },
  { id: "classic-501", kind: "classic", category: "classic", name: "501", subtitle: "Klassisch", startScore: 501, minPlayers: 2, fixedCheckout: null },
  { id: "restjagd", kind: "restjagd", category: "dartmix", name: "Restjagd", subtitle: "DartMix", minPlayers: 1, fixedCheckout: null }
];
const RESTJAGD_REEL_DURATION = 4000;
const RESTJAGD_REEL_BRAKE_DURATION = 2000;
const RESTJAGD_REEL_CARD_COUNT = 72;
const RESTJAGD_REEL_FINAL_INDEX = 68;
const RESTJAGD_REEL_SLOWDOWN = "cubic-bezier(.333333, .666667, .666667, 1)";

const defaultState = {
  activeView: "game",
  players: [
    createPlayer("Papa", colors[0]),
    createPlayer("Piet", colors[1])
  ],
  matches: [],
  setup: {
    mode: "classic",
    startScore: 501,
    checkout: "straight",
    selectedPlayerIds: []
  },
  sync: {
    enabled: true,
    familyCode: DEFAULT_FAMILY_CODE,
    lastSyncedAt: "",
    lastResetAt: "",
    deletedPlayerIds: []
  },
  activeGame: null,
  welcomeSeen: false,
  message: ""
};

let state = loadState();
let guestPlayers = [];
let avatarEditorPlayerId = null;
let activeStatsPlayerId = null;
let activeMatchId = null;
let activeGlobalHitCategory = "";
let deferredInstallPrompt = null;
let installHelpOpen = false;
let familyCodeEditorOpen = false;
let welcomeOpen = !state.welcomeSeen;
let modePickerOpen = false;
let modePickerCategory = "classic";
let pendingModeId = "";
let restjagdIntro = null;
let restjagdIntroTimers = [];
let restjagdIntroRunId = 0;
let updateReady = false;
let updateApplying = false;
let updateWorker = null;
let updateReloading = false;
let updateCheckRunning = false;
let updateCheckQueued = false;
let serviceWorkerRegistration = null;
let serviceWorkerWatchAttached = false;
let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let firebasePersistenceTried = false;
let familyResetUnsubscribe = null;
let familyResetListenCode = "";
let familyDataUnsubscribes = [];
let familyDataListenCode = "";
let activeGameUnsubscribe = null;
let activeGameListenCode = "";
let activeGameSyncTimer = null;
let activeGameSyncRunning = false;
let activeGameSyncPendingRevision = null;
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

function getDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const deviceId = createId();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    return deviceId;
  } catch {
    return createId();
  }
}

const DEVICE_ID = getDeviceId();

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
      setup: normalizeSetup(parsed.setup),
      sync: normalizeSync(parsed.sync),
      players: Array.isArray(parsed.players) ? normalizePlayers(parsed.players) : normalizePlayers(clone(defaultState.players)),
      matches: Array.isArray(parsed.matches) ? parsed.matches.filter(isClassicMatch) : [],
      activeGame: parsed.activeGame || null,
      message: parsed.message || ""
    };
  } catch {
    return clone(defaultState);
  }
}

function normalizeSetup(setup = {}) {
  const result = { ...defaultState.setup, ...setup };
  result.mode = result.mode === "restjagd" ? "restjagd" : "classic";
  result.startScore = Number(result.startScore) === 301 ? 301 : 501;
  result.checkout = result.checkout === "double" ? "double" : "straight";
  result.selectedPlayerIds = Array.isArray(result.selectedPlayerIds) ? result.selectedPlayerIds : [];
  return result;
}

function getSetupMode() {
  const id = state.setup.mode === "restjagd" ? "restjagd" : `classic-${state.setup.startScore}`;
  return gameModes.find((mode) => mode.id === id) || gameModes[1];
}

function isRestjagd(game) {
  return Boolean(game && game.mode === "restjagd");
}

function isClassicMatch(match) {
  return Boolean(match && (!match.mode || match.mode === "classic"));
}

function getClassicMatches() {
  return (state.matches || []).filter(isClassicMatch);
}

function getGameRemaining(game) {
  return isRestjagd(game) ? game.sharedRemaining : game.players[game.currentIndex].remaining;
}

// Stop at the first checkout or bust: later darts cannot undo a terminal result.
function evaluateTurn(game, darts = game.currentThrows || []) {
  let remaining = getGameRemaining(game);
  let score = 0;
  let bust = false;
  let finished = false;
  const usedDarts = [];
  for (const dart of darts.slice(0, 3)) {
    usedDarts.push(dart);
    score += Number(dart.value);
    remaining -= Number(dart.value);
    const doubleFinish = dart.type === "double" || dart.type === "bullseye";
    bust = remaining < 0 || (game.checkout === "double"
      && (remaining === 1 || (remaining === 0 && !doubleFinish)));
    finished = remaining === 0 && !bust;
    if (bust || finished) break;
  }
  return { remaining, score, bust, finished, usedDarts, terminal: bust || finished || usedDarts.length === 3 };
}

function normalizeSync(sync) {
  const familyCode = normalizeFamilyCode(sync && sync.familyCode ? sync.familyCode : DEFAULT_FAMILY_CODE);
  return {
    ...defaultState.sync,
    ...(sync || {}),
    enabled: true,
    familyCode,
    lastResetAt: sync && sync.lastResetAt ? normalizeDateValue(sync.lastResetAt) : "",
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
    createdAt: normalizeDateValue(player.createdAt) || player.createdAt || new Date().toISOString(),
    updatedAt: normalizeDateValue(player.updatedAt) || normalizeDateValue(player.createdAt) || player.updatedAt || player.createdAt || new Date().toISOString()
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, matches: getClassicMatches() }));
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

function normalizeDateValue(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (Number.isFinite(value.seconds)) return new Date(value.seconds * 1000).toISOString();
  return "";
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
  const runningIntro = isRestjagdIntroVisible() && !restjagdIntro.settled
    ? app.querySelector(".restjagd-intro-backdrop") : null;
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
  if (runningIntro) app.querySelector(".restjagd-intro-backdrop")?.replaceWith(runningIntro);
  syncModePickerUI();
}

function renderMainContent() {
  if (state.activeView === "game") return renderGameView();
  if (state.activeView === "stats") return renderStatsView();
  if (state.activeView === "players") return renderPlayersView();
  return "";
}

function renderOverlays() {
  return `
    ${welcomeOpen ? renderWelcomePopup() : ""}
    ${modePickerOpen ? renderModePicker() : ""}
    ${isRestjagdIntroVisible() ? renderRestjagdIntro() : ""}
    ${avatarEditorPlayerId ? renderAvatarEditor() : ""}
    ${installHelpOpen ? renderInstallHelp() : ""}
    ${familyCodeEditorOpen ? renderFamilyCodeEditor() : ""}
    ${activeMatchId ? renderMatchDetails() : ""}
    ${activeGlobalHitCategory ? renderGlobalHitDetails() : ""}
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
  if (overlayRoot && !isRestjagdIntroVisible()) overlayRoot.innerHTML = renderOverlays();
  syncModePickerUI();
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
        <strong>${updateApplying ? "Update wird geladen" : "Update bereit"}</strong>
        <p>${updateApplying ? "NobsiBoard startet gleich neu." : "Neue Version laden?"}</p>
      </div>
      <button class="primary compact-button" data-action="apply-update" ${updateApplying ? "disabled" : ""}>${updateApplying ? "Laedt" : "Laden"}</button>
    </div>
  `;
}

function renderWelcomePopup() {
  return `
    <div class="modal-backdrop">
      <section class="install-card welcome-card" role="dialog" aria-modal="true" aria-label="Willkommen">
        <div class="welcome-mark">
          <img src="./logo-512.png" alt="">
        </div>
        <div>
          <h2>Willkommen zu NobsiBoard</h2>
          <p class="welcome-copy">Eine waschechte Stobbez Entwicklung. Viel Spass beim Darten!</p>
        </div>
        <button class="primary" data-action="close-welcome">Los geht's</button>
      </section>
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
  const mode = getSetupMode();
  const checkout = mode.fixedCheckout || state.setup.checkout;

  return `
    <section class="grid two-col">
      <div class="panel panel-pad">
        <div class="section-title">
          <h2>Neues Spiel</h2>
          <span class="small-pill">${mode.category === "dartmix" ? "DartMix" : "Klassisch"}</span>
        </div>
        <div class="grid">
          <div>
            <button class="mode-button" data-action="open-mode-picker" aria-haspopup="dialog">
              <span class="mode-button-mark"><img src="./logo-512.png" alt=""></span>
              <span class="mode-button-copy"><span class="hint">Modus</span><strong>${mode.name} &middot; ${mode.subtitle}</strong></span>
              <span class="mode-chevron" aria-hidden="true">&rsaquo;</span>
            </button>
            ${mode.kind === "restjagd" ? `<p class="mode-description">Zufallszahl von 2 bis 180. Ein gemeinsamer Rest. Wer auf null kommt, gewinnt. Auch solo spielbar.</p>` : ""}
          </div>

          <div>
            <p class="hint">Checkout</p>
            <div class="segmented" role="group" aria-label="Checkout-Regel">
              <button class="choice ${checkout === "straight" ? "active" : ""}" data-action="set-checkout" data-checkout="straight" aria-pressed="${checkout === "straight"}" ${mode.fixedCheckout ? "disabled" : ""}>Einfach<span>genau 0</span></button>
              <button class="choice ${checkout === "double" ? "active" : ""}" data-action="set-checkout" data-checkout="double" aria-pressed="${checkout === "double"}" ${mode.fixedCheckout ? "disabled" : ""}>Double Out<span>Double / Bullseye</span></button>
            </div>
            ${mode.fixedCheckout ? `<p class="hint">Dieser Modus wird immer mit ${checkout === "double" ? "Double Out" : "Einfach"} gespielt.</p>` : `<p class="hint checkout-hint">${checkout === "double" ? "Genau auf 0. Der letzte Dart muss ein Double oder Bullseye sein." : "Genau auf 0. Jedes Feld darf den Abschluss bringen."}</p>`}
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
            ${playerCount < mode.minPlayers ? `<p class="footer-note">Waehle mindestens ${mode.minPlayers === 1 ? "einen Spieler" : "zwei Spieler"} oder fuege Gaeste hinzu.</p>` : ""}
          </div>

          <form class="form-row compact-form" data-action="add-guest-form">
            <input class="text-input" name="guestName" maxlength="18" autocomplete="off" placeholder="Gastname" aria-label="Gastspieler fuer dieses Spiel">
            <button class="secondary" type="submit">Gast dazu</button>
          </form>

          <button class="primary" data-action="start-game" ${playerCount < mode.minPlayers ? "disabled" : ""}>Spiel starten</button>
        </div>
      </div>

      <aside class="panel panel-pad">
        <div class="section-title">
          <h2>Schnellstart</h2>
        </div>
        <p class="hint">Waehle gespeicherte Spieler aus oder fuege Gaeste nur fuer diese Partie hinzu. ${mode.kind === "restjagd" ? "DartMix wird ohne Statistik und Spielhistorie gespielt." : "Gespeichert werden spaeter nur die festen Spieler."}</p>
        ${renderSyncPanel()}
      </aside>
    </section>
  `;
}

function renderModePicker() {
  return `
    <div class="modal-backdrop mode-picker-backdrop">
      <section class="mode-picker" role="dialog" aria-modal="true" aria-labelledby="mode-picker-title">
        <div class="mode-picker-head">
          <img src="./header-transparent.png" alt="NobsiBoard">
          <button class="icon-button" data-action="close-mode-picker" aria-label="Modusauswahl schliessen">X</button>
        </div>
        <h2 id="mode-picker-title">Modus waehlen</h2>
        <div class="mode-tabs" role="tablist" aria-label="Moduskategorien">
          ${[["classic", "Klassisch"], ["dartmix", "DartMix"]].map(([category, name]) => `
            <button id="mode-tab-${category}" class="mode-tab ${modePickerCategory === category ? "active" : ""}" role="tab"
              aria-selected="${modePickerCategory === category}" aria-controls="mode-options" tabindex="${modePickerCategory === category ? 0 : -1}"
              data-action="mode-category" data-category="${category}">${name}</button>`).join("")}
        </div>
        <div id="mode-options" class="mode-options" role="tabpanel" aria-labelledby="mode-tab-${modePickerCategory}">
          ${gameModes.filter((mode) => mode.category === modePickerCategory).map((mode) => `
            <button class="mode-option ${pendingModeId === mode.id ? "selected" : ""}" data-action="pick-mode" data-mode-id="${mode.id}" aria-pressed="${pendingModeId === mode.id}">
              <span class="mode-option-heading"><strong>${mode.name}</strong><span>${mode.subtitle}</span><span class="mode-check" aria-hidden="true">${pendingModeId === mode.id ? "&#10003;" : ""}</span></span>
              <span class="mode-option-description">${mode.kind === "restjagd" ? "Eine Zufallszahl. Ein Zaehler. Wer auf null kommt, gewinnt." : `Jeder spielt seinen eigenen Rest von ${mode.startScore} auf null.`}</span>
              ${mode.kind === "restjagd" ? '<span class="mode-option-detail">2–180 Punkte &middot; ab 1 Spieler &middot; ohne Statistik</span>' : ""}
            </button>`).join("")}
        </div>
        <button class="primary" data-action="apply-mode">Uebernehmen</button>
      </section>
    </div>`;
}

function syncModePickerUI() {
  document.body.classList.toggle("mode-picker-open", modePickerOpen);
  document.body.classList.toggle("restjagd-intro-open", isRestjagdIntroVisible());
  const picker = app.querySelector(".mode-picker");
  if (picker && !picker.contains(document.activeElement)) picker.querySelector('[aria-selected="true"]').focus();
}

function isRestjagdIntroVisible() {
  return Boolean(restjagdIntro && state.activeGame && isRestjagd(state.activeGame)
    && restjagdIntro.gameId === state.activeGame.id);
}

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

function renderRestjagdIntro() {
  return `
    <div class="restjagd-intro-backdrop" data-action="skip-restjagd-intro">
      <section class="restjagd-intro-card ${restjagdIntro.settled ? "settled" : "rolling"}" role="dialog" aria-modal="true" aria-labelledby="restjagd-intro-title" aria-describedby="restjagd-intro-caption">
        <p class="restjagd-intro-kicker">DartMix</p>
        <h2 id="restjagd-intro-title">RESTJAGD</h2>
        <div class="restjagd-reel-window" aria-hidden="true">
          <div class="restjagd-reel-track">${restjagdIntro.numbers.map((number, index) => `
            <span class="restjagd-reel-number ${index === restjagdIntro.finalIndex ? "winning-number" : ""}">${number}</span>`).join("")}</div>
        </div>
        <p id="restjagd-intro-caption" class="restjagd-intro-caption" aria-live="polite">${restjagdIntro.settled ? "Euer gemeinsamer Rest" : "Euer Rest wird ausgelost ..."}</p>
        <button class="restjagd-intro-skip" data-action="skip-restjagd-intro">${restjagdIntro.settled ? "Los geht's" : "Antippen zum &Uuml;berspringen"}</button>
      </section>
    </div>`;
}

function renderOverlayRoot() {
  const overlay = app.querySelector("#overlay-root");
  if (overlay) overlay.innerHTML = renderOverlays();
  syncModePickerUI();
  positionRestjagdReel();
}

function clearRestjagdIntroTimers() {
  restjagdIntroTimers.forEach((timer) => window.clearTimeout(timer));
  restjagdIntroTimers = [];
}

function scheduleRestjagdIntro(callback, delay, runId = restjagdIntroRunId) {
  const timer = window.setTimeout(() => {
    restjagdIntroTimers = restjagdIntroTimers.filter((entry) => entry !== timer);
    if (runId === restjagdIntroRunId) callback();
  }, delay);
  restjagdIntroTimers.push(timer);
}

function positionRestjagdReel() {
  if (!isRestjagdIntroVisible()) return null;
  const viewport = app.querySelector(".restjagd-reel-window");
  const track = viewport?.querySelector(".restjagd-reel-track");
  const cards = track?.querySelectorAll(".restjagd-reel-number");
  if (!viewport || !track || !cards.length) return null;
  const first = cards[0];
  const winner = cards[restjagdIntro.finalIndex];
  const start = (viewport.clientWidth - first.clientWidth) / 2 - first.offsetLeft;
  const finish = (viewport.clientWidth - winner.clientWidth) / 2 - winner.offsetLeft;
  track.style.transform = `translate3d(${restjagdIntro.settled ? finish : start}px, 0, 0)`;
  return { track, start, finish };
}

function startRestjagdReel(runId) {
  const positions = positionRestjagdReel();
  if (!positions) {
    settleRestjagdIntro();
    return;
  }
  const { track, start, finish } = positions;
  const cruiseDuration = RESTJAGD_REEL_DURATION - RESTJAGD_REEL_BRAKE_DURATION;
  const cruiseFraction = cruiseDuration / (cruiseDuration + RESTJAGD_REEL_BRAKE_DURATION / 2);
  const cruise = start + (finish - start) * cruiseFraction;
  if (typeof track.animate !== "function") {
    track.style.transition = `transform ${cruiseDuration}ms linear`;
    window.requestAnimationFrame(() => {
      if (runId === restjagdIntroRunId) track.style.transform = `translate3d(${cruise}px, 0, 0)`;
    });
    scheduleRestjagdIntro(() => {
      track.style.transition = `transform ${RESTJAGD_REEL_DURATION - cruiseDuration}ms ${RESTJAGD_REEL_SLOWDOWN}`;
      track.style.transform = `translate3d(${finish}px, 0, 0)`;
    }, cruiseDuration, runId);
  } else {
    restjagdIntro.animation = track.animate([
      { transform: `translate3d(${start}px, 0, 0)`, offset: 0, easing: "linear" },
      { transform: `translate3d(${cruise}px, 0, 0)`, offset: cruiseDuration / RESTJAGD_REEL_DURATION, easing: RESTJAGD_REEL_SLOWDOWN },
      { transform: `translate3d(${finish}px, 0, 0)`, offset: 1 }
    ], { duration: RESTJAGD_REEL_DURATION, fill: "forwards" });
  }
  scheduleRestjagdIntro(() => settleRestjagdIntro(), RESTJAGD_REEL_DURATION, runId);
}

function settleRestjagdIntro(autoCloseDelay = 1700) {
  if (!isRestjagdIntroVisible() || restjagdIntro.settled) return;
  clearRestjagdIntroTimers();
  restjagdIntro.animation?.cancel();
  restjagdIntro.settled = true;
  renderOverlayRoot();
  app.querySelector(".restjagd-intro-skip")?.focus();
  scheduleRestjagdIntro(closeRestjagdIntro, autoCloseDelay);
}

function closeRestjagdIntro() {
  if (!restjagdIntro) return;
  clearRestjagdIntroTimers();
  restjagdIntro.animation?.cancel();
  restjagdIntroRunId += 1;
  restjagdIntro = null;
  renderOverlayRoot();
  scrollToActiveScore();
}

function skipRestjagdIntro() {
  if (!isRestjagdIntroVisible()) return;
  if (restjagdIntro.settled) closeRestjagdIntro();
  else settleRestjagdIntro();
}

function openRestjagdIntro(game) {
  if (!isRestjagd(game)) return;
  clearRestjagdIntroTimers();
  restjagdIntroRunId += 1;
  const runId = restjagdIntroRunId;
  const reducedMotion = prefersReducedMotion();
  const finalIndex = reducedMotion ? 0 : RESTJAGD_REEL_FINAL_INDEX;
  const numbers = Array.from({ length: reducedMotion ? 1 : RESTJAGD_REEL_CARD_COUNT }, (_, index) => {
    if (index === finalIndex) return game.startScore;
    return Math.floor(Math.random() * 179) + 2;
  });
  restjagdIntro = {
    gameId: game.id,
    numbers,
    finalIndex,
    settled: reducedMotion
  };
  renderOverlayRoot();
  app.querySelector(".restjagd-intro-skip")?.focus();

  if (reducedMotion) {
    scheduleRestjagdIntro(closeRestjagdIntro, 2000, runId);
    return;
  }
  startRestjagdReel(runId);
}

function refreshModePicker(focusSelector) {
  const overlay = app.querySelector("#overlay-root");
  if (overlay) overlay.innerHTML = renderOverlays();
  syncModePickerUI();
  if (focusSelector) app.querySelector(focusSelector)?.focus();
}

function openModePicker() {
  if (state.activeGame) return;
  const mode = getSetupMode();
  pendingModeId = mode.id;
  modePickerCategory = mode.category;
  modePickerOpen = true;
  refreshModePicker();
}

function closeModePicker(apply = false) {
  if (apply) {
    const mode = gameModes.find((item) => item.id === pendingModeId);
    if (mode) {
      state.setup.mode = mode.kind;
      if (mode.startScore) state.setup.startScore = mode.startScore;
      if (mode.fixedCheckout) state.setup.checkout = mode.fixedCheckout;
    }
  }
  modePickerOpen = false;
  saveAndRenderMain();
  app.querySelector('[data-action="open-mode-picker"]')?.focus();
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
        <details class="admin-reset">
          <summary>Admin</summary>
          <button class="danger compact-button" data-action="reset-family-tree">Familie komplett zuruecksetzen</button>
        </details>
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
  const projection = evaluateTurn(game);
  const projectedRemaining = projection.remaining;
  const projectedBust = projection.bust;
  const canAddThrow = !projection.terminal;

  return `
    <section class="game-board">
      ${isFinished ? renderWinner(game) : ""}
      ${isRestjagd(game) ? renderSharedScore(game) : `<div class="scorecards">
        ${game.players.map((player, index) => renderScoreCard(player, index === game.currentIndex && !isFinished)).join("")}
      </div>`}

      ${!isFinished ? `
        <div class="turn-panel">
          <div class="turn-head">
            <div>
              <p class="hint" style="color:rgba(255,255,255,.72)">Am Zug</p>
              <div class="turn-player">${escapeHtml(current.name)}</div>
            </div>
            <div class="turn-rules">
              <span class="small-pill">${isRestjagd(game) ? `Restjagd · Start ${game.startScore}` : game.startScore}</span>
              <span class="small-pill">${game.checkout === "double" ? "Double Out" : "Einfach"}</span>
            </div>
          </div>

          <div class="throw-summary" aria-label="Aktuelle Eingabe und Restpunkte">
            <div class="throw-entry">
              <span class="throw-label">Eingabe &middot; Runde <b>${roundTotal}</b></span>
              <div class="throw-list" aria-label="Geworfene Darts">
                ${[0, 1, 2].map((index) => `<span class="${throws[index] ? "" : "is-empty"}">${throws[index] ? escapeHtml(throws[index].label) : `${index + 1}. Dart`}</span>`).join("")}
              </div>
            </div>
            <div class="throw-projection ${projectedBust ? "is-bust" : ""}">
              <span class="throw-label">Rest</span>
              <strong>${projectedBust ? "Bust" : projectedRemaining}</strong>
            </div>
          </div>

          ${game.lastSavedRound && game.lastSavedRound.length ? `
            <div class="last-round-preview" aria-label="Letzte gespeicherte Runde">
              <span class="throw-label">Letzte Runde</span>
              <div class="last-round-darts">
                ${game.lastSavedRound.map((dart) => `<span class="last-round-chip ${dart.type || "single"}">${escapeHtml(dart.label)}</span>`).join("")}
              </div>
            </div>
          ` : ""}

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
            <button class="primary ${projectedBust ? "bust-action" : ""}" data-action="submit-round" ${throws.length === 0 ? "disabled" : ""}>${projectedBust ? "BUST!" : projection.finished ? "Checkout bestaetigen" : "Runde speichern"}</button>
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

function renderSharedScore(game) {
  return `
    <section class="shared-score" aria-label="Gemeinsamer Rest">
      <div class="shared-score-head"><span class="small-pill">Restjagd</span><span class="hint">Start ${game.startScore} &middot; ${game.checkout === "double" ? "Double Out" : "Einfach"}</span></div>
      <p class="hint">Gemeinsamer Rest</p>
      <div class="remaining">${game.sharedRemaining}</div>
      <div class="shared-players" aria-label="Spielreihenfolge">
        ${game.players.map((player, index) => `<div class="shared-player ${index === game.currentIndex && !game.finishedAt ? "active" : ""}">
          ${renderAvatar(player, "tiny")}<strong>${escapeHtml(player.name)}</strong>
          ${index === game.currentIndex && !game.finishedAt ? '<span class="turn-badge">DRAN</span>' : ""}
        </div>`).join("")}
      </div>
    </section>`;
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
      <p>${isRestjagd(game) ? (game.players.length === 1 ? `Geschafft mit ${game.dartsThrown} Darts. ` : "") + "DartMix wird ohne Statistik und Spielhistorie gespielt." : "Das Spiel wurde gespeichert und ist jetzt in der Statistik."}</p>
      <div class="actions">
        ${isRestjagd(game) ? '<button class="primary" data-action="restjagd-rematch">Noch eine Runde</button>' : ""}
        <button class="${isRestjagd(game) ? "secondary" : "primary"}" data-action="new-game">Neues Spiel</button>
      </div>
    </div>
  `;
}

function renderStatsView() {
  const stats = getStats();
  const ranked = [...stats.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.average - a.average);
  const recent = [...getClassicMatches()].slice(-6).reverse();

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
          <span class="small-pill">${getClassicMatches().length} Spiele</span>
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
            <h2>Treffer-Details</h2>
            <span class="hint">Antippen</span>
          </div>
          ${renderGlobalHitCategories()}
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
  const playerMatches = [...getClassicMatches()]
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

        <div class="player-hit-breakdown">
          <div class="section-title">
            <h2>Eigene Treffer</h2>
            <span class="hint">Feld und Anzahl</span>
          </div>
          ${renderPlayerHitGroups(row.dartCounts)}
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

function renderPlayerHitGroups(counts) {
  const groups = [
    { label: "Triple", type: "triple", entries: getPlayerHitEntries(counts, /^T\d+$/) },
    { label: "Double", type: "double", entries: getPlayerHitEntries(counts, /^D\d+$/) },
    { label: "Bull", type: "bull", entries: getPlayerHitEntries(counts, /^(Bull|Bullseye)$/) }
  ];

  return `
    <div class="player-hit-groups">
      ${groups.map((group) => `
        <div class="player-hit-group">
          <strong>${group.label}</strong>
          <div class="player-hit-chips">
            ${group.entries.length
              ? group.entries.map((entry) => `<span class="player-hit-chip ${group.type}"><span>${escapeHtml(entry.label)}</span><b>${entry.count}x</b></span>`).join("")
              : `<span class="hint">Noch keine Treffer</span>`}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function getPlayerHitEntries(counts, pattern) {
  return Object.entries(counts || {})
    .filter(([label, count]) => pattern.test(label) && Number(count) > 0)
    .map(([label, count]) => ({ label, count: Number(count) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "de-DE", { numeric: true }));
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
  const highest = [...ranked].filter((row) => row.rounds > 0).sort((a, b) => b.highestThrow - a.highestThrow)[0];
  const bestAverage = [...ranked].filter((row) => row.rounds > 0).sort((a, b) => b.average - a.average)[0];
  const highestNames = highest ? ranked.filter((row) => row.rounds > 0 && row.highestThrow === highest.highestThrow).map((row) => row.name).join(", ") : "-";
  const bestAverageNames = bestAverage ? ranked.filter((row) => row.rounds > 0 && row.average === bestAverage.average).map((row) => row.name).join(", ") : "-";
  const t20Hunter = [...ranked]
    .map((row) => ({ name: row.name, count: Number((row.dartCounts || {})["T20"] || 0) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0];
  const played = getClassicMatches().length;

  return `
    <div class="stats-grid">
      <div class="stat-box"><span class="stat-value">${played}</span><span class="stat-label">Spiele</span></div>
      <div class="stat-box"><span class="stat-value">${mostWins ? escapeHtml(mostWins.name) : "-"}</span><span class="stat-label">Meiste Siege</span></div>
      <div class="stat-box"><span class="stat-value">${highest ? highest.highestThrow : 0}</span><span class="stat-label">Hoechster Wurf</span><span class="stat-owner">${escapeHtml(highestNames)}</span></div>
      <div class="stat-box"><span class="stat-value">${bestAverage ? bestAverage.average : 0}</span><span class="stat-label">Bester Schnitt</span><span class="stat-owner">${escapeHtml(bestAverageNames)}</span></div>
      <div class="stat-box">
        <span class="stat-value stat-inline">
          <span>${t20Hunter ? escapeHtml(t20Hunter.name) : "-"}</span>
          <small>${t20Hunter ? `${t20Hunter.count}x` : "0x"}</small>
        </span>
        <span class="stat-label">T20 Jaeger</span>
      </div>
    </div>
  `;
}

function getGlobalFeaturedCounts() {
  const counts = Object.fromEntries(globalTrackedDarts.map((dart) => [dart.label, 0]));
  getClassicMatches().forEach((match) => {
    (match.players || []).forEach((player) => {
      globalTrackedDarts.forEach((dart) => {
        counts[dart.label] += Number((player.dartCounts || {})[dart.label] || 0);
      });
    });
  });
  return counts;
}

function renderGlobalHitCategories() {
  const counts = getGlobalFeaturedCounts();
  const tripleTotal = ["T18", "T17", "T20"].reduce((total, label) => total + counts[label], 0);
  const bullTotal = counts.Bull + counts.Bullseye;
  return `
    <div class="stats-grid">
      <button class="stat-box stat-action" data-action="show-global-hit-details" data-category="triple">
        <span class="stat-value">${tripleTotal}</span>
        <span class="stat-label">Triple</span>
      </button>
      <button class="stat-box stat-action" data-action="show-global-hit-details" data-category="bull">
        <span class="stat-value">${bullTotal}</span>
        <span class="stat-label">Bull</span>
      </button>
    </div>
  `;
}

function renderGlobalHitDetails() {
  const counts = getGlobalFeaturedCounts();
  const isTriple = activeGlobalHitCategory === "triple";
  const details = (isTriple ? ["T18", "T17", "T20"] : ["Bull", "Bullseye"])
    .map((label) => ({ label, count: counts[label], type: globalTrackedDarts.find((dart) => dart.label === label).type }));
  return `
    <div class="modal-backdrop">
      <section class="hit-details-card" role="dialog" aria-modal="true" aria-label="Treffer-Details">
        <div class="editor-head">
          <div>
            <h2>${isTriple ? "Triple-Treffer" : "Bull-Treffer"}</h2>
            <p class="hint">Gesamt aus allen gespeicherten Spielen</p>
          </div>
          <button class="icon-button" data-action="close-global-hit-details" aria-label="Schliessen">X</button>
        </div>
        <div class="hit-detail-list">
          ${details.map((detail) => `
            <div class="hit-detail-row">
              <span class="detail-dart-chip ${detail.type}">${detail.label}</span>
              <strong>${detail.count}x getroffen</strong>
            </div>
          `).join("")}
        </div>
        <button class="secondary" data-action="close-global-hit-details">Schliessen</button>
      </section>
    </div>
  `;
}

function renderHistoryRow(match) {
  const winner = state.players.find((player) => player.id === match.winnerId) || match.players.find((player) => player.id === match.winnerId);
  const date = new Date(match.finishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `
    <button class="history-row history-button" data-action="show-match-details" data-match-id="${escapeHtml(match.id)}">
      <div>
        <strong>${escapeHtml(winner ? winner.name : "Unbekannt")} gewonnen</strong>
        <div class="metric-line">${date} - ${match.startScore} - ${match.checkout === "double" ? "Double Out" : "Einfach"} - ${match.players.map((player) => escapeHtml(player.name)).join(" gegen ")}</div>
        ${renderMatchHighlights(match)}
      </div>
      <span class="small-pill">+3</span>
    </button>
  `;
}

function renderMatchDetails() {
  const match = getClassicMatches().find((item) => item.id === activeMatchId);
  if (!match) return "";
  const hasDetails = match.players.some((player) => Array.isArray(player.roundDetails) && player.roundDetails.length);
  const date = new Date(match.finishedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  return `
    <div class="modal-backdrop">
      <section class="match-details-card" role="dialog" aria-modal="true" aria-label="Spieldetails">
        <div class="editor-head">
          <div>
            <h2>Spieldetails</h2>
            <p class="hint">${date} - ${match.startScore} - ${match.checkout === "double" ? "Double Out" : "Einfach"}</p>
          </div>
          <button class="icon-button" data-action="close-match-details" aria-label="Schliessen">X</button>
        </div>
        <div class="match-detail-players">
          ${match.players.map(renderMatchPlayerDetails).join("")}
        </div>
        ${hasDetails ? "" : `<p class="empty">Für dieses alte Spiel wurden noch keine einzelnen Würfe gespeichert. Neue Spiele werden hier vollständig angezeigt.</p>`}
        <button class="secondary" data-action="close-match-details">Schliessen</button>
      </section>
    </div>
  `;
}

function renderMatchPlayerDetails(player) {
  const rounds = Array.isArray(player.roundDetails) ? player.roundDetails : [];
  return `
    <section class="match-player-details">
      <div class="section-title">
        <div class="player-name"><span class="dot" style="background:${player.color}"></span><h3>${escapeHtml(player.name)}</h3></div>
        <span class="small-pill">${player.rounds} Runden</span>
      </div>
      ${rounds.length ? rounds.map((roundDetail, index) => `
        <div class="round-detail-row">
          <span class="round-number">Runde ${index + 1}</span>
          <div class="round-darts">${(roundDetail.darts || []).map(renderDetailDart).join("")}</div>
          <span class="small-pill">${roundDetail.bust ? "Bust" : `${Number(roundDetail.score || 0)} Pkt`}</span>
        </div>
      `).join("") : `<p class="empty">Keine Wurfdetails vorhanden.</p>`}
    </section>
  `;
}

function renderDetailDart(dart) {
  const label = String(dart.label || dart.value || "0");
  const featured = featuredHistoryDarts.find((item) => item.label === label);
  if (!featured) return `<span class="detail-number">${escapeHtml(label)}</span>`;
  return `<span class="detail-dart-chip ${featured.type}">${escapeHtml(label)}</span>`;
}

function renderMatchHighlights(match) {
  const counts = {};
  (match.players || []).forEach((player) => mergeCounts(counts, player.dartCounts));
  const highlights = featuredHistoryDarts
    .map((dart) => ({ ...dart, count: Number(counts[dart.label] || 0) }))
    .filter((dart) => dart.count > 0);
  if (!highlights.length) return "";

  return `
    <div class="history-highlights" aria-label="Hohe Treffer in diesem Spiel">
      ${highlights.map((dart) => `<span class="history-dart-chip ${dart.type}"><span>${dart.label}</span><strong>${dart.count}x</strong></span>`).join("")}
    </div>
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

  getClassicMatches().forEach((match) => {
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
  state.sync.lastResetAt = "";
  state.sync.deletedPlayerIds = [];
  stopFamilyResetWatcher();
  stopFamilyDataWatchers();
  stopActiveGameWatcher();
  state.message = "Familien-Code geaendert.";
  familyCodeEditorOpen = false;
  setSyncRuntime(navigator.onLine ? "syncing" : "offline", navigator.onLine ? "Neue Familie wird abgeglichen." : "Offline. Der neue Code wird spaeter abgeglichen.", "", false);
  saveAndRender();
  queueSync();
}

async function resetFamilyTree() {
  const familyCode = state.sync.familyCode;
  const firstOk = confirm(`Familie ${familyCode} wirklich komplett zuruecksetzen? Spieler, Spiele und Statistiken werden geloescht.`);
  if (!firstOk) return;

  if (!navigator.onLine) {
    state.message = "Reset braucht Internet, damit Firebase wirklich geleert wird.";
    familyCodeEditorOpen = false;
    setSyncRuntime("offline", "Offline. Reset wurde nicht ausgefuehrt.", "", false);
    saveAndRender();
    return;
  }

  syncRunning = true;
  familyCodeEditorOpen = false;
  setSyncRuntime("syncing", "Familie wird geleert.");
  render();

  try {
    const db = await ensureFirebaseSession();
    const familyRef = db.collection("families").doc(familyCode);
    const resetAt = new Date().toISOString();
    await clearFamilyCollection(familyRef, "players");
    await clearFamilyCollection(familyRef, "matches");
    await clearFamilyCollection(familyRef, "activeGames");
    await familyRef.set({
      code: familyCode,
      app: "NobsiBoard",
      resetAt,
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    resetLocalFamilyState(familyCode, resetAt);
    setSyncRuntime("synced", "Familie ist frisch und leer.", "", false);
    saveState();
  } catch (error) {
    state.message = "Reset konnte Firebase nicht leeren. Bitte Internet und Regeln pruefen.";
    setSyncRuntime("error", "Reset nicht abgeschlossen.", error && error.message ? error.message : "", false);
    saveState();
  } finally {
    syncRunning = false;
    render();
  }
}

async function clearFamilyCollection(familyRef, collectionName) {
  const snapshot = await familyRef.collection(collectionName).get();
  const docs = snapshot.docs;
  for (let index = 0; index < docs.length; index += 400) {
    const batch = firebaseDb.batch();
    docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function resetLocalFamilyState(familyCode, resetAt = new Date().toISOString(), message = "Familie wurde komplett zurueckgesetzt.") {
  state = {
    ...clone(defaultState),
    players: [],
    matches: [],
    setup: {
      mode: "classic",
      startScore: 501,
      checkout: "straight",
      selectedPlayerIds: []
    },
    sync: {
      enabled: true,
      familyCode,
      lastSyncedAt: new Date().toISOString(),
      lastResetAt: resetAt,
      deletedPlayerIds: []
    },
    activeGame: null,
    welcomeSeen: true,
    message
  };
  guestPlayers = [];
  avatarEditorPlayerId = null;
  activeStatsPlayerId = null;
  modePickerOpen = false;
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
    watchFamilyReset(familyRef);
    watchFamilyData(familyRef);
    watchActiveGame(familyRef);
    await familyRef.set({
      code: state.sync.familyCode,
      app: "NobsiBoard",
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const remoteResetApplied = await applyRemoteFamilyReset(familyRef);
    await deleteQueuedRemotePlayers(familyRef);
    await pullRemoteData(familyRef);
    await pushLocalData(familyRef);

    state.sync.lastSyncedAt = new Date().toISOString();
    state.message = manual && !remoteResetApplied ? "Alles ist aktuell." : state.message;
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

function stopFamilyResetWatcher() {
  if (typeof familyResetUnsubscribe === "function") {
    familyResetUnsubscribe();
  }
  familyResetUnsubscribe = null;
  familyResetListenCode = "";
}

function stopFamilyDataWatchers() {
  familyDataUnsubscribes.forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
  familyDataUnsubscribes = [];
  familyDataListenCode = "";
}

function stopActiveGameWatcher() {
  if (typeof activeGameUnsubscribe === "function") activeGameUnsubscribe();
  activeGameUnsubscribe = null;
  activeGameListenCode = "";
}

function watchActiveGame(familyRef) {
  if (!familyRef || typeof familyRef.collection !== "function" || activeGameListenCode === state.sync.familyCode) return;

  stopActiveGameWatcher();
  activeGameListenCode = state.sync.familyCode;
  const activeGameRef = familyRef.collection("activeGames").doc("current");
  activeGameUnsubscribe = activeGameRef.onSnapshot((snapshot) => {
    if (activeGameListenCode !== state.sync.familyCode || !snapshot.exists) return;
    const remoteGame = normalizeRemoteActiveGame(snapshot.data());
    if (!remoteGame) return;
    const localGame = state.activeGame;
    const remoteRevision = Number(remoteGame.revision || 0);
    const localRevision = Number(localGame && localGame.revision || 0);
    const remoteIsNewer = !localGame
      || remoteRevision > localRevision
      || (remoteRevision === localRevision && getTime(remoteGame.updatedAt) > getTime(localGame.updatedAt));
    if (!remoteIsNewer || remoteGame.deviceId === DEVICE_ID) return;

    state.activeGame = remoteGame;
    state.message = "Die laufende Partie wurde von einem anderen Geraet aktualisiert.";
    saveAndRenderMain();
  }, (error) => {
    activeGameUnsubscribe = null;
    activeGameListenCode = "";
    setSyncRuntime("error", "Laufende Partie konnte nicht live geladen werden.", error && error.message ? error.message : "");
  });
}

function watchFamilyData(familyRef) {
  if (!familyRef || typeof familyRef.collection !== "function" || familyDataListenCode === state.sync.familyCode) return;

  stopFamilyDataWatchers();
  familyDataListenCode = state.sync.familyCode;

  const handleListenerError = (error) => {
    familyDataUnsubscribes = [];
    familyDataListenCode = "";
    setSyncRuntime("error", "Live-Synchronisierung nicht verfuegbar. Manuell pruefen bleibt moeglich.", error && error.message ? error.message : "");
  };

  const playerUnsubscribe = familyRef.collection("players").onSnapshot((snapshot) => {
    if (familyDataListenCode !== state.sync.familyCode) return;
    const deletedPlayerIds = snapshot.docs
      .filter((doc) => doc.data() && doc.data().deleted === true)
      .map((doc) => doc.id);
    removeDeletedPlayers(deletedPlayerIds);

    const pendingDeletes = new Set(state.sync.deletedPlayerIds || []);
    const remotePlayers = snapshot.docs
      .filter((doc) => !(doc.data() && doc.data().deleted === true) && !pendingDeletes.has(doc.id))
      .map((doc) => normalizeRemotePlayer(doc.id, doc.data()))
      .filter(Boolean);
    mergeRemotePlayers(remotePlayers);
    ensureSelectedPlayers();
    saveState();
    renderMainOnly();
  }, handleListenerError);

  const matchUnsubscribe = familyRef.collection("matches").onSnapshot((snapshot) => {
    if (familyDataListenCode !== state.sync.familyCode) return;
    const remoteMatches = snapshot.docs
      .map((doc) => normalizeRemoteMatch(doc.id, doc.data()))
      .filter(Boolean);
    mergeRemoteMatches(remoteMatches);
    saveState();
    renderMainOnly();
  }, handleListenerError);

  familyDataUnsubscribes = [playerUnsubscribe, matchUnsubscribe];
}

function watchFamilyReset(familyRef) {
  if (!familyRef || typeof familyRef.onSnapshot !== "function" || familyResetListenCode === state.sync.familyCode) return;
  stopFamilyResetWatcher();
  familyResetListenCode = state.sync.familyCode;
  familyResetUnsubscribe = familyRef.onSnapshot((snapshot) => {
    if (!snapshot.exists) return;
    const remoteResetAt = normalizeDateValue((snapshot.data() || {}).resetAt);
    if (!remoteResetAt || getTime(remoteResetAt) <= getTime(state.sync.lastResetAt)) return;

    resetLocalFamilyState(
      state.sync.familyCode,
      remoteResetAt,
      "Familie wurde auf einem anderen Geraet zurueckgesetzt."
    );
    setSyncRuntime("synced", "Familie wurde frisch geladen.", "", false);
    saveState();
    render();
  }, () => {
    familyResetUnsubscribe = null;
    familyResetListenCode = "";
  });
}

async function applyRemoteFamilyReset(familyRef) {
  const snapshot = await familyRef.get();
  if (!snapshot.exists) return false;
  const remoteResetAt = normalizeDateValue((snapshot.data() || {}).resetAt);
  if (!remoteResetAt) return false;
  if (getTime(remoteResetAt) <= getTime(state.sync.lastResetAt)) return false;

  resetLocalFamilyState(
    state.sync.familyCode,
    remoteResetAt,
    "Familie wurde auf einem anderen Geraet zurueckgesetzt."
  );
  saveState();
  return true;
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
  const byId = new Map(getClassicMatches().map((match) => [match.id, normalizeLocalMatch(match)]));
  remoteMatches.filter(isClassicMatch).forEach((remoteMatch) => {
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
  await Promise.all(deletedIds.map((id) => familyRef.collection("players").doc(id).set({
    deleted: true,
    deletedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: DEVICE_ID
  }, { merge: true })));
  state.sync.deletedPlayerIds = [];
}

async function pushLocalData(familyRef) {
  const playerWrites = normalizePlayers(state.players).map((player) => (
    familyRef.collection("players").doc(player.id).set(preparePlayerForRemote(player), { merge: true })
  ));
  const matchWrites = getClassicMatches().map((match) => {
    const normalized = normalizeLocalMatch(match);
    return familyRef.collection("matches").doc(normalized.id).set(prepareMatchForRemote(normalized), { merge: true });
  });
  await Promise.all([...playerWrites, ...matchWrites]);
}

function queueActiveGameSync(expectedRevision) {
  if (!isSyncEnabled() || !state.activeGame) return;
  activeGameSyncPendingRevision = expectedRevision;
  window.clearTimeout(activeGameSyncTimer);
  activeGameSyncTimer = window.setTimeout(() => syncActiveGame(), 250);
}

async function syncActiveGame() {
  if (activeGameSyncRunning || activeGameSyncPendingRevision === null || !state.activeGame || !navigator.onLine) return;
  activeGameSyncRunning = true;
  const expectedRevision = activeGameSyncPendingRevision;
  activeGameSyncPendingRevision = null;
  const game = clone(state.activeGame);

  try {
    const db = await ensureFirebaseSession();
    const activeGameRef = db.collection("families").doc(state.sync.familyCode).collection("activeGames").doc("current");
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(activeGameRef);
      const remoteRevision = snapshot.exists ? Number(snapshot.data().revision || 0) : -1;
      if (remoteRevision > expectedRevision) throw new Error("ACTIVE_GAME_CONFLICT");
      transaction.set(activeGameRef, {
        ...prepareActiveGameForRemote(game),
        updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    setSyncRuntime("synced", "Laufende Partie synchron.", "", false);
  } catch (error) {
    if (error && error.message === "ACTIVE_GAME_CONFLICT") {
      state.message = "Die Partie wurde gerade auf einem anderen Geraet geaendert. Der aktuelle Stand wird geladen.";
      setSyncRuntime("error", "Konflikt bei der laufenden Partie.", "", false);
    } else {
      setSyncRuntime("error", "Laufende Partie konnte nicht synchronisiert werden.", error && error.message ? error.message : "", false);
    }
  } finally {
    activeGameSyncRunning = false;
    saveState();
    renderMainOnly();
    if (activeGameSyncPendingRevision !== null) syncActiveGame();
  }
}

async function clearRemoteActiveGame(expectedRevision) {
  if (!isSyncEnabled() || !navigator.onLine) return;
  try {
    const db = await ensureFirebaseSession();
    const activeGameRef = db.collection("families").doc(state.sync.familyCode).collection("activeGames").doc("current");
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(activeGameRef);
      if (!snapshot.exists || Number(snapshot.data().revision || 0) > expectedRevision) return;
      transaction.delete(activeGameRef);
    });
  } catch {
    state.message = "Die laufende Partie konnte noch nicht aus der Familie entfernt werden.";
    saveState();
  }
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

function normalizeRemoteActiveGame(data) {
  const base = normalizeRemoteMatch(data && data.id ? data.id : "active", data);
  if (!base || !base.players.length) return null;
  return {
    ...base,
    finishedAt: normalizeDateValue(data.finishedAt) || null,
    startingIndex: Math.max(0, Math.min(Number(data.startingIndex || 0), base.players.length - 1)),
    sharedRemaining: Number(data.sharedRemaining ?? base.startScore),
    dartsThrown: Number(data.dartsThrown || 0),
    lastSavedRound: Array.isArray(data.lastSavedRound) ? data.lastSavedRound : [],
    currentIndex: Math.max(0, Math.min(Number(data.currentIndex || 0), base.players.length - 1)),
    currentThrows: Array.isArray(data.currentThrows)
      ? data.currentThrows.map((dart) => ({
        value: Number(dart.value || 0),
        label: String(dart.label || dart.value || 0),
        type: String(dart.type || "single")
      }))
      : [],
    history: Array.isArray(data.history) ? data.history : [],
    lastReaction: data.lastReaction || null,
    revision: Number(data.revision || 0),
    updatedAt: normalizeDateValue(data.updatedAt),
    deviceId: String(data.deviceId || "")
  };
}

function normalizeRemoteMatch(id, data) {
  if (!data || !id || !Array.isArray(data.players)) return null;
  return {
    id,
    mode: String(data.mode || "classic"),
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
      roundScores: Array.isArray(player.roundScores) ? player.roundScores.map(Number) : [],
      roundDetails: Array.isArray(player.roundDetails) ? player.roundDetails.map(normalizeRoundDetail) : []
    }))
  };
}

function normalizeRoundDetail(roundDetail) {
  return {
    darts: Array.isArray(roundDetail && roundDetail.darts) ? roundDetail.darts.map((dart) => ({
      value: Number(dart.value || 0),
      label: String(dart.label || dart.value || 0),
      type: String(dart.type || "single")
    })) : [],
    score: Number(roundDetail && roundDetail.score || 0),
    bust: Boolean(roundDetail && roundDetail.bust)
  };
}

function preparePlayerForRemote(player) {
  return {
    name: String(player.name || "Spieler").slice(0, 18),
    color: player.color || colors[0],
    avatar: normalizeAvatar(player.avatar, player.color || colors[0]),
    deleted: false,
    createdAt: player.createdAt || new Date().toISOString(),
    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: DEVICE_ID
  };
}

function prepareMatchForRemote(match) {
  if (!isClassicMatch(match)) throw new Error("DartMix darf nicht als Statistik gespeichert werden.");
  return {
    id: match.id,
    mode: "classic",
    startScore: match.startScore,
    createdAt: match.createdAt,
    finishedAt: match.finishedAt,
    checkout: match.checkout,
    winnerId: match.winnerId,
    players: match.players
  };
}

function prepareActiveGameForRemote(game) {
  return {
    id: game.id,
    mode: game.mode || "classic",
    sharedRemaining: isRestjagd(game) ? game.sharedRemaining : null,
    startingIndex: game.startingIndex || 0,
    dartsThrown: game.dartsThrown || 0,
    lastSavedRound: game.lastSavedRound || [],
    startScore: game.startScore,
    createdAt: game.createdAt,
    finishedAt: game.finishedAt || null,
    checkout: game.checkout,
    winnerId: game.winnerId || null,
    currentIndex: game.currentIndex,
    currentThrows: game.currentThrows || [],
    history: [],
    lastReaction: game.lastReaction || null,
    revision: Number(game.revision || 0),
    deviceId: DEVICE_ID,
    players: game.players
  };
}

function compareCreatedAt(a, b) {
  return getTime(a.createdAt) - getTime(b.createdAt);
}

function getTime(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function createGame(players, setup, startingIndex = 0, revision = 0) {
  const restjagd = setup.mode === "restjagd";
  const startScore = restjagd ? Math.floor(Math.random() * 179) + 2 : setup.startScore;
  return {
    id: createId(),
    mode: restjagd ? "restjagd" : "classic",
    startScore,
    sharedRemaining: restjagd ? startScore : null,
    dartsThrown: 0,
    checkout: setup.checkout === "double" ? "double" : "straight",
    startingIndex,
    currentIndex: startingIndex,
    currentThrows: [],
    history: [],
    revision,
    updatedAt: new Date().toISOString(),
    deviceId: DEVICE_ID,
    lastReaction: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    winnerId: null,
    players: players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      avatar: normalizeAvatar(player.avatar, player.color),
      guest: Boolean(player.guest),
      remaining: restjagd ? 0 : startScore,
      rounds: 0,
      throwsTotal: 0,
      highestThrow: 0,
      totalDarts: 0,
      dartCounts: {},
      typeCounts: createTypeCounts(),
      roundScores: [],
      roundDetails: []
    }))
  };
}

function startGame() {
  if (state.activeGame) return;
  const mode = getSetupMode();
  const selected = state.setup.selectedPlayerIds.map((id) => state.players.find((player) => player.id === id)).filter(Boolean);
  const allPlayers = [...selected, ...guestPlayers];
  if (allPlayers.length < mode.minPlayers) return;
  state.activeGame = createGame(allPlayers, { ...state.setup, checkout: mode.fixedCheckout || state.setup.checkout });
  guestPlayers = [];
  state.message = "";
  saveAndRender();
  if (isRestjagd(state.activeGame)) openRestjagdIntro(state.activeGame);
  queueActiveGameSync(-1);
}

function startRestjagdRematch() {
  const game = state.activeGame;
  if (!isRestjagd(game) || !game.finishedAt || !game.players.length) return;
  const expectedRevision = Number(game.revision || 0);
  const startingIndex = ((game.startingIndex || 0) + 1) % game.players.length;
  state.activeGame = createGame(game.players, game, startingIndex, expectedRevision + 1);
  state.message = "";
  saveAndRenderMain();
  openRestjagdIntro(state.activeGame);
  queueActiveGameSync(expectedRevision);
}

function submitRound() {
  const game = state.activeGame;
  if (!game || game.finishedAt) return;
  const expectedRevision = Number(game.revision || 0);
  const turn = evaluateTurn(game);
  const throws = turn.usedDarts;
  if (!throws.length) {
    state.message = "Bitte erst mindestens einen Dart auswaehlen.";
    renderMainOnly();
    return;
  }
  const player = game.players[game.currentIndex];
  game.history.push(createUndoSnapshot(game));
  if (isRestjagd(game)) game.dartsThrown += throws.length;
  if (turn.bust) {
    game.lastReaction = { playerId: player.id, type: "bust" };
    state.message = `${player.name}: Bust! Der Rest bleibt bei ${getGameRemaining(game)}.`;
  } else {
    if (isRestjagd(game)) {
      game.sharedRemaining = turn.remaining;
    } else {
      player.rounds += 1;
      recordDartDetails(player, throws);
      player.remaining = turn.remaining;
      player.throwsTotal += turn.score;
      player.highestThrow = Math.max(player.highestThrow, turn.score);
      player.roundScores.push(turn.score);
      player.roundDetails.push({ darts: clone(throws), score: turn.score, bust: false });
    }
    game.lastReaction = turn.score >= 100 ? { playerId: player.id, type: "big" } : null;
    state.message = turn.score === 180 ? "180! Sehr stark." : "";
  }
  game.currentThrows = [];
  game.lastSavedRound = clone(throws);
  if (turn.finished) {
    game.finishedAt = new Date().toISOString();
    game.winnerId = player.id;
    game.lastReaction = { playerId: player.id, type: "winner" };
    if (!isRestjagd(game)) {
      state.matches.push({
        id: game.id, mode: "classic", startScore: game.startScore,
        createdAt: game.createdAt, finishedAt: game.finishedAt,
        checkout: game.checkout, winnerId: game.winnerId,
        players: game.players.map((snapshot) => ({ ...snapshot }))
      });
    }
    state.message = "";
  } else {
    game.currentIndex = (game.currentIndex + 1) % game.players.length;
  }
  game.revision = expectedRevision + 1;
  game.updatedAt = new Date().toISOString();
  game.deviceId = DEVICE_ID;
  saveAndRenderMain();
  scrollToActiveScore();
  if (turn.finished && !isRestjagd(game)) {
    clearRemoteActiveGame(game.revision);
    queueSync();
  } else {
    // DartMix keeps only the current game, so other devices can show its winner too.
    queueActiveGameSync(expectedRevision);
  }
}

function scrollToActiveScore() {
  window.requestAnimationFrame(() => {
    const remaining = document.querySelector(".shared-score .remaining, .scorecard.active .remaining");
    if (!remaining) return;
    remaining.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });
}

function undo() {
  const game = state.activeGame;
  if (!game || game.finishedAt || !game.history.length) return;
  const expectedRevision = Number(game.revision || 0);
  const previous = game.history.pop();
  state.activeGame = {
    ...previous,
    history: game.history,
    revision: expectedRevision + 1,
    updatedAt: new Date().toISOString(),
    deviceId: DEVICE_ID
  };
  state.message = "Letzte Eingabe wurde zurueckgenommen.";
  saveAndRenderMain();
  queueActiveGameSync(expectedRevision);
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
  if (evaluateTurn(game).terminal) return;
  game.currentThrows.push({ value: Number(value), label, type });
  state.message = "";
  saveAndRenderMain();
  // The original button was replaced by renderMainOnly; animate the new one.
  const pressedButton = [...app.querySelectorAll('[data-action="add-dart"]')]
    .find((button) => button.dataset.label === label && button.dataset.type === type);
  if (pressedButton) {
    pressedButton.classList.add("dart-feedback");
    pressedButton.addEventListener("animationend", () => {
      pressedButton.classList.remove("dart-feedback");
    }, { once: true });
  }
  if (evaluateTurn(game).terminal) {
    // Let the confirmation show before scrolling the keypad out of view.
    const confirmedDart = game.currentThrows[game.currentThrows.length - 1];
    window.setTimeout(() => scrollToSubmitRound(game, confirmedDart), 300);
  }
}

function scrollToSubmitRound(game, confirmedDart) {
  window.requestAnimationFrame(() => {
    if (state.activeView !== "game" || state.activeGame !== game
      || !evaluateTurn(game).terminal || game.currentThrows[game.currentThrows.length - 1] !== confirmedDart) return;
    const submitButton = document.querySelector('[data-action="submit-round"]');
    if (!submitButton) return;
    submitButton.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  });
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
  if (!game || game.finishedAt || !game.currentThrows || game.currentThrows.length === 0) return;
  game.currentThrows.pop();
  saveAndRenderMain();
}

function clearThrows() {
  if (!state.activeGame || state.activeGame.finishedAt) return;
  state.activeGame.currentThrows = [];
  saveAndRenderMain();
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

function closeWelcome() {
  welcomeOpen = false;
  state.welcomeSeen = true;
  saveAndRender();
}

function showUpdateReady(worker) {
  if (!worker) return;
  updateWorker = worker;
  updateReady = true;
  updateApplying = false;
  render();
}

async function checkForAppUpdate() {
  if (!serviceWorkerRegistration || updateCheckRunning) {
    updateCheckQueued = Boolean(serviceWorkerRegistration);
    return;
  }
  updateCheckRunning = true;
  updateCheckQueued = false;
  try {
    await serviceWorkerRegistration.update();
    watchServiceWorker(serviceWorkerRegistration);
  } catch {
    // Offline or an unavailable update server must not interrupt the app.
  } finally {
    updateCheckRunning = false;
    if (updateCheckQueued) {
      updateCheckQueued = false;
      window.setTimeout(() => checkForAppUpdate(), 1000);
    }
  }
}

async function applyUpdate() {
  updateApplying = true;
  updateReady = true;
  render();

  try {
    const registration = serviceWorkerRegistration || await navigator.serviceWorker.getRegistration();
    if (registration && typeof registration.update === "function") await registration.update().catch(() => {});
    const worker = (registration && (registration.waiting || registration.installing)) || updateWorker;
    if (worker) {
      if (worker.state !== "activated") worker.postMessage({ type: "SKIP_WAITING" });
      window.setTimeout(() => {
        if (!updateReloading) {
          updateReloading = true;
          window.location.reload();
        }
      }, 1500);
      return;
    }
  } catch {
    // The reload below is the fallback for browsers with incomplete SW update support.
  }

  window.setTimeout(() => {
    if (!updateReloading) {
      updateReloading = true;
      window.location.reload();
    }
  }, 250);
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
  const expectedRevision = Number(state.activeGame.revision || 0);
  state.activeGame = null;
  state.message = "";
  saveAndRender();
  clearRemoteActiveGame(expectedRevision);
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
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "skip-restjagd-intro") skipRestjagdIntro();
  if (action === "set-view") {
    state.activeView = button.dataset.view;
    if (state.activeView !== "stats") activeStatsPlayerId = null;
    state.message = "";
    saveAndRender();
  }
  if (action === "open-mode-picker") openModePicker();
  if (action === "close-mode-picker") closeModePicker();
  if (action === "apply-mode") closeModePicker(true);
  if (action === "mode-category") {
    modePickerCategory = button.dataset.category;
    refreshModePicker(`#mode-tab-${modePickerCategory}`);
  }
  if (action === "pick-mode") {
    pendingModeId = button.dataset.modeId;
    refreshModePicker(`[data-mode-id="${pendingModeId}"]`);
  }
  if (action === "set-checkout" && !state.activeGame && !getSetupMode().fixedCheckout) {
    state.setup.checkout = button.dataset.checkout === "double" ? "double" : "straight";
    saveAndRender();
  }
  if (action === "restjagd-rematch") startRestjagdRematch();
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
    const expectedRevision = Number(state.activeGame && state.activeGame.revision || 0);
    state.activeGame = null;
    state.message = "";
    saveAndRender();
    clearRemoteActiveGame(expectedRevision);
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
  if (action === "show-match-details") {
    activeMatchId = button.dataset.matchId;
    render();
  }
  if (action === "close-match-details") {
    activeMatchId = null;
    render();
  }
  if (action === "show-global-hit-details") {
    activeGlobalHitCategory = button.dataset.category;
    render();
  }
  if (action === "close-global-hit-details") {
    activeGlobalHitCategory = "";
    render();
  }
  if (action === "install-app") installApp();
  if (action === "close-install-help") closeInstallHelp();
  if (action === "close-welcome") closeWelcome();
  if (action === "rename-player") renamePlayer(button.dataset.playerId);
  if (action === "delete-player") deletePlayer(button.dataset.playerId);
  if (action === "sync-now") syncWithFirebase({ manual: true });
  if (action === "open-family-code") openFamilyCodeEditor();
  if (action === "close-family-code") closeFamilyCodeEditor();
  if (action === "apply-update") applyUpdate();
  if (action === "reset-family-tree") resetFamilyTree();
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
  if (isRestjagdIntroVisible()) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipRestjagdIntro();
    }
    return;
  }
  if (modePickerOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModePicker();
    } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && event.target.matches('[role="tab"]')) {
      event.preventDefault();
      modePickerCategory = modePickerCategory === "classic" ? "dartmix" : "classic";
      refreshModePicker(`#mode-tab-${modePickerCategory}`);
    } else if (event.key === "Tab") {
      const controls = [...app.querySelectorAll('.mode-picker button:not([disabled]):not([tabindex="-1"])')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.key === "Enter" && state.activeGame && state.activeView === "game"
    && !event.target.closest("button, input, textarea, select") && !app.querySelector('[role="dialog"]')) {
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
      serviceWorkerRegistration = registration;
      watchServiceWorker(registration);
      checkForAppUpdate();
    }).catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForAppUpdate();
  });

  window.setInterval(() => {
    checkForAppUpdate();
  }, 30 * 60 * 1000);
}

function watchServiceWorker(registration) {
  serviceWorkerRegistration = registration;
  if (registration.waiting && navigator.serviceWorker.controller) showUpdateReady(registration.waiting);
  if (serviceWorkerWatchAttached) return;
  serviceWorkerWatchAttached = true;

  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdateReady(worker);
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
