/*
  Colour Clash static app
  1. Add your Supabase values below.
  2. Upload index.html, styles.css, app.js, rounds.js and the rounds folder.
*/

const SUPABASE_URL = "https://tfkecqghkkceubdmzted.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Y1la5yVRPmcQEvMMOTz_Ug_U3aJmjM3";

const ROUNDS = window.COLOUR_GAME_ROUNDS || [];
const DEFAULT_COLOUR = { r: 128, g: 128, b: 128 };
const MAX_RGB_DISTANCE = Math.sqrt(255 ** 2 + 255 ** 2 + 255 ** 2);

let supabaseClient = null;
let appState = {
  view: new URLSearchParams(window.location.search).get("view") || "home",
  game: null,
  player: null,
  players: [],
  guesses: [],
  selectedColour: DEFAULT_COLOUR,
  timeLeft: 30,
  channel: null,
  timer: null,
  adminTimer: null,
  endingRound: false,
  isPickingColour: false,
  saveGuessTimer: null,
  pendingGuess: null,
  isSavingGuess: false,
};

const app = document.getElementById("app");

function init() {
  if (!window.supabase) {
    app.innerHTML = errorScreen("Supabase library could not load. Check your internet connection or CDN access.");
    return;
  }

  if (SUPABASE_URL.includes("PASTE_") || SUPABASE_ANON_KEY.includes("PASTE_")) {
    app.innerHTML = errorScreen("Add your Supabase URL and anon key at the top of app.js first.");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  render();
}

function setView(view) {
  appState.view = view;
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.pushState({}, "", url);
  render();
}

function errorScreen(message) {
  return `
    <div class="game-shell">
      <div class="game-window mx-auto max-w-xl">
        <div class="game-window-header">Setup needed</div>
        <div class="game-window-body text-center">
          <div class="text-6xl">⚠️</div>
          <h1 class="text-3xl font-black mt-4">${escapeHtml(message)}</h1>
        </div>
      </div>
    </div>
  `;
}

function render() {
  app.className = "game-bg";

  if (appState.view === "admin") return renderAdmin();
  if (appState.view === "player") return renderPlayer();
  return renderHome();
}

function renderHome() {
  app.innerHTML = `
    <div class="game-shell">
      <section class="mx-auto max-w-3xl text-center">
        <div class="mb-8"><div class="game-ribbon">Colour Clash</div></div>
        <h1 class="game-title">Guess the colour!</h1>
        <p class="game-subtitle mx-auto mt-6">A fast multiplayer colour guessing game. Join a room, pick the closest colour and climb the scoreboard.</p>
        <div class="grid-2 mt-8">
          <div class="game-window">
            <div class="game-window-header">Player</div>
            <div class="game-window-body text-center">
              <div class="text-6xl">🎨</div>
              <h2 class="text-3xl font-black mt-4">Join game</h2>
              <p class="font-bold mt-3">Enter a room code and get ready to play.</p>
              <button class="game-button w-full mt-6" data-action="go-player">Join</button>
            </div>
          </div>
          <div class="game-window">
            <div class="game-window-header">Admin</div>
            <div class="game-window-body text-center">
              <div class="text-6xl">🏆</div>
              <h2 class="text-3xl font-black mt-4">Run game</h2>
              <p class="font-bold mt-3">Create a room and control each round.</p>
              <button class="game-button game-button-blue w-full mt-6" data-action="go-admin">Create</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  bind("go-player", () => setView("player"));
  bind("go-admin", () => setView("admin"));
}

async function renderAdmin() {
  if (!appState.game) {
    app.innerHTML = `
      <div class="game-shell">
        <div class="game-window">
          <div class="game-window-header">Admin control</div>
          <div class="game-window-body row">
            <div>
              <h1 class="text-4xl font-black">Colour Clash</h1>
              <p class="font-bold mt-3">Create a game room, share the room code, then start each round manually.</p>
            </div>
            <button class="game-button" data-action="create-game">Create game</button>
          </div>
        </div>
      </div>
    `;
    bind("create-game", createGame);
    return;
  }

  const game = appState.game;
  const players = appState.players;
  const readyCount = players.filter((p) => p.is_ready).length;
  const currentRound = game.current_round ? ROUNDS[game.current_round - 1] : null;
  const currentRoundGuesses = appState.guesses.filter((g) => g.round_number === game.current_round);

  app.innerHTML = `
    <div class="game-shell stack">
      <header class="game-window">
        <div class="game-window-header">Admin control</div>
        <div class="game-window-body row">
          <div>
            <h1 class="text-4xl font-black">Colour Clash</h1>
            <div class="row mt-3">
              <span class="game-pill">Room ${escapeHtml(game.room_code)}</span>
              <span class="game-pill">👥 ${players.length} players</span>
              <span class="game-pill">✅ ${readyCount}/${players.length} ready</span>
            </div>
          </div>
          <button class="game-button-grey" data-action="reset-game">Reset game</button>
        </div>
      </header>

      <div class="game-split">
        <section class="game-split-panel">
          <div class="game-window">
            <div class="game-window-header">Game status</div>
            <div class="game-window-body">${adminStatusMarkup(game, currentRound, currentRoundGuesses)}</div>
          </div>
        </section>
        <aside class="game-split-panel stack">
          ${scoreboardMarkup(players, "Scoreboard")}
          ${playersMarkup(players)}
        </aside>
      </div>
    </div>
  `;

  bind("reset-game", resetGame);
  bind("start-round", startNextRound);
  bind("end-round", endRound);
  startAdminTimerIfNeeded();
}

function adminStatusMarkup(game, currentRound, currentRoundGuesses) {
  if (game.status === "lobby") {
    return `
      <div class="row">
        <div>
          <span class="game-pill">Lobby</span>
          <h2 class="text-4xl font-black mt-4">Waiting for players</h2>
          <p class="font-bold mt-3">${appState.players.filter((p) => p.is_ready).length} of ${appState.players.length} players are ready.</p>
        </div>
        <div class="text-6xl">🎮</div>
      </div>
      <div class="stack mt-6">${playerListRows(appState.players)}</div>
      <button class="game-button game-button-green mt-8" data-action="start-round" ${appState.players.length === 0 ? "disabled" : ""}>Start round 1</button>
    `;
  }

  if (game.status === "round_active" && currentRound) {
    return `
      <div class="row">
        <div>
          <span class="game-pill">Round ${game.current_round} / ${ROUNDS.length}</span>
          <h2 class="text-3xl font-black mt-4">${escapeHtml(currentRound.question)}</h2>
        </div>
        <div class="game-timer"><span class="game-timer-label">Time</span><span class="game-timer-value" id="admin-time">30</span></div>
      </div>
      <div class="game-split mt-6">
        <section class="game-split-panel">
          <div class="image-stage" style="min-height:420px;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--panel)">
            <div class="image-colour-layer" style="background:rgb(220,220,220)">
              <img src="${currentRound.image}" alt="" style="max-height:340px;max-width:100%;object-fit:contain" />
            </div>
          </div>
        </section>
        <section class="game-split-panel">
          <div class="game-card">
            <div class="game-window-header">Live round</div>
            <div class="game-card-inner text-center">
              <div class="text-6xl">⚡</div>
              <p class="text-3xl font-black mt-4">${currentRoundGuesses.length} / ${appState.players.length}</p>
              <p class="font-bold">players have picked a colour.</p>
              <button class="game-button w-full mt-6" data-action="end-round">End round now</button>
            </div>
          </div>
        </section>
      </div>
    `;
  }

  if (game.status === "round_results" && currentRound) {
    return `
      <div class="row">
        <div>
          <span class="game-pill">Round ${game.current_round} results</span>
          <h2 class="text-3xl font-black mt-4">${escapeHtml(currentRound.question)}</h2>
        </div>
        <div class="text-6xl">🏁</div>
      </div>
      <div class="game-split mt-6">
        <section class="game-split-panel">
          <div class="game-card" style="padding:1.25rem;color:white;background:${rgbToCss(currentRound.correctRgb)}">
            <div class="text-3xl font-black">Correct colour</div>
          </div>
        </section>
        <section class="game-split-panel">
          <div class="game-card" style="padding:1.25rem">
            <div class="text-3xl font-black">Next action</div>
            <p class="font-bold mt-3">Scores are in. Start the next round when everyone is ready.</p>
            <button class="game-button game-button-green w-full mt-6" data-action="start-round">${game.current_round >= ROUNDS.length ? "Show final scoreboard" : "Start next round"}</button>
          </div>
        </section>
      </div>
    `;
  }

  return `<div class="text-center">${scoreboardMarkup(appState.players, "Final scoreboard")}</div>`;
}

async function renderPlayer() {
  if (!appState.game || !appState.player) {
    app.innerHTML = `
      <div class="game-shell">
        <section class="mx-auto max-w-xl">
          <div class="mb-8 text-center"><div class="game-ribbon">Join game</div></div>
          <div class="game-window">
            <div class="game-window-header">Enter the arena</div>
            <div class="game-window-body">
              <div class="text-center text-6xl mb-6">🎨</div>
              <div class="stack">
                <div><label class="game-label">Room code</label><input id="room-code" class="game-input" placeholder="ABC123" /></div>
                <div><label class="game-label">Your name</label><input id="player-name" class="game-input" placeholder="Name" /></div>
                <button class="game-button w-full" data-action="join-game">Play!</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;
    bind("join-game", joinGame);
    return;
  }

  const game = appState.game;
  const player = appState.player;
  const currentRound = game.current_round ? ROUNDS[game.current_round - 1] : null;

  if (game.status === "lobby") {
    app.innerHTML = `
      <div class="game-shell">
        <div class="mb-8 text-center"><div class="game-ribbon">Lobby</div></div>
        <div class="game-split">
          <section class="game-split-panel">
            <div class="game-window">
              <div class="game-window-header">Ready up</div>
              <div class="game-window-body text-center">
                <div class="text-6xl">⭐</div>
                <h1 class="text-4xl font-black mt-4">Hi, ${escapeHtml(player.name)}</h1>
                <p class="font-bold mt-3">Mark yourself ready and wait for the admin to start the round.</p>
                <div class="mt-5"><span class="game-pill">Room ${escapeHtml(game.room_code)}</span></div>
                <button class="game-button game-button-green mt-8" data-action="ready" ${player.is_ready ? "disabled" : ""}>${player.is_ready ? "Ready!" : "I'm ready"}</button>
              </div>
            </div>
          </section>
          <section class="game-split-panel">${playersMarkup(appState.players)}</section>
        </div>
      </div>
    `;
    bind("ready", markReady);
    return;
  }

  if (game.status === "round_active" && currentRound) {
    app.innerHTML = `
      <div class="game-shell">
        <div class="game-window">
          <div class="game-window-header">Colour challenge</div>
          <div class="game-window-body">
            <div class="row mb-6">
              <div><span class="game-pill">Round ${game.current_round} / ${ROUNDS.length}</span><h1 class="text-3xl font-black mt-4">${escapeHtml(currentRound.question)}</h1></div>
              <div class="game-timer"><span class="game-timer-label">Time</span><span class="game-timer-value" id="player-time">30</span></div>
            </div>
            <div class="game-split">
              <section class="game-split-panel">
                <div class="image-stage" style="height:100%;min-height:620px;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--panel)">
                  <div class="image-colour-layer" id="live-image" style="background:${rgbToCss(appState.selectedColour)}">
                    <img src="${currentRound.image}" alt="" style="max-height:520px;max-width:100%;object-fit:contain" />
                  </div>
                </div>
              </section>
              <section class="game-split-panel">${colourPickerMarkup(appState.selectedColour)}</section>
            </div>
          </div>
        </div>
      </div>
    `;
    bindColourPicker();
    startPlayerTimerIfNeeded();
    return;
  }

  if (game.status === "round_results" && currentRound) {
    const myGuess = appState.guesses.find((g) => g.player_id === player.id && g.round_number === game.current_round);
    const roundGuesses = appState.guesses.filter((g) => g.round_number === game.current_round);
    const userColour = myGuess ? { r: myGuess.r, g: myGuess.g, b: myGuess.b } : DEFAULT_COLOUR;

    app.innerHTML = `
      <div class="game-shell">
        <div class="game-window">
          <div class="game-window-header">Round results</div>
          <div class="game-window-body">
            <div class="row mb-6">
              <div><span class="game-pill">Round ${game.current_round} / ${ROUNDS.length}</span><h1 class="text-3xl font-black mt-4">${escapeHtml(currentRound.question)}</h1></div>
              <div class="game-score-banner">You scored ${myGuess?.score || 0} points</div>
            </div>
            <div class="game-split">
              <section class="game-split-panel">
                <div class="game-card">
                  <div class="game-window-header">Correct colour</div>
                  <div class="game-card-inner"><div class="image-stage" style="min-height:520px;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--panel)"><div class="image-colour-layer" style="background:${rgbToCss(currentRound.correctRgb)}"><img src="${currentRound.image}" alt="" style="max-height:450px;max-width:100%;object-fit:contain" /></div></div></div>
                </div>
              </section>
              <section class="game-split-panel">
                <div class="game-card">
                  <div class="game-window-header">Your colour</div>
                  <div class="game-card-inner"><div class="image-stage" style="min-height:520px;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--panel)"><div class="image-colour-layer" style="background:${rgbToCss(userColour)}"><img src="${currentRound.image}" alt="" style="max-height:450px;max-width:100%;object-fit:contain" /></div></div></div>
                </div>
              </section>
            </div>
            <div class="mt-6">${scoreboardMarkup(appState.players, "Round scoreboard", roundGuesses)}</div>
            <p class="text-center font-bold mt-6">Waiting for the admin to start the next round.</p>
          </div>
        </div>
      </div>
    `;
    return;
  }

  app.innerHTML = `<div class="game-shell"><div class="mb-8 text-center"><div class="game-ribbon">Final scores</div></div>${scoreboardMarkup(appState.players, "Final scoreboard")}</div>`;
}

function colourPickerMarkup(rgb) {
  const hsv = rgbToHsv(rgb);
  return `
    <div class="colour-picker-panel">
      <div class="row mb-4">
        <div><h2 class="text-3xl font-black">Your Guess</h2><p class="font-bold">Drag the picker to match the colour.</p></div>
        <div class="colour-preview" id="colour-preview" style="background:${rgbToCss(rgb)}"></div>
      </div>
      <div id="colour-square" class="colour-picker-square" style="background-color:hsl(${hsv.h},100%,50%);background-image:linear-gradient(to top, black, transparent), linear-gradient(to right, white, transparent)">
        <div id="colour-cursor" class="colour-picker-cursor" style="left:${hsv.s * 100}%;top:${(1 - hsv.v) * 100}%;background:${rgbToCss(rgb)}"></div>
      </div>
      <div class="mt-5"><label class="game-label">Hue</label><input id="hue-slider" class="hue-slider" type="range" min="0" max="360" value="${Math.round(hsv.h)}" /></div>
    </div>
  `;
}

function scoreboardMarkup(players, title = "Scoreboard", roundGuesses = null) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  const showColour = Array.isArray(roundGuesses);
  const rows = sorted.map((player, index) => {
    const guess = roundGuesses?.find((g) => g.player_id === player.id);
    const score = showColour && guess ? guess.score || 0 : player.total_score;
    const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;
    const colourCell = showColour ? `<td>${guess ? `<span class="colour-dot" style="background:${rgbToCss(guess)}"></span>` : "No guess"}</td>` : "";
    return `<tr><td>${medal}</td><td>${escapeHtml(player.name)}</td>${colourCell}<td style="text-align:right"><span class="score-chip">${score}</span></td></tr>`;
  }).join("") || `<tr><td colspan="${showColour ? 4 : 3}">No players yet.</td></tr>`;

  return `
    <div class="game-card">
      <div class="game-window-header">${escapeHtml(title)}</div>
      <div class="game-card-inner">
        <div class="row mb-4"><span class="game-pill">🏁 Rankings</span><span class="game-pill">👥 ${players.length}</span></div>
        <table class="game-table"><thead><tr><th style="text-align:left">Rank</th><th style="text-align:left">Player</th>${showColour ? `<th style="text-align:left">Colour</th>` : ""}<th style="text-align:right">Score</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>
  `;
}

function playersMarkup(players) {
  return `
    <div class="game-card">
      <div class="game-window-header">Players</div>
      <div class="game-card-inner stack">${playerListRows(players)}</div>
    </div>
  `;
}

function playerListRows(players) {
  return players.map((p) => `
    <div class="row" style="background:var(--panel)df0;padding:1rem;border-radius:1rem;box-shadow:0 4px 0 rgba(84,62,105,.18)">
      <span class="font-black">${escapeHtml(p.name)}</span>
      <span class="${p.is_ready ? "ready-chip" : "waiting-chip"}">${p.is_ready ? "Ready" : "Waiting"}</span>
    </div>
  `).join("") || `<div class="text-center font-black" style="background:var(--panel)df0;padding:1rem;border-radius:1rem">No players yet.</div>`;
}

async function createGame() {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { data, error } = await supabaseClient.from("games").insert({ room_code: roomCode, status: "lobby", current_round: 0 }).select().single();
  if (error) return alert(error.message);
  appState.game = data;
  await subscribeToGame(data.id);
  await loadGameData(data.id);
  render();
}

async function joinGame() {
  const roomCode = document.getElementById("room-code").value.trim().toUpperCase();
  const name = document.getElementById("player-name").value.trim();
  if (!roomCode || !name) return;

  const { data: game, error: gameError } = await supabaseClient.from("games").select("*").eq("room_code", roomCode).single();
  if (gameError || !game) return alert("Room not found");

  const { data: player, error: playerError } = await supabaseClient.from("players").insert({ game_id: game.id, name }).select().single();
  if (playerError || !player) return alert(playerError?.message || "Unable to join game");

  appState.game = game;
  appState.player = player;
  await subscribeToGame(game.id);
  await loadGameData(game.id);
  render();
}

async function markReady() {
  if (!appState.player) return;
  const { data } = await supabaseClient.from("players").update({ is_ready: true }).eq("id", appState.player.id).select().single();
  if (data) appState.player = data;
  await loadGameData(appState.game.id);
  render();
}

async function startNextRound() {
  const game = appState.game;
  if (!game) return;
  const nextRound = game.current_round === 0 ? 1 : game.current_round + 1;
  if (nextRound > ROUNDS.length) {
    await supabaseClient.from("games").update({ status: "finished", round_started_at: null }).eq("id", game.id);
    return;
  }
  await supabaseClient.from("games").update({ status: "round_active", current_round: nextRound, round_started_at: new Date().toISOString() }).eq("id", game.id);
}

async function endRound() {
  const game = appState.game;
  const currentRound = game?.current_round ? ROUNDS[game.current_round - 1] : null;
  if (!game || !currentRound || appState.endingRound) return;
  appState.endingRound = true;

  const [{ data: players }, { data: guesses }] = await Promise.all([
    supabaseClient.from("players").select("*").eq("game_id", game.id),
    supabaseClient.from("guesses").select("*").eq("game_id", game.id).eq("round_number", game.current_round),
  ]);

  for (const player of players || []) {
    const existing = (guesses || []).find((g) => g.player_id === player.id);
    const playerGuess = existing ? { r: existing.r, g: existing.g, b: existing.b } : DEFAULT_COLOUR;
    const score = calculateScore(currentRound.correctRgb, playerGuess);
    await supabaseClient.from("guesses").upsert({ game_id: game.id, player_id: player.id, round_number: game.current_round, r: playerGuess.r, g: playerGuess.g, b: playerGuess.b, score }, { onConflict: "player_id,round_number" });
  }

  const { data: allGuesses } = await supabaseClient.from("guesses").select("*").eq("game_id", game.id);
  for (const player of players || []) {
    const total = (allGuesses || []).filter((g) => g.player_id === player.id).reduce((sum, g) => sum + (g.score || 0), 0);
    await supabaseClient.from("players").update({ total_score: total }).eq("id", player.id);
  }

  await supabaseClient.from("games").update({ status: "round_results", round_started_at: null }).eq("id", game.id);
  appState.endingRound = false;
}

async function resetGame() {
  const game = appState.game;
  if (!game) return;
  if (!confirm("Reset this game? This will clear players and guesses.")) return;
  await supabaseClient.from("guesses").delete().eq("game_id", game.id);
  await supabaseClient.from("players").delete().eq("game_id", game.id);
  await supabaseClient.from("games").update({ status: "lobby", current_round: 0, round_started_at: null }).eq("id", game.id);
  await loadGameData(game.id);
  render();
}

async function loadGameData(gameId) {
  const [{ data: game }, { data: players }, { data: guesses }] = await Promise.all([
    supabaseClient.from("games").select("*").eq("id", gameId).single(),
    supabaseClient.from("players").select("*").eq("game_id", gameId).order("created_at", { ascending: true }),
    supabaseClient.from("guesses").select("*").eq("game_id", gameId).order("created_at", { ascending: true }),
  ]);

  if (game) appState.game = game;
  appState.players = players || [];
  appState.guesses = guesses || [];
  if (appState.player) {
    appState.player = appState.players.find((p) => p.id === appState.player.id) || appState.player;
  }
}

async function subscribeToGame(gameId) {
  if (appState.channel) await supabaseClient.removeChannel(appState.channel);

  appState.channel = supabaseClient.channel(`colour-game-${gameId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, async () => { await loadGameData(gameId); render(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `game_id=eq.${gameId}` }, async () => { await loadGameData(gameId); render(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "guesses", filter: `game_id=eq.${gameId}` }, async () => {
      await loadGameData(gameId);

      // Do not re-render the player game screen while they are dragging/picking.
      // Re-rendering replaces the picker DOM and causes cursor jumps/image flicker.
      if (appState.view === "player" && appState.game?.status === "round_active") return;

      render();
    })
    .subscribe((status) => console.log("Realtime:", status));
}

function startPlayerTimerIfNeeded() {
  clearInterval(appState.timer);
  const game = appState.game;
  if (!game?.round_started_at || game.status !== "round_active") return;
  appState.timer = setInterval(() => {
    const remaining = getRemainingSeconds(game.round_started_at);
    const timer = document.getElementById("player-time");
    if (timer) timer.textContent = remaining;
    if (remaining <= 0) clearInterval(appState.timer);
  }, 250);
}

function startAdminTimerIfNeeded() {
  clearInterval(appState.adminTimer);
  const game = appState.game;
  if (!game?.round_started_at || game.status !== "round_active") return;
  let hasEnded = false;
  appState.adminTimer = setInterval(() => {
    const remaining = getRemainingSeconds(game.round_started_at);
    const timer = document.getElementById("admin-time");
    if (timer) timer.textContent = remaining;
    if (remaining <= 0 && !hasEnded) {
      hasEnded = true;
      clearInterval(appState.adminTimer);
      endRound();
    }
  }, 250);
}

function bindColourPicker() {
  const square = document.getElementById("colour-square");
  const slider = document.getElementById("hue-slider");
  if (!square || !slider) return;

  let frame = null;

  const updatePointer = (event) => {
    const rect = square.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const hsv = rgbToHsv(appState.selectedColour);
    const next = hsvToRgb({ h: hsv.h, s: x / rect.width, v: 1 - y / rect.height });

    // Keep DOM movement smooth even if pointer events fire very quickly.
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => setSelectedColour(next));
  };

  const startColourPick = (event) => {
    if (!appState.player || !appState.game || appState.game.status !== "round_active") return;

    appState.isPickingColour = true;
    document.body.classList.add("is-dragging-colour");

    event.preventDefault();
    event.stopPropagation();

    square.setPointerCapture?.(event.pointerId);
    updatePointer(event);
  };

  const moveColourPick = (event) => {
    if (!appState.isPickingColour) return;

    event.preventDefault();
    event.stopPropagation();

    updatePointer(event);
  };

  const endColourPick = (event) => {
    if (!appState.isPickingColour) return;

    appState.isPickingColour = false;
    document.body.classList.remove("is-dragging-colour");

    event.preventDefault();
    event.stopPropagation();

    if (event.pointerId !== undefined) {
      square.releasePointerCapture?.(event.pointerId);
    }

    flushPendingGuess();
  };

  square.addEventListener("pointerdown", startColourPick);
  square.addEventListener("pointermove", moveColourPick);
  square.addEventListener("pointerup", endColourPick);
  square.addEventListener("pointercancel", endColourPick);
  square.addEventListener("lostpointercapture", endColourPick);

  window.addEventListener("pointerup", () => {
    if (appState.isPickingColour) flushPendingGuess();
    appState.isPickingColour = false;
    document.body.classList.remove("is-dragging-colour");
  });

  window.addEventListener("blur", () => {
    if (appState.isPickingColour) flushPendingGuess();
    appState.isPickingColour = false;
    document.body.classList.remove("is-dragging-colour");
  });

  slider.addEventListener("pointerdown", () => {
    appState.isPickingColour = true;
    document.body.classList.add("is-dragging-colour");
  });

  slider.addEventListener("pointerup", () => {
    appState.isPickingColour = false;
    document.body.classList.remove("is-dragging-colour");
    flushPendingGuess();
  });

  slider.addEventListener("pointercancel", () => {
    appState.isPickingColour = false;
    document.body.classList.remove("is-dragging-colour");
    flushPendingGuess();
  });

  slider.addEventListener("input", (event) => {
    const hsv = rgbToHsv(appState.selectedColour);
    setSelectedColour(hsvToRgb({ h: Number(event.target.value), s: hsv.s, v: hsv.v }));
  });
}

function setSelectedColour(rgb) {
  appState.selectedColour = rgb;
  const liveImage = document.getElementById("live-image");
  const preview = document.getElementById("colour-preview");
  const cursor = document.getElementById("colour-cursor");
  const square = document.getElementById("colour-square");
  const slider = document.getElementById("hue-slider");
  const hsv = rgbToHsv(rgb);

  if (liveImage) liveImage.style.background = rgbToCss(rgb);
  if (preview) preview.style.background = rgbToCss(rgb);
  if (cursor) { cursor.style.background = rgbToCss(rgb); cursor.style.left = `${hsv.s * 100}%`; cursor.style.top = `${(1 - hsv.v) * 100}%`; }
  if (square) square.style.backgroundColor = `hsl(${hsv.h},100%,50%)`;
  if (slider && document.activeElement !== slider) slider.value = Math.round(hsv.h);

  scheduleGuessSave(rgb);
}

function scheduleGuessSave(rgb) {
  if (appState.game?.status !== "round_active" || !appState.player) return;

  appState.pendingGuess = rgb;
  clearTimeout(appState.saveGuessTimer);
  appState.saveGuessTimer = setTimeout(flushPendingGuess, 140);
}

async function flushPendingGuess() {
  if (!appState.pendingGuess || appState.isSavingGuess) return;
  if (appState.game?.status !== "round_active" || !appState.player) return;

  const rgb = appState.pendingGuess;
  appState.pendingGuess = null;
  appState.isSavingGuess = true;

  const game = appState.game;
  const player = appState.player;

  try {
    await supabaseClient.from("guesses").upsert({
      game_id: game.id,
      player_id: player.id,
      round_number: game.current_round,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
    }, { onConflict: "player_id,round_number" });
  } finally {
    appState.isSavingGuess = false;
    if (appState.pendingGuess) flushPendingGuess();
  }
}

function getRemainingSeconds(startedAt) {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  return Math.max(0, 30 - elapsed);
}

function calculateScore(correct, guess) {
  const distance = Math.sqrt((correct.r - guess.r) ** 2 + (correct.g - guess.g) ** 2 + (correct.b - guess.b) ** 2);
  const closeness = Math.max(0, 1 - distance / MAX_RGB_DISTANCE);

  // More punishing than a straight linear score:
  // close guesses still score well, clearly wrong colours drop much faster.
  return Math.max(0, Math.min(100, Math.round(Math.pow(closeness, 2.2) * 100)));
}

function rgbToCss(rgb) { return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`; }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function bind(action, handler) { document.querySelectorAll(`[data-action="${action}"]`).forEach((el) => el.addEventListener("click", handler)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }

function rgbToHsv({ r, g, b }) {
  const red = r / 255, green = g / 255, blue = b / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    if (max === green) h = 60 * ((blue - red) / delta + 2);
    if (max === blue) h = 60 * ((red - green) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let red = 0, green = 0, blue = 0;
  if (h >= 0 && h < 60) { red = c; green = x; }
  else if (h >= 60 && h < 120) { red = x; green = c; }
  else if (h >= 120 && h < 180) { green = c; blue = x; }
  else if (h >= 180 && h < 240) { green = x; blue = c; }
  else if (h >= 240 && h < 300) { red = x; blue = c; }
  else { red = c; blue = x; }
  return { r: Math.round((red + m) * 255), g: Math.round((green + m) * 255), b: Math.round((blue + m) * 255) };
}

window.addEventListener("popstate", () => {
  appState.view = new URLSearchParams(window.location.search).get("view") || "home";
  render();
});

init();
