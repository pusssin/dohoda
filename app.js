const app = document.getElementById("app");

const initialHash = location.hash.replace("#", "");

const state = {
  view: initialHash === "admin" ? "admin" : location.hash.startsWith("#room-") ? "room" : "home",
  activeProfileId: "u1",
  activeRoomId: location.hash.replace("#", "") || "room-team",
  expandedProfileRoomId: "",
  adminFilter: "active",
  adminRoomId: "",
  activeTool: "map",
  sessionName: localStorage.getItem("dohoda.participantName") || "",
  authUser: null,
  authMode: "login",
  authError: "",
  inviteRoom: null,
  inviteError: "",
  googleConfigured: false,
  sourceDialogOpen: false,
  theme: localStorage.getItem("dohoda.theme") || "light",
  soundEnabled: localStorage.getItem("dohoda.soundEnabled") === "true",
  soundPrimed: false,
  audioContext: null,
  roomActivitySignatures: {},
  collapsedMessages: {},
  online: false,
  aiConfigured: false,
  databaseConfigured: false,
  requestInProgress: false,
  advancedOpen: false,
  experimentalOpen: false,
  inviteToken: new URLSearchParams(location.search).get("invite") || "",
  profiles: [
    {
      id: "u1",
      name: "Anna Nováková",
      privateNotes: {
        "room-team": [
          {
            author: "AI pro Annu",
            text:
              "Tady je soukromý prostor. Do společné místnosti nepřenesu nic bez výslovného potvrzení.",
            ai: true,
          },
        ],
        "room-family": [
          {
            author: "AI pro Annu",
            text:
              "Nejdřív si můžeme pojmenovat, co chcete chránit a co jste ochotná nabídnout.",
            ai: true,
          },
        ],
      },
    },
  ],
  rooms: [
    {
      id: "room-team",
      title: "Rozdělení odpovědností v týmu",
      type: "Pracovní",
      status: "Aktivní",
      updated: "dnes",
      progress: 18,
      participants: ["Anna"],
      goal: "Najít konkrétní dohodu bez dalšího mikromanagementu.",
      messages: [
        {
          author: "AI mediátor",
          text:
            "Vítejte v místnosti. Nejdřív oddělíme fakta, potřeby a návrhy řešení.",
          ai: true,
        },
        {
          author: "Anna",
          text:
            "Potřebuji, aby bylo jasné, kdo o čem rozhoduje. Teď se odpovědnosti často mění za pochodu.",
          me: true,
        },
      ],
      map: {
        shared: ["Zakladatel chce konflikt řešit ve strukturovaném prostoru."],
        open: ["Čekáme na pohled pozvaných účastníků.", "Kdo má finální slovo u priorit."],
        needs: ["Anna: jasné hranice role a pravidla komunikace."],
      },
      agreement: "",
    },
    {
      id: "room-family",
      title: "Péče o rodiče",
      type: "Rodinný",
      status: "Soukromý vstup",
      updated: "včera",
      progress: 8,
      participants: ["Anna"],
      goal: "Rozdělit péči a domluvit pravidelnou kontrolu situace.",
      messages: [
        {
          author: "AI mediátor",
          text:
            "Tahle místnost je připravená. Každý účastník může nejdřív vyplnit soukromý pohled.",
          ai: true,
        },
      ],
      map: {
        shared: ["Zakladatel chce připravit prostor pro domluvu."],
        open: ["Čekáme na pohled pozvaných účastníků.", "Rozdělení času.", "Finanční příspěvky."],
        needs: ["Anna: předvídatelnost."],
      },
      agreement: "",
    },
  ],
};

const goals = [
  "Najít konkrétní dohodu",
  "Vyjasnit nedorozumění",
  "Připravit další kroky",
  "Porozumět pohledům stran",
];

const roomTypes = ["Pracovní", "Rodinný", "Partnerský", "Obchodní", "Komunitní", "Jiný"];
const maxSourceBytes = 50 * 1024 * 1024;

function route(view, roomId) {
  state.view = view;
  if (roomId) state.activeRoomId = roomId;
  const target =
    view === "room"
      ? `${location.pathname}#${state.activeRoomId}`
      : view === "admin"
        ? `${location.pathname}#admin`
        : location.pathname;
  history.pushState(null, "", target);
  render();
}

function render() {
  applyTheme();
  if (!state.authUser) {
    if (isInviteJoinContext()) {
      renderGuestInvite();
      return;
    }
    renderAuth();
    return;
  }
  if (state.view === "home") renderHome();
  if (state.view === "profile") renderProfile();
  if (state.view === "room") renderRoom();
  if (state.view === "admin") {
    if (state.authUser?.admin) renderAdmin();
    else route("profile");
  }
}

function isInviteJoinContext() {
  return new URLSearchParams(location.search).get("join") === "1" && location.hash.startsWith("#room-");
}

function renderGuestInvite() {
  const room = state.inviteRoom || {
    id: state.activeRoomId,
    title: "Pozvaná místnost",
    goal: "Vstup přes pozvánku",
    progress: 0,
    participants: [],
    map: { shared: [], open: [], needs: [] },
  };
  renderJoinRoom(room, { guest: true });
}

function renderAuth() {
  app.className = "app minimal";
  const isRegister = state.authMode === "register";
  const authHint = new URLSearchParams(location.search).get("auth");
  const googleMessage =
    authHint === "google-missing"
      ? `<p class="auth-error">Google přihlášení zatím není nastavené ve Vercelu.</p>`
      : authHint === "google-failed"
        ? `<p class="auth-error">Google přihlášení se nepovedlo. Zkuste to prosím znovu.</p>`
        : "";
  app.innerHTML = `
    <section class="entry" aria-label="Vstup do aplikace">
      <div class="entry-title">
        ${logoMark()}
        <h1>Dohoda</h1>
        <p class="subtitle">Nezaujatý AI mediátor, který rychle hledá společné body, propojuje strany a vede konflikt ke konkrétnímu dalšímu kroku.</p>
        <button class="theme-toggle entry-theme" type="button" onclick="toggleTheme()">${themeLabel()}</button>
      </div>
      <form id="authForm" class="entry-form auth-form">
        <div class="auth-switch" role="tablist" aria-label="Přihlášení nebo registrace">
          <button class="${!isRegister ? "active" : ""}" type="button" data-auth-mode="login">Přihlášení</button>
          <button class="${isRegister ? "active" : ""}" type="button" data-auth-mode="register">Registrace</button>
        </div>
        ${googleMessage}
        ${state.authError ? `<p class="auth-error">${escapeHtml(state.authError)}</p>` : ""}
        ${isRegister ? `
          <label>
            Jméno
            <input id="authName" type="text" autocomplete="name" placeholder="Vaše jméno" />
          </label>
        ` : ""}
        <label>
          E-mail
          <input id="authEmail" type="email" autocomplete="email" placeholder="vy@example.com" required />
        </label>
        <label>
          Heslo
          <input id="authPassword" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="Alespoň 8 znaků" required />
        </label>
        <button class="primary-btn" type="submit">${isRegister ? "Vytvořit účet" : "Přihlásit"}</button>
        <a class="google-btn ${state.googleConfigured ? "" : "disabled"}" href="/auth/google" aria-disabled="${state.googleConfigured ? "false" : "true"}">
          Přihlásit přes Google
        </a>
        ${state.googleConfigured ? "" : `<p class="meta">Google přihlášení je připravené, ale čeká na OAuth údaje ve Vercelu.</p>`}
      </form>
    </section>
  `;

  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.authMode = button.dataset.authMode;
      state.authError = "";
      renderAuth();
    });
  });

  document.getElementById("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitAuth();
  });
}

function renderHome() {
  route("profile");
}

function renderProfile() {
  app.className = "app";
  const profile = activeProfile();
  const activeRooms = state.rooms.filter((room) => !room.archived);
  const archivedRooms = state.rooms.filter((room) => room.archived);
  const expandedRoomId = state.expandedProfileRoomId || "";
  app.innerHTML = `
    ${topbar()}
    <section class="page workspace-page quiet-profile">
      <header class="quiet-head">
        <div>
          <p class="room-kicker">${escapeHtml(profile.name)}</p>
          <h1>Vaše dohody</h1>
          <p class="subtitle">Každý konflikt má vlastní místnost. Nejdřív si ujasněte téma, pak pozvěte další účastníky a nechte AI vést soukromé rozhovory ke kompromisu.</p>
        </div>
        <div class="profile-metrics" aria-label="Souhrn profilu">
          <span><strong>${activeRooms.length}</strong> aktivní</span>
          <span><strong>${archivedRooms.length}</strong> archiv</span>
        </div>
      </header>

      <details class="new-agreement-drawer">
        <summary>Nová dohoda</summary>
        <form id="newRoomForm" class="new-room-form quiet-new-form">
          <label>
            Název konfliktu
            <input id="newRoomTitle" type="text" placeholder="Např. rozdělení odpovědností" />
          </label>
          <label>
            Typ
            <select id="newRoomType">${roomTypes.map((type) => `<option>${type}</option>`).join("")}</select>
          </label>
          <label>
            Cíl
            <select id="newRoomGoal">${goals.map((goal) => `<option>${goal}</option>`).join("")}</select>
          </label>
          <button class="secondary-btn" type="submit">Založit</button>
        </form>
      </details>

      <section class="agreement-board" aria-label="Přehled rozjetých dohod">
        <div class="agreement-list quiet-list">
          ${activeRooms.length ? activeRooms.map((room) => agreementRow(room, expandedRoomId)).join("") : `<div class="empty">Zatím tu není žádná aktivní dohoda.</div>`}
        </div>

        <details class="archive-section quiet-archive">
          <summary>Archiv <span>${archivedRooms.length}</span></summary>
          <div class="agreement-list archived-list">
            ${archivedRooms.length ? archivedRooms.map((room) => agreementRow(room, expandedRoomId)).join("") : `<div class="empty">Archiv je prázdný.</div>`}
          </div>
        </details>
      </section>
    </section>
  `;

  document.getElementById("newRoomForm").addEventListener("submit", (event) => {
    event.preventDefault();
    createRoom();
  });

  document.querySelectorAll("[data-open-room]").forEach((button) => {
    button.addEventListener("click", () => route("room", button.dataset.openRoom));
  });

  document.querySelectorAll("[data-toggle-room]").forEach((button) => {
    button.addEventListener("click", () => {
      state.expandedProfileRoomId =
        state.expandedProfileRoomId === button.dataset.toggleRoom ? "" : button.dataset.toggleRoom;
      renderProfile();
    });
  });

  document.querySelectorAll("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", async () => {
      const roomId = button.dataset.copyLink;
      const copied = await copyText(inviteLink(state.rooms.find((room) => room.id === roomId)), "Pozvánka zkopírována");
      flashButton(button, copied ? "Zkopírováno" : "Označeno");
    });
  });

  document.querySelectorAll("[data-archive-room]").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${button.dataset.archiveRoom}/archive`, {});
      renderProfile();
    });
  });

  document.querySelectorAll("[data-restore-room]").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${button.dataset.restoreRoom}/restore`, {});
      renderProfile();
    });
  });
}

function renderJoinRoom(room, options = {}) {
  const theme = conflictTheme(room);
  const savedName = roomParticipantOverride(room.id);
  app.className = "app minimal";
  app.innerHTML = `
    <section class="entry" aria-label="Připojení do místnosti" style="${theme.style}">
      <div class="entry-title">
        ${logoMark()}
        <h1>Připojit se</h1>
        <p class="subtitle">Byli jste pozváni do místnosti „${escapeHtml(room.title)}“. Zadejte jméno, pod kterým budete v konfliktu vystupovat.</p>
        ${state.inviteError ? `<p class="auth-error">${escapeHtml(state.inviteError)}</p>` : ""}
        ${conflictMeter(room)}
      </div>
      <form id="joinForm" class="entry-form">
        <label>
          Vaše jméno
          <input id="joinName" type="text" placeholder="Např. Petr" value="${escapeHtml(savedName)}" autofocus />
        </label>
        <button class="primary-btn" type="submit">Vstoupit do místnosti</button>
      </form>
    </section>
  `;

  document.getElementById("joinForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("joinName").value.trim();
    if (!name) return;
    try {
      setRoomParticipantName(room.id, name);
      const result = await apiAction(`/api/rooms/${room.id}/join`, {
        name,
        invite: state.inviteToken,
        guest: Boolean(options.guest || new URLSearchParams(location.search).get("join") === "1"),
      });
      if (result.authUser) state.authUser = result.authUser;
      state.inviteError = "";
      route("room", room.id);
    } catch (error) {
      state.inviteError = error.message || "Připojení se nepovedlo. Zkuste to znovu.";
      renderJoinRoom(room, options);
    }
  });
}

function roomCard(room) {
  const theme = conflictTheme(room);
  const archiveAction = room.archived
    ? `<button class="archive-link" type="button" data-restore-room="${room.id}">Vrátit z archivu</button>`
    : `<button class="archive-link" type="button" data-archive-room="${room.id}">Archivovat</button>`;
  return `
    <article class="card conflict-card ${room.archived ? "archived" : ""}" style="${theme.style}">
      <div class="card-head">
        <div>
          <h3>${escapeHtml(room.title)}</h3>
          <p class="meta">${escapeHtml(room.goal)}</p>
        </div>
        <span class="chip heat">${escapeHtml(room.archived ? "Archiv" : room.status)}</span>
      </div>
      ${conflictMeter(room)}
      <div class="chips">
        <span class="chip blue">${escapeHtml(room.type)}</span>
        <span class="chip">${room.participants.length} účastníci</span>
      </div>
      <div class="card-actions">
        <div class="button-row">
          <button class="primary-btn" type="button" data-open-room="${room.id}">Otevřít místnost</button>
          <button class="secondary-btn" type="button" data-copy-link="${room.id}">Kopírovat pozvánku</button>
        </div>
        <div class="archive-action">${archiveAction}</div>
      </div>
    </article>
  `;
}

function agreementRow(room, expandedRoomId) {
  const theme = conflictTheme(room);
  const expanded = room.id === expandedRoomId;
  const archiveAction = room.archived
    ? `<button class="archive-link" type="button" data-restore-room="${room.id}">Vrátit z archivu</button>`
    : `<button class="archive-link" type="button" data-archive-room="${room.id}">Archivovat</button>`;
  return `
    <article class="agreement-row ${expanded ? "expanded" : ""} ${room.archived ? "archived" : ""}" style="${theme.style}">
      <button class="agreement-summary" type="button" data-toggle-room="${room.id}" aria-expanded="${expanded}">
        <span class="agreement-accent" aria-hidden="true"></span>
        <span class="agreement-title">
          <strong>${escapeHtml(room.title)}</strong>
          <small>${escapeHtml(room.goal)}</small>
        </span>
        <span class="agreement-meta">
          <span class="chip heat">${escapeHtml(room.archived ? "Archiv" : room.status)}</span>
          <span>${room.participants.length} účastníci</span>
        </span>
      </button>
      ${expanded ? `
        <div class="agreement-detail">
          ${conflictMeter(room)}
          <div class="detail-grid">
            <div>
              <p class="meta">Typ</p>
              <strong>${escapeHtml(room.type)}</strong>
            </div>
            <div>
              <p class="meta">Index dohody</p>
              <strong>${room.progress}%</strong>
            </div>
            <div>
              <p class="meta">Účastníci</p>
              <div class="chips">${room.participants.map((name) => `<span class="chip blue">${escapeHtml(name)}</span>`).join("")}</div>
            </div>
          </div>
          <div class="card-actions">
            <div class="button-row">
              <button class="primary-btn" type="button" data-open-room="${room.id}">Vstoupit do místnosti</button>
              <button class="secondary-btn" type="button" data-copy-link="${room.id}">Kopírovat pozvánku</button>
            </div>
            <div class="archive-action">${archiveAction}</div>
          </div>
        </div>
      ` : ""}
    </article>
  `;
}

function renderRoom() {
  app.className = "app";
  const room = activeRoom();
  if (!roomParticipantName(room.id) || new URLSearchParams(location.search).get("join") === "1") {
    renderJoinRoom(room);
    return;
  }
  const theme = conflictTheme(room);
  const inviteUrl = inviteLink(room);
  app.innerHTML = `
    ${topbar()}
    <section class="room-shell minimal-room" style="${theme.style}">
      <div class="room-focus">
        <button class="ghost-btn back-link" type="button" id="backToProfile">Zpět na profil</button>

        <header class="room-hero">
          <div class="room-hero-copy">
            <p class="room-kicker">Téma, které chcete vyřešit</p>
            <h1>${escapeHtml(room.title)}</h1>
            <p class="subtitle">${escapeHtml(room.goal)}</p>
            ${conflictMeter(room)}
          </div>
          <div class="room-hero-actions">
            <div class="participant-strip" aria-label="Účastníci místnosti">
              <span class="chip heat">${room.participants.length}/10 účastníků</span>
              <div class="chips">${room.participants.map((name) => `<span class="chip blue">${escapeHtml(name)}</span>`).join("")}</div>
            </div>
            <button id="copyInvite" class="primary-btn invite-primary" type="button">Pozvat dalšího účastníka</button>
          </div>
        </header>

        <div class="room-workspace">
          <section class="room-panel private-mediation primary-chat" aria-label="Soukromá mediace">
            <div class="section-title">
              <div>
                <p class="room-kicker">Hlavní prostor</p>
                <h2>${escapeHtml(roomParticipantName(room.id))} + AI mediátor</h2>
                <p class="meta">Napište napřímo, co je potřeba. Mediátor z toho vytáhne podstatu, propojí ji s ostatními a předá bezpečné jádro.</p>
              </div>
              <div class="section-actions">
                <span class="chip ${state.aiConfigured ? "" : "amber"}">${state.aiConfigured ? "AI mediátor online" : "Demo mediátor"}</span>
              </div>
            </div>
            ${mediationProcessPanel(room)}
            ${privateBridgePanel(room)}
            <div class="messages private-main-stream" id="privateMessages">${privateConversation(room).map((message, index) => messageView({ ...message, me: !message.ai }, index)).join("")}</div>
            <form id="privateMediatorForm" class="composer private-main-composer">
              <div class="composer-box">
                <textarea id="privateMediatorText" rows="4" placeholder="Napište stručně, co se má posunout. Enter odešle, Shift+Enter vloží nový řádek."></textarea>
                <div class="composer-tools" aria-label="Ovládání zprávy">
                  <button id="clearDraft" class="icon-btn" type="button" title="Smazat rozepsaný text">×</button>
                  <button class="primary-btn send-arrow" type="submit" title="Poslat zprávu" aria-label="Poslat zprávu">→</button>
                </div>
                <div class="composer-tools-left" aria-label="Přidat podklad">
                  <button id="openSourceDialog" class="icon-btn add-source-btn" type="button" title="Přidat zdroj" aria-label="Přidat zdroj">+</button>
                  <button id="toggleInitiator" class="initiator-chat-btn ${mediationSettings(room).initiatorMode ? "active" : ""}" type="button" title="Iniciátor zapojuje účastníky">Iniciátor</button>
                </div>
              </div>
            </form>
            <details class="side-tools chat-tools" ${state.advancedOpen ? "open" : ""}>
              <summary>Analýza a dohoda</summary>
              <div class="drawer-actions">
                <button id="draftAgreement" class="primary-btn" type="button">Navrhnout dohodu</button>
              </div>
              <div class="tabs">
                ${toolTab("map", "Mapa")}
                ${toolTab("diary", "Deník")}
                ${toolTab("sources", "Zdroje")}
                ${toolTab("protocol", "Protokol")}
                ${toolTab("bridge", "Most")}
                ${toolTab("forms", "Formuláře")}
                ${toolTab("agreement", "Dohoda")}
              </div>
              <div id="toolArea" class="tool-area">${toolContent(room)}</div>
            </details>
          </section>

          <aside class="room-side-panel" aria-label="Nastavení mediace">
            ${mediationSettingsPanel(room)}
            <div class="invite-box quiet-invite">
              <strong>Pozvánka</strong>
              <button id="copyInviteSide" class="secondary-btn invite-copy-btn" type="button">Pozvěte dalšího účastníka</button>
              <p class="meta">Další účastníci se objeví až po vstupu přes tento odkaz.</p>
            </div>
          </aside>
        </div>
        <button class="scroll-composer-btn" id="scrollToComposer" type="button" aria-label="Sjet dolů k psaní zprávy">↓</button>
      </div>
    </section>
    ${state.sourceDialogOpen ? sourceDialog(room) : ""}
  `;

  bindRoomEvents(room, inviteUrl);
}

function renderAdmin() {
  app.className = "app";
  const activeRooms = state.rooms.filter((room) => !room.archived);
  const archivedRooms = state.rooms.filter((room) => room.archived);
  const participants = [...new Set(state.rooms.flatMap((room) => room.participants || []))];
  const needsAttention = state.rooms.filter((room) => !room.archived && (room.progress || 0) < 35);
  const filteredRooms = adminFilteredRooms();
  const selectedRoom = state.rooms.find((room) => room.id === state.adminRoomId) || filteredRooms[0] || state.rooms[0];
  if (selectedRoom) state.adminRoomId = selectedRoom.id;
  app.innerHTML = `
    ${topbar()}
    <section class="page workspace-page admin-page">
      <header class="quiet-head">
        <div>
          <p class="room-kicker">Administrace</p>
          <h1>Řízení Dohody</h1>
          <p class="subtitle">Technický a procesní přehled místností bez čtení soukromých chatů účastníků.</p>
        </div>
        <div class="profile-metrics admin-metrics">
          <span><strong>${activeRooms.length}</strong> aktivní místnosti</span>
          <span><strong>${participants.length}</strong> účastníků</span>
          <span><strong>${state.aiConfigured ? "AI" : "Demo"}</strong> mediátor</span>
        </div>
      </header>

      <div class="admin-grid">
        <section class="tool-card admin-card">
          <h3>Stav systému</h3>
          <ul>
            <li>AI mediátor: ${state.aiConfigured ? "připojen" : "demo režim"}</li>
            <li>Databáze: ${state.databaseConfigured ? "připojena" : "lokální paměť"}</li>
            <li>Archivované místnosti: ${archivedRooms.length}</li>
            <li>Místnosti vyžadující pozornost: ${needsAttention.length}</li>
          </ul>
        </section>
        <section class="tool-card admin-card">
          <h3>Rychlé priority</h3>
          <ul>
            ${needsAttention.length ? needsAttention.map((room) => `<li>${escapeHtml(room.title)}: nízký index dohody (${room.progress || 0} %)</li>`).join("") : "<li>Žádná místnost teď nevypadá zaseknutě.</li>"}
          </ul>
        </section>
      </div>

      <section class="admin-table-wrap">
        <div class="section-title">
          <div>
            <p class="room-kicker">Místnosti</p>
            <h2>Provozní přehled</h2>
          </div>
          <div class="tabs admin-tabs">
            ${adminFilterButton("active", "Aktivní")}
            ${adminFilterButton("attention", "Pozornost")}
            ${adminFilterButton("archived", "Archiv")}
            ${adminFilterButton("all", "Vše")}
          </div>
        </div>
        <div class="admin-layout">
          <div class="admin-table">
            ${filteredRooms.length ? filteredRooms.map((room) => adminRoomRow(room)).join("") : `<div class="empty">Žádná místnost v tomto filtru.</div>`}
          </div>
        </div>
        ${selectedRoom ? adminRoomDetail(selectedRoom) : ""}
      </section>
    </section>
  `;

  document.querySelectorAll("[data-admin-open-room]").forEach((button) => {
    button.addEventListener("click", () => route("room", button.dataset.adminOpenRoom));
  });
  document.querySelectorAll("[data-admin-select-room]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminRoomId = button.dataset.adminSelectRoom;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.adminFilter = button.dataset.adminFilter;
      renderAdmin();
    });
  });
  document.querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.dataset.adminAction === "delete-room" && !confirm("Opravdu smazat tuto místnost? Tato akce je nevratná.")) return;
      await apiAction(`/api/rooms/${button.dataset.adminRoom}/${button.dataset.adminAction}`, {
        author: state.sessionName || activeProfile().name,
      });
      renderAdmin();
      addToast("Administrace uložena");
    });
  });
}

function adminFilteredRooms() {
  if (state.adminFilter === "all") return state.rooms;
  if (state.adminFilter === "archived") return state.rooms.filter((room) => room.archived);
  if (state.adminFilter === "attention") return state.rooms.filter((room) => !room.archived && (room.progress || 0) < 35);
  return state.rooms.filter((room) => !room.archived);
}

function adminFilterButton(id, label) {
  return `<button class="tab ${state.adminFilter === id ? "active" : ""}" type="button" data-admin-filter="${id}">${label}</button>`;
}

function adminRoomRow(room) {
  const settings = mediationSettings(room);
  return `
    <article class="admin-row ${state.adminRoomId === room.id ? "selected" : ""}">
      <div>
        <strong>${escapeHtml(room.title)}</strong>
        <p class="meta">${escapeHtml(room.type || "Místnost")} · ${escapeHtml(room.stage || room.status || "bez stavu")}${room.locked ? " · uzamčeno" : ""}</p>
      </div>
      <span>${room.participants?.length || 0} účastníků</span>
      <span>${room.progress || 0} %</span>
      <span>${settings.style}${settings.initiatorMode ? " + iniciátor" : ""}</span>
      <button class="secondary-btn" type="button" data-admin-select-room="${room.id}">Detail</button>
    </article>
  `;
}

function adminRoomDetail(room) {
  const settings = mediationSettings(room);
  const diary = Array.isArray(room.diary) ? room.diary.slice(-4).reverse() : [];
  return `
    <aside class="admin-detail">
      <div class="section-title">
        <div>
          <p class="room-kicker">Detail místnosti</p>
          <h2>${escapeHtml(room.title)}</h2>
        </div>
      </div>
      <div class="admin-detail-grid">
        <span><strong>${room.progress || 0}%</strong> index dohody</span>
        <span><strong>${room.participants?.length || 0}</strong> účastníků</span>
        <span><strong>${room.locked ? "Zamčeno" : "Otevřeno"}</strong> pozvánky</span>
      </div>
      <div class="admin-section">
        <h3>AI mediátor</h3>
        <p class="meta">Styl: ${escapeHtml(settings.style)} · návrhy: ${settings.variants} · přerámování: ${settings.autoBridge ? "ano" : "ne"}</p>
        <p class="meta">Iniciátor: ${settings.initiatorMode ? "ano" : "ne"}</p>
      </div>
      <div class="admin-section">
        <h3>Pozvánka a bezpečnost</h3>
        <code>${escapeHtml(inviteLink(room))}</code>
        <div class="admin-actions">
          <button class="secondary-btn" type="button" data-admin-action="reset-invite" data-admin-room="${room.id}">Resetovat pozvánku</button>
          <button class="secondary-btn" type="button" data-admin-action="${room.locked ? "unlock" : "lock"}" data-admin-room="${room.id}">${room.locked ? "Odemknout" : "Zamknout"}</button>
        </div>
      </div>
      <div class="admin-section">
        <h3>Účastníci</h3>
        <div class="chips">${(room.participants || []).map((name) => `<span class="chip blue">${escapeHtml(name)}</span>`).join("") || `<span class="meta">Zatím nikdo</span>`}</div>
      </div>
      <div class="admin-section">
        <h3>Neutrální deník</h3>
        ${diary.length ? diary.map((item) => `<p class="meta">${escapeHtml(item.text || "")}</p>`).join("") : `<p class="meta">Zatím bez záznamu.</p>`}
      </div>
      <div class="admin-actions">
        <button class="primary-btn" type="button" data-admin-open-room="${room.id}">Otevřít místnost</button>
        <button class="secondary-btn" type="button" data-admin-action="${room.archived ? "restore" : "archive"}" data-admin-room="${room.id}">${room.archived ? "Vrátit z archivu" : "Archivovat"}</button>
        <button class="secondary-btn danger-btn" type="button" data-admin-action="delete-room" data-admin-room="${room.id}">Smazat místnost</button>
      </div>
    </aside>
  `;
}

function toolTab(id, label) {
  return `<button class="tab ${state.activeTool === id ? "active" : ""}" type="button" data-tool="${id}">${label}</button>`;
}

function mediationSettings(room) {
  return {
    style: room.mediationSettings?.style || "warm",
    autoBridge: room.mediationSettings?.autoBridge !== false,
    adaptToRecipient: room.mediationSettings?.adaptToRecipient !== false,
    variants: Number(room.mediationSettings?.variants ?? 3),
    initiatorMode: room.mediationSettings?.initiatorMode === true,
  };
}

function mediationSettingsPanel(room) {
  const settings = mediationSettings(room);
  const autoBridgeHelp = "Když někdo napíše zprávu, ostatním stranám ji mediátor podle potřeby předá v bezpečnější a srozumitelnější podobě.";
  const adaptHelp = "Mediátor zohlední, komu zpráva míří: jinak mluví s někým zraněným, jinak s někým rozčileným nebo věcným.";
  return `
    <form id="mediationSettingsForm" class="mediation-settings">
      <div class="settings-heading">
        <strong>Styl mediace</strong>
        <p class="meta">Volby mění chování mediátora hned v této místnosti.</p>
      </div>
      <label class="accent-label">
        <span>Jazykový přístup</span>
        <select id="mediationStyle">
          <option value="warm" ${settings.style === "warm" ? "selected" : ""}>Vřelý a optimistický</option>
          <option value="calm" ${settings.style === "calm" ? "selected" : ""}>Klidný a citlivý</option>
          <option value="clear" ${settings.style === "clear" ? "selected" : ""}>Jasný a strukturovaný</option>
          <option value="direct" ${settings.style === "direct" ? "selected" : ""}>Přímý, ale laskavý</option>
          <option value="authentic" ${settings.style === "authentic" ? "selected" : ""}>Co nejautentičtější</option>
        </select>
      </label>
      <label>
        Klikatelné návrhy formulací
        <select id="mediationVariants">
          <option value="0" ${settings.variants === 0 ? "selected" : ""}>Bez návrhů</option>
          <option value="1" ${settings.variants === 1 ? "selected" : ""}>1 varianta</option>
          <option value="2" ${settings.variants === 2 ? "selected" : ""}>2 varianty</option>
          <option value="3" ${settings.variants === 3 ? "selected" : ""}>3 varianty</option>
        </select>
      </label>
      <label class="toggle-line compact-toggle" title="${escapeHtml(autoBridgeHelp)}">
        <input id="autoBridge" type="checkbox" ${settings.autoBridge ? "checked" : ""} />
        <span>Automaticky přerámovat zprávu pro ostatní</span>
        <span class="hint-dot" aria-label="${escapeHtml(autoBridgeHelp)}">?</span>
      </label>
      <label class="toggle-line compact-toggle" title="${escapeHtml(adaptHelp)}">
        <input id="adaptToRecipient" type="checkbox" ${settings.adaptToRecipient ? "checked" : ""} />
        <span>Přizpůsobovat tón adresátovi</span>
        <span class="hint-dot" aria-label="${escapeHtml(adaptHelp)}">?</span>
      </label>
    </form>
  `;
}

function privateConversation(room) {
  const name = roomParticipantName(room.id);
  return room.privateConversations?.[name] || [
    {
      author: "AI mediátor",
      text:
        "Vítejte v místnosti. Začněme jednoduše: napište jednou větou, co by se podle vás mělo změnit, aby dohoda dávala smysl.",
      ai: true,
    },
  ];
}

function ensureClientPrivateConversation(room, author) {
  if (!room.privateConversations) room.privateConversations = {};
  if (!room.privateConversations[author]) {
    room.privateConversations[author] = [
      {
        author: "AI mediátor",
        text:
          "Vítejte v místnosti. Začněme jednoduše: napište jednou větou, co by se podle vás mělo změnit, aby dohoda dávala smysl.",
        ai: true,
      },
    ];
  }
  return room.privateConversations[author];
}

function mediationProcessPanel(room) {
  const stages = [
    ["Vstupní mapování", "pohledy"],
    ["Pojmenování potřeb", "potřeby"],
    ["Hledání mostu", "most"],
    ["Návrh dohody", "dohoda"],
    ["Kontrola dohody", "kontrola"],
  ];
  const activeIndex = Math.max(0, stages.findIndex(([label]) => label === room.stage));
  return `
    <div class="process-strip" aria-label="Proces mediace">
      ${stages.map(([label, short], index) => `
        <span class="${index <= activeIndex ? "active" : ""}">
          <b>${index + 1}</b>
          ${escapeHtml(short)}
        </span>
      `).join("")}
    </div>
  `;
}

function privateBridgePanel(room) {
  const currentName = roomParticipantName(room.id);
  const others = room.participants.filter((name) => name !== currentName);
  const otherLabel = others.length ? others.join(", ") : "pozvaná strana";
  return `
    <div class="bridge-panel">
      <div>
        <h3>Perspektiva druhé strany</h3>
        <p>${escapeHtml(perspectiveHint(room, otherLabel))}</p>
      </div>
      <div>
        <h3>Most ke kompromisu</h3>
        <p>${escapeHtml(compromiseSuggestions(room)[0])}</p>
      </div>
    </div>
  `;
}

function perspectiveHint(room, otherLabel) {
  if (room.participants.length < 2) {
    return "Zatím čekáme, až se druhá strana připojí přes pozvánku. Do té doby si můžete připravit vlastní pohled a hranice.";
  }
  if (room.map.needs.some((need) => need.toLowerCase().includes("autonomie"))) {
    return `${otherLabel} může vnímat situaci hlavně jako otázku autonomie a důvěry, ne jako odmítnutí vaší potřeby jasnosti.`;
  }
  return `${otherLabel} může mít jiné obavy nebo priority. AI vám pomůže formulovat otázku, která je neobviňuje a otevírá prostor pro odpověď.`;
}

function compromiseSuggestions(room) {
  const hasMultipleParticipants = room.participants.length > 1;
  if (!hasMultipleParticipants) {
    return [
      "Nejdřív připravit klidné pozvání: co chcete řešit, proč na tom záleží a že nejde o hledání viníka.",
      "Pojmenovat vlastní minimální hranici: co musí být splněno, aby pro vás dohoda dávala smysl.",
    ];
  }
  return [
    "Zkusit krátké pravidlo: žádná změna odpovědnosti bez společného potvrzení a termínu kontroly.",
    "Oddělit odpovědnost od kontroly: kdo rozhoduje, kdo je informovaný a kdo má právo vznést námitku.",
    "Nechat každou stranu potvrdit, co slyší jako potřebu té druhé, než začne navrhovat řešení.",
  ];
}

function toolContent(room) {
  if (state.activeTool === "map") {
    return `
      ${listTool("Body shody", room.map.shared)}
      ${listTool("Otevřené body", room.map.open)}
      ${listTool("Potřeby stran", room.map.needs)}
      <button id="summarizeRoom" class="secondary-btn" type="button">Aktualizovat analýzu</button>
    `;
  }

  if (state.activeTool === "diary") {
    const diary = Array.isArray(room.diary) ? room.diary.slice(-12).reverse() : [];
    return `
      <div class="tool-card mediation-diary">
        <h3>Deník místnosti</h3>
        <p class="meta">Neutrální stopa toho, co se v mediaci děje. Neobsahuje cizí soukromé texty.</p>
        <form id="diaryNoteForm" class="diary-note-form">
          <textarea id="diaryNoteText" rows="3" placeholder="Přidat vlastní zápis do deníku"></textarea>
          <button class="secondary-btn" type="submit">Přidat zápis</button>
        </form>
        <div class="diary-list">
          ${diary.length ? diary.map((item) => `
            <article class="diary-item ${escapeHtml(item.type || "note")}">
              <strong>${escapeHtml(item.author || "AI mediátor")}</strong>
              <p>${escapeHtml(item.text || "")}</p>
            </article>
          `).join("") : `<p class="meta">Deník zatím čeká na první vstupy.</p>`}
        </div>
      </div>
      <div class="tool-card protocol-card">
        <h3>Průběžný protokol</h3>
        <pre>${escapeHtml(room.protocol || "")}</pre>
      </div>
    `;
  }

  if (state.activeTool === "protocol") {
    const protocol = room.protocol || "";
    return `
      <div class="tool-card protocol-card protocol-export-card">
        <div class="source-head">
          <div>
            <h3>Protokol komunikace</h3>
            <p class="meta">Datovaný průběžný zápis změn, vstupů, zdrojů, analýz a posunů v místnosti.</p>
          </div>
          <div class="protocol-actions">
            <button class="secondary-btn" type="button" id="downloadProtocolTxt">Export TXT</button>
            <button class="secondary-btn" type="button" id="downloadProtocolPdf">Export PDF</button>
          </div>
        </div>
        <pre id="protocolText">${escapeHtml(protocol || "Protokol zatím čeká na první záznam.")}</pre>
      </div>
    `;
  }

  if (state.activeTool === "bridge") {
    return `
      <div class="tool-card">
        <h3>Role AI mediátora</h3>
        <ul>
          <li>Mluví soukromě s každou stranou.</li>
          <li>Pomáhá pojmenovat potřeby za konfliktem.</li>
          <li>Naznačuje možnou perspektivu druhé strany bez prozrazení soukromí.</li>
          <li>Předává ostatním stranám bezpečnější verzi toho, co je potřeba sdělit.</li>
        </ul>
      </div>
      ${listTool("Možné mosty", compromiseSuggestions(room))}
    `;
  }

  if (state.activeTool === "sources") {
    const sources = Array.isArray(room.sources) ? room.sources : [];
    return `
      <div class="tool-card sources-tool">
        <h3>Zdroje místnosti</h3>
        <p class="meta">Přidejte text, odkaz, audio nebo soubor do 50 MB. AI z nich vytáhne fakta, potřeby a otázky pro dohodu.</p>
        <p class="meta">${sourceUsageText(room)}</p>
        ${sourceForm("source")}
      </div>
      <div class="source-list">
        ${sources.length ? sources.map(sourceView).join("") : `<div class="empty">Zdroje zatím nejsou přidané.</div>`}
      </div>
    `;
  }

  if (state.activeTool === "forms") {
    return `
      <div class="tool-card">
        <h3>Úvodní formulář</h3>
        <ul>
          <li>Co se podle vás stalo?</li>
          <li>Co je pro vás nejdůležitější?</li>
          <li>Co by byla férová dohoda?</li>
        </ul>
      </div>
      <div class="tool-card">
        <h3>Výměna rolí</h3>
        <ul>
          <li>Popište pohled druhé strany vlastními slovy.</li>
          <li>AI zkontroluje, zda nejde o karikaturu.</li>
        </ul>
      </div>
    `;
  }

  return `
    <div class="tool-card">
      <h3>Návrh dohody</h3>
      <p class="meta">${escapeHtml(room.agreement || "Návrh zatím není vygenerovaný.")}</p>
    </div>
  `;
}

function sourceForm(prefix) {
  return `
    <form id="${prefix}Form" class="source-form" data-source-prefix="${prefix}">
      <label>
        Typ zdroje
        <select id="${prefix}Kind">
          <option value="text">Text</option>
          <option value="link">Odkaz</option>
          <option value="file">Soubor</option>
          <option value="audio">Audio</option>
          <option value="image">Obrázek</option>
        </select>
      </label>
      <label>
        Název
        <input id="${prefix}Title" type="text" placeholder="Např. hlasová poznámka, e-mail, smlouva..." />
      </label>
      <label class="${prefix}-text-field source-text-field">
        Text
        <textarea id="${prefix}Text" rows="4" placeholder="Vložte text nebo stručný popis zdroje."></textarea>
      </label>
      <label class="${prefix}-url-field source-url-field">
        Odkaz
        <input id="${prefix}Url" type="url" placeholder="https://..." />
      </label>
      <label class="${prefix}-file-field source-file-field">
        Soubor do 50 MB
        <input id="${prefix}File" type="file" accept="audio/*,image/*,.txt,.md,.csv,.json,.html,.xml,.rtf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
      </label>
      <button class="secondary-btn" type="submit">Přidat zdroj</button>
    </form>
  `;
}

function sourceDialog(room) {
  return `
    <div class="modal-backdrop">
      <section class="source-dialog" role="dialog" aria-modal="true" aria-label="Přidat zdroj">
        <div class="source-head">
          <div>
            <h3>Přidat zdroj do místnosti</h3>
            <p class="meta">${sourceUsageText(room)}</p>
          </div>
          <button id="closeSourceDialog" class="icon-btn" type="button" aria-label="Zavřít">×</button>
        </div>
        ${sourceForm("chatSource")}
      </section>
    </div>
  `;
}

function sourceUsageText(room) {
  const used = Math.round((room.sourceBytes || 0) / 1024 / 1024);
  const limit = Math.round((room.sourceLimit || 500 * 1024 * 1024) / 1024 / 1024);
  return `Limit: jeden zdroj 50 MB, celá místnost ${limit} MB. Využito přibližně ${used} MB.`;
}

function sourceView(source) {
  const size = source.size ? `${Math.round(source.size / 1024)} kB` : "";
  const status = source.status || "Uloženo";
  return `
    <article class="tool-card source-card">
      <div class="source-head">
        <div>
          <h3>${escapeHtml(source.title || "Zdroj")}</h3>
          <p class="meta">${escapeHtml(source.kind || "zdroj")}${source.mime ? ` · ${escapeHtml(source.mime)}` : ""}${size ? ` · ${size}` : ""} · ${escapeHtml(status)}</p>
        </div>
        <button class="secondary-btn" type="button" data-analyze-source="${source.id}">${source.analysis ? "Analyzovat znovu" : "Analyzovat AI"}</button>
        <button class="secondary-btn danger-btn" type="button" data-delete-source="${source.id}">Smazat</button>
      </div>
      ${source.url ? `<a class="source-link" href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : ""}
      ${source.excerpt ? `<p>${escapeHtml(source.excerpt)}</p>` : `<p class="meta">Soubor je uložený jako podklad. U netextových souborů bude analýza záviset na tom, zda z nich umíme získat text nebo přepis.</p>`}
      ${source.analysis ? `<div class="source-analysis"><strong>Shrnutí AI</strong><p>${escapeHtml(source.analysis)}</p></div>` : ""}
    </article>
  `;
}

function listTool(title, items) {
  return `
    <div class="tool-card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function messageView(message, index = 0) {
  const mine = message.me || message.author === roomParticipantName();
  const parsed = parseDraftSuggestions(message.text);
  const relayed = Boolean(message.mediatedFrom);
  const roleClass = relayed ? "speaker-other" : message.ai ? "speaker-ai" : mine ? "speaker-me" : "speaker-other";
  const accent = speakerAccent(message, mine);
  const collapseKey = messageCollapseKey(message, index);
  const collapsed = Boolean(state.collapsedMessages[collapseKey]);
  const label = message.mediatedFrom
    ? message.mediatedFrom
    : message.activity
      ? "Aktivita v mediaci"
      : message.author;
  const decision = message.decision ? `<small>${escapeHtml(message.decision)}</small>` : "";
  return `
    <article class="message ${roleClass} ${message.ai && !relayed ? "ai" : ""} ${mine ? "me" : ""} ${message.pending ? "pending" : ""} ${message.activity ? "activity" : ""} ${relayed ? "mediated" : ""} ${collapsed ? "collapsed" : ""}" style="--speaker: ${accent};">
      <div class="message-head">
        <strong>${escapeHtml(label)}</strong>
        <button class="message-collapse-btn" type="button" data-toggle-message="${escapeHtml(collapseKey)}" aria-label="${collapsed ? "Rozbalit zprávu" : "Sbalit zprávu"}"><span>${collapsed ? "+" : "−"}</span></button>
      </div>
      ${decision}
      <p>${escapeHtml(parsed.body || message.text)}</p>
      ${parsed.drafts.length ? `
        <div class="draft-suggestions" aria-label="Návrhy formulace">
          ${parsed.drafts.map((draft, index) => `
            <button class="draft-card" type="button" data-draft="${escapeHtml(draft)}">
              <span>Návrh ${index + 1}</span>
              ${escapeHtml(draft)}
            </button>
          `).join("")}
        </div>
      ` : ""}
    </article>
  `;
}

function messageCollapseKey(message, index) {
  const raw = `${state.activeRoomId}|${index}|${message.author || ""}|${message.text || ""}|${message.decision || ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `msg-${hash.toString(36)}`;
}

function speakerAccent(message, mine) {
  if (message.activity) return "var(--future-accent-2)";
  if (message.mediatedFrom) return colorFromName(message.mediatedFrom);
  if (message.ai) return "var(--future-accent)";
  if (mine) return "var(--green)";
  return colorFromName(message.author || "účastník");
}

function colorFromName(name) {
  const palette = ["#4f78dd", "#35b9a7", "#9b7cf6", "#d06f8a", "#5f9fdb", "#6c9f72"];
  let hash = 0;
  String(name).split("").forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  });
  return palette[hash % palette.length];
}

function parseDraftSuggestions(text) {
  const lines = String(text || "").split(/\n+/);
  const body = [];
  const drafts = [];
  let collecting = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (/^návrhy?\s+formulace:?$/i.test(trimmed) || /^možné\s+formulace:?$/i.test(trimmed)) {
      collecting = true;
      return;
    }
    if (collecting) {
      const match = trimmed.match(/^(?:\d+[\).:-]?\s*|[-–]\s*)(.+)$/);
      drafts.push((match ? match[1] : trimmed).replace(/^["„]|["“]$/g, "").trim());
      return;
    }
    body.push(trimmed);
  });
  return { body: body.join("\n"), drafts: drafts.filter(Boolean) };
}

function bindRoomEvents(room, inviteUrl) {
  document.getElementById("backToProfile").addEventListener("click", () => route("profile"));

  const advancedDrawer = document.querySelector(".side-tools");
  if (advancedDrawer) {
    advancedDrawer.addEventListener("toggle", () => {
      state.advancedOpen = advancedDrawer.open;
    });
  }

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTool = button.dataset.tool;
      renderRoom();
    });
  });

  document.getElementById("copyInvite").addEventListener("click", async (event) => {
    const copied = await copyText(inviteUrl, "Pozvánka zkopírována");
    flashButton(event.currentTarget, copied ? "Zkopírováno" : "Označeno");
  });
  const copyInviteSide = document.getElementById("copyInviteSide");
  if (copyInviteSide) {
    copyInviteSide.addEventListener("click", async (event) => {
      const copied = await copyText(inviteUrl, "Pozvánka zkopírována");
      flashButton(event.currentTarget, copied ? "Zkopírováno" : "Označeno");
    });
  }

  const settingsForm = document.getElementById("mediationSettingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("change", async (event) => {
      const payload = {
        style: document.getElementById("mediationStyle").value,
        variants: Number(document.getElementById("mediationVariants").value),
        autoBridge: document.getElementById("autoBridge").checked,
        adaptToRecipient: document.getElementById("adaptToRecipient").checked,
        initiatorMode: room.mediationSettings?.initiatorMode === true,
        author: roomParticipantName(room.id),
      };
      room.mediationSettings = payload;
      try {
        await apiAction(`/api/rooms/${room.id}/settings`, payload);
        addToast("Nastavení mediace uloženo");
        renderRoom();
      } catch (error) {
        addToast(error.message || "Nastavení se nepovedlo uložit.");
      }
    });
  }

  const initiatorButton = document.getElementById("toggleInitiator");
  if (initiatorButton) {
    initiatorButton.addEventListener("click", async () => {
      const current = mediationSettings(room);
      const payload = {
        ...current,
        initiatorMode: !current.initiatorMode,
        author: roomParticipantName(room.id),
      };
      room.mediationSettings = payload;
      setFormWaiting(initiatorButton, true, "...");
      try {
        await apiAction(`/api/rooms/${room.id}/settings`, payload);
        addToast(payload.initiatorMode ? "Iniciátor zapnutý" : "Iniciátor vypnutý");
        renderRoom();
      } catch (error) {
        addToast(error.message || "Iniciátora se nepovedlo změnit.");
        setFormWaiting(initiatorButton, false);
      }
    });
  }

  document.getElementById("privateMediatorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = document.getElementById("privateMediatorText");
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const text = textarea.value.trim();
    if (!text) return;
    const author = roomParticipantName(room.id);
    setFormWaiting(button, true, "AI odpovídá...");
    state.requestInProgress = true;
    const conversation = ensureClientPrivateConversation(room, author);
    conversation.push({ author, text });
    conversation.push({
      author: "AI mediátor",
      text: "Přemýšlím...",
      ai: true,
      pending: true,
    });
    textarea.value = "";
    renderRoom();
    try {
      const result = await apiAction(`/api/rooms/${room.id}/private`, {
        author,
        text,
      });
      renderRoom();
    } catch (error) {
      await loadRemoteState();
      renderRoom();
      addToast(error.message || "Odeslání se nepovedlo.");
    } finally {
      state.requestInProgress = false;
    }
  });

  document.querySelectorAll(".draft-card").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = document.getElementById("privateMediatorText");
      textarea.value = button.dataset.draft || "";
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      addToast("Návrh vložen do zprávy");
    });
  });

  document.querySelectorAll("[data-toggle-message]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.toggleMessage;
      state.collapsedMessages[key] = !state.collapsedMessages[key];
      renderRoom();
    });
  });

  const textarea = document.getElementById("privateMediatorText");
  const clearDraft = document.getElementById("clearDraft");
  const openSourceDialog = document.getElementById("openSourceDialog");
  if (clearDraft && textarea) {
    clearDraft.addEventListener("click", () => {
      textarea.value = "";
      textarea.focus();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        document.getElementById("privateMediatorForm").requestSubmit();
      }
    });
  }

  if (openSourceDialog) {
    openSourceDialog.addEventListener("click", () => {
      state.sourceDialogOpen = true;
      renderRoom();
    });
  }

  const closeSourceDialog = document.getElementById("closeSourceDialog");
  if (closeSourceDialog) {
    closeSourceDialog.addEventListener("click", () => {
      state.sourceDialogOpen = false;
      renderRoom();
    });
  }

  const draftAgreement = document.getElementById("draftAgreement");
  if (draftAgreement) {
    draftAgreement.addEventListener("click", async () => {
      setFormWaiting(draftAgreement, true, "Připravuji...");
      try {
        await apiAction(`/api/rooms/${room.id}/agreement`, {});
        state.activeTool = "agreement";
        state.advancedOpen = true;
        addToast("Návrh dohody připraven");
        renderRoom();
      } catch (error) {
        addToast(error.message || "Návrh dohody se nepovedlo připravit.");
        setFormWaiting(draftAgreement, false);
      }
    });
  }

  const scrollToComposer = document.getElementById("scrollToComposer");
  if (scrollToComposer && textarea) {
    const updateScrollComposerVisibility = () => {
      const remaining = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
      scrollToComposer.classList.toggle("hidden", remaining < 90);
    };
    scrollToComposer.addEventListener("click", () => {
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => textarea.focus(), 360);
    });
    window.addEventListener("scroll", updateScrollComposerVisibility, { passive: true });
    window.addEventListener("resize", updateScrollComposerVisibility);
    requestAnimationFrame(updateScrollComposerVisibility);
  }

  const summarize = document.getElementById("summarizeRoom");
  if (summarize) {
    summarize.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${room.id}/analysis`, {});
      renderRoom();
    });
  }

  bindSourceEvents(room);
  bindDiaryEvents(room);
  bindProtocolEvents(room);

}

function bindProtocolEvents(room) {
  const txtButton = document.getElementById("downloadProtocolTxt");
  const pdfButton = document.getElementById("downloadProtocolPdf");
  if (txtButton) {
    txtButton.addEventListener("click", () => downloadProtocolTxt(room));
  }
  if (pdfButton) {
    pdfButton.addEventListener("click", () => exportProtocolPdf(room));
  }
}

function bindSourceEvents(room, prefix = "source") {
  bindOneSourceForm(room, "source");
  bindOneSourceForm(room, "chatSource");
  document.querySelectorAll("[data-analyze-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      setFormWaiting(button, true, "Analyzuji...");
      state.requestInProgress = true;
      try {
        await apiAction(`/api/rooms/${room.id}/analyze-source`, {
          sourceId: button.dataset.analyzeSource,
        });
        state.activeTool = "sources";
        renderRoom();
        addToast("Zdroj analyzován");
      } catch (error) {
        addToast(error.message || "Analýza se nepovedla.");
      } finally {
        state.requestInProgress = false;
      }
    });
  });

  document.querySelectorAll("[data-delete-source]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Smazat tento zdroj z místnosti?")) return;
      await apiAction(`/api/rooms/${room.id}/delete-source`, {
        sourceId: button.dataset.deleteSource,
      });
      state.activeTool = "sources";
      renderRoom();
      addToast("Zdroj smazán");
    });
  });
}

function bindOneSourceForm(room, prefix) {
  const form = document.getElementById(`${prefix}Form`);
  if (!form) return;
  const kind = document.getElementById(`${prefix}Kind`);
  const syncFields = () => {
    const value = kind.value;
    document.querySelector(`.${prefix}-text-field`).hidden = value !== "text";
    document.querySelector(`.${prefix}-url-field`).hidden = value !== "link";
    document.querySelector(`.${prefix}-file-field`).hidden = !["file", "audio", "image"].includes(value);
  };
  kind.addEventListener("change", syncFields);
  syncFields();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    setFormWaiting(button, true, "Analyzuji...");
    state.requestInProgress = true;
    try {
      const payload = await buildSourcePayload(prefix);
      const result = await apiAction(`/api/rooms/${room.id}/add-source`, payload);
      state.rooms = result.store.rooms;
      if (prefix !== "chatSource") state.activeTool = "sources";
      state.sourceDialogOpen = false;
      addToast("Zdroj přidán a analyzován");
      renderRoom();
    } catch (error) {
      addToast(error.message || "Zdroj se nepovedlo přidat.");
    } finally {
      state.requestInProgress = false;
      setFormWaiting(button, false);
    }
  });
}

async function buildSourcePayload(prefix = "source") {
  const kind = document.getElementById(`${prefix}Kind`).value;
  const title = document.getElementById(`${prefix}Title`).value.trim();
  const payload = {
    kind,
    title,
    author: roomParticipantName(),
  };

  if (kind === "text") {
    payload.extractedText = document.getElementById(`${prefix}Text`).value.trim();
    if (!payload.extractedText) throw new Error("Vložte text zdroje.");
    payload.size = new Blob([payload.extractedText]).size;
    payload.title = payload.title || "Textový zdroj";
    return payload;
  }

  if (kind === "link") {
    payload.url = document.getElementById(`${prefix}Url`).value.trim();
    if (!payload.url) throw new Error("Vložte odkaz.");
    payload.extractedText = document.getElementById(`${prefix}Text`)?.value.trim() || "";
    payload.title = payload.title || payload.url;
    return payload;
  }

  const file = document.getElementById(`${prefix}File`).files[0];
  if (!file) throw new Error("Vyberte soubor.");
  if (file.size > maxSourceBytes) throw new Error("Soubor je větší než 50 MB.");
  const textLike = file.type.startsWith("text/") || /\.(txt|md|csv|json|html|xml|rtf)$/i.test(file.name);
  payload.kind = kind === "audio" || file.type.startsWith("audio/")
    ? "audio"
    : kind === "image" || file.type.startsWith("image/")
      ? "image"
      : "file";
  payload.title = payload.title || file.name;
  payload.fileName = file.name;
  payload.mime = file.type || "application/octet-stream";
  payload.size = file.size;
  payload.dataUrl = await readFileAsDataUrl(file);
  if (textLike) payload.extractedText = await readFileAsText(file);
  return payload;
}

function bindDiaryEvents(room) {
  const form = document.getElementById("diaryNoteForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = document.getElementById("diaryNoteText").value.trim();
    if (!text) return;
    await apiAction(`/api/rooms/${room.id}/add-diary-note`, { text });
    state.activeTool = "diary";
    renderRoom();
    addToast("Zápis přidán");
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Soubor se nepovedlo přečíst."));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsText(file);
  });
}

async function createRoom() {
  const title = document.getElementById("newRoomTitle").value.trim();
  if (!title) return;
  const payload = {
    title,
    type: document.getElementById("newRoomType").value,
    goal: document.getElementById("newRoomGoal").value,
  };
  const result = await apiAction("/api/rooms", payload);
  ensurePrivateNotes(result.room.id);
  route("room", result.room.id);
}

function topbar() {
  const user = state.authUser;
  return `
    <nav class="topbar">
      <button class="brand ghost-btn" type="button" onclick="route('profile')">
        ${logoMark()}
        <strong>Dohoda</strong>
      </button>
      <div class="topbar-actions">
        <span class="user-pill">${escapeHtml(user?.name || "")}${user?.admin ? " · admin" : ""}</span>
        <button class="secondary-btn" type="button" onclick="route('profile')">Profil</button>
        ${user?.admin ? `<button class="secondary-btn" type="button" onclick="route('admin')">Admin</button>` : ""}
        <button class="ghost-btn" type="button" onclick="logout()">Odhlásit</button>
      </div>
      <div class="topbar-icon-actions" aria-label="Rychlé volby">
        <button
          class="mode-orb"
          type="button"
          onclick="toggleTheme()"
          aria-label="${themeLabel()}"
          data-tip="${themeLabel()}"
        >
          <span aria-hidden="true">${state.theme === "dark" ? "☼" : "☾"}</span>
        </button>
        <button
          class="sound-orb ${state.soundEnabled ? "active" : ""}"
          type="button"
          onclick="toggleSoundNotifications()"
          aria-label="Zapnutí zvukové notifikace při nějaké aktivitě v místnosti"
          data-tip="Zapnutí zvukové notifikace při nějaké aktivitě v místnosti"
        >
          <span aria-hidden="true">♪</span>
        </button>
      </div>
    </nav>
  `;
}

function logoMark() {
  return `
    <span class="mark linked-logo" aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <circle class="ring ring-left" cx="25" cy="32" r="15" />
        <circle class="ring ring-right" cx="39" cy="32" r="15" />
      </svg>
    </span>
  `;
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("dohoda.theme", state.theme);
  render();
}

async function toggleSoundNotifications() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem("dohoda.soundEnabled", String(state.soundEnabled));
  if (state.soundEnabled) {
    await primeNotificationSound();
    rememberRoomActivity();
    addToast("Zvukové oznámení zapnuto");
  } else {
    addToast("Zvukové oznámení vypnuto");
  }
  render();
}

function themeLabel() {
  return state.theme === "dark" ? "Světlý režim" : "Tmavý režim";
}

function activeProfile() {
  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  if (state.authUser?.name) profile.name = state.authUser.name;
  else if (state.sessionName) profile.name = state.sessionName;
  return profile;
}

function activeRoom() {
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (room) return room;
  state.activeRoomId = state.rooms[0].id;
  return state.rooms[0];
}

function roomActivitySignature(room) {
  if (!room) return "";
  const name = roomParticipantName(room.id);
  const privateMessages = room.privateConversations?.[name] || [];
  return [
    room.id,
    room.participants?.length || 0,
    privateMessages.length,
    room.messages?.length || 0,
    room.diary?.length || 0,
    room.sources?.length || 0,
    room.progress || 0,
    room.stage || "",
  ].join("|");
}

function rememberRoomActivity() {
  const room = activeRoom();
  if (!room) return;
  state.roomActivitySignatures[room.id] = roomActivitySignature(room);
}

function maybeNotifyRoomActivity(previousSignature) {
  const room = activeRoom();
  if (!room) return;
  const nextSignature = roomActivitySignature(room);
  if (state.soundEnabled && previousSignature && nextSignature !== previousSignature) {
    playNotificationSound();
  }
  state.roomActivitySignatures[room.id] = nextSignature;
}

async function primeNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    if (state.audioContext.state === "suspended") await state.audioContext.resume();
    state.soundPrimed = true;
  } catch {
    state.soundPrimed = false;
  }
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!state.audioContext) state.audioContext = new AudioContextClass();
    const context = state.audioContext;
    if (context.state === "suspended") return;
    const now = context.currentTime;
    const gain = context.createGain();
    const tone = context.createOscillator();
    tone.type = "sine";
    tone.frequency.setValueAtTime(740, now);
    tone.frequency.exponentialRampToValueAtTime(980, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    tone.connect(gain).connect(context.destination);
    tone.start(now);
    tone.stop(now + 0.18);
  } catch {
    // Zvuk je jen doplněk; aplikace pokračuje i bez něj.
  }
}

function ensurePrivateNotes(roomId) {
  const profile = activeProfile();
  if (!profile.privateNotes[roomId]) {
    profile.privateNotes[roomId] = [
      {
        author: "AI pro vás",
        text:
          "Toto je váš soukromý prostor pro konkrétní místnost. Sdílení do společného chatu musí být vždy vědomé.",
        ai: true,
      },
    ];
  }
  return profile.privateNotes[roomId];
}

function addAi(room, text) {
  room.messages.push({ author: "AI mediátor", text, ai: true });
}

function mediatorReply(text) {
  const lower = text.toLowerCase();
  if (lower.includes("souhlas")) {
    return "Zachytil jsem bod shody. Navrhuji ho převést do konkrétního pravidla.";
  }
  if (lower.includes("nechci") || lower.includes("vadí") || lower.includes("bojím")) {
    return "Zkusme za tím pojmenovat potřebu nebo hranici, ne jen námitku.";
  }
  if (lower.includes("kdy") || lower.includes("termín")) {
    return "Tohle patří do dohody: kdo, co, do kdy a jak ověříme výsledek.";
  }
  return "Přeformuluji to neutrálně a doplním do mapy jako podklad pro další krok.";
}

function updateMap(room, text) {
  const lower = text.toLowerCase();
  if (lower.includes("souhlas")) addUnique(room.map.shared, "V komunikaci se objevil výslovný souhlas.");
  if (lower.includes("termín") || lower.includes("kdy")) addUnique(room.map.open, "Doplnit termín a vlastníka dohody.");
  if (lower.includes("hranice") || lower.includes("nechci")) addUnique(room.map.needs, "Některá strana potřebuje jasně chráněnou hranici.");
}

function moveProgress(room, amount) {
  room.progress = Math.min(96, Math.max(0, room.progress + amount));
  if (room.progress >= 80) room.status = "Blízko dohody";
  else if (room.progress >= 45) room.status = "V procesu";
  else if (room.progress >= 18) room.status = "Zklidňování";
}

function conflictMeter(room) {
  return `
    <div class="conflict-meter" aria-label="Stav řešení konfliktu">
      <div class="meter-label">
        <span>${conflictStage(room.progress)}</span>
        <strong>${room.progress}%</strong>
      </div>
      <div class="meter-track">
        <span style="width: ${room.progress}%"></span>
      </div>
      ${agreementIndexInfo(room)}
    </div>
  `;
}

function conflictStage(progress) {
  if (progress >= 86) return "zelená: dohoda se rýsuje";
  if (progress >= 58) return "tyrkysová: rýsuje se společný bod";
  if (progress >= 30) return "modrá: konflikt se strukturuje";
  return "červená: začátek konfliktu";
}

function agreementIndexInfo(room) {
  const criteria = Array.isArray(room.progressBasis) ? room.progressBasis : [];
  if (!criteria.length) return "";
  return `
    <details class="agreement-index-info">
      <summary>Jak se počítá index dohody</summary>
      <div class="agreement-index-grid">
        ${criteria.map((item) => `
          <div>
            <span>${escapeHtml(item.label)}</span>
            <strong>${Number(item.value || 0)}/${Number(item.max || 0)}</strong>
            <small>${escapeHtml(item.detail || "")}</small>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function conflictTheme(room) {
  const progress = Math.max(0, Math.min(100, room.progress ?? 0));
  const red = [196, 83, 90];
  const neutral = [93, 131, 215];
  const green = [78, 151, 124];
  const firstHalf = progress < 50;
  const from = firstHalf ? red : neutral;
  const to = firstHalf ? neutral : green;
  const ratio = firstHalf ? progress / 50 : (progress - 50) / 50;
  const color = mixColor(from, to, ratio);
  const soft = mixColor(color, [255, 254, 250], 0.78);
  const pale = mixColor(color, [247, 246, 242], 0.9);
  return {
    style:
      `--conflict: ${rgb(color)}; --conflict-soft: ${rgb(soft)}; --conflict-pale: ${rgb(pale)}; --conflict-progress: ${progress}%;`,
  };
}

function mixColor(from, to, ratio) {
  return from.map((value, index) => Math.round(value + (to[index] - value) * ratio));
}

function rgb(parts) {
  return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
}

function makeAgreement(room) {
  return [
    `Téma: ${room.title}`,
    `Strany: ${room.participants.join(", ")}`,
    "",
    "Shoda:",
    ...room.map.shared.map((item) => `- ${item}`),
    "",
    "Pracovní dohoda:",
    "- Strany potvrdí, které pravidlo má platit od příštího týdne.",
    "- Každá změna dohody bude nejdřív oznámena ve společné místnosti.",
    "- Po 14 dnech proběhne kontrola, zda dohoda funguje.",
    "",
    "Otevřené body:",
    ...room.map.open.map((item) => `- ${item}`),
  ].join("\n");
}

function participantTotal() {
  return state.rooms.reduce((sum, room) => sum + room.participants.length, 0);
}

function addUnique(list, item) {
  if (!list.includes(item)) list.push(item);
}

async function copyText(text, fallbackLabel) {
  let copied = false;
  try {
    if (navigator.clipboard?.writeText) {
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Clipboard timeout")), 350)),
      ]);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) copied = fallbackCopyText(text);
  if (copied) {
    addToast(fallbackLabel);
    return true;
  }

  showCopyFallback(text);
  return false;
}

function inviteLink(room) {
  const targetRoomId = room?.id || state.activeRoomId;
  const token = room?.inviteToken ? `&invite=${encodeURIComponent(room.inviteToken)}` : "";
  return `${location.origin}${location.pathname}?join=1${token}#${targetRoomId}`;
}

function fallbackCopyText(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  input.remove();
  return copied;
}

function showCopyFallback(text) {
  const existing = document.querySelector(".copy-fallback");
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.className = "copy-fallback";
  wrapper.innerHTML = `
    <div class="copy-fallback-card" role="dialog" aria-label="Kopírování odkazu">
      <strong>Odkaz nejde zkopírovat automaticky</strong>
      <p>Označil jsem ho níže. Zkopírujte ho ručně.</p>
      <input type="text" value="${escapeHtml(text)}" readonly />
      <button class="primary-btn" type="button">Zavřít</button>
    </div>
  `;
  document.body.appendChild(wrapper);
  const input = wrapper.querySelector("input");
  input.focus();
  input.select();
  wrapper.querySelector("button").addEventListener("click", () => wrapper.remove());
}

function flashButton(button, label) {
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => {
    button.textContent = original;
  }, 1400);
}

function setFormWaiting(button, waiting, label = "Poslat") {
  if (!button) return;
  if (waiting && !button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
  button.disabled = waiting;
  if (button.classList.contains("send-arrow")) {
    button.textContent = waiting ? "…" : "→";
  } else {
    button.textContent = waiting ? label : button.dataset.idleLabel || "Poslat";
  }
  button.classList.toggle("is-loading", waiting);
}

function addToast(text) {
  const toast = document.createElement("div");
  toast.className = "chip";
  toast.style.position = "fixed";
  toast.style.right = "18px";
  toast.style.bottom = "18px";
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1600);
}

function setSessionName(name) {
  state.sessionName = name;
  activeProfile().name = name;
  localStorage.setItem("dohoda.participantName", name);
}

function participantStorageKey(roomId = state.activeRoomId) {
  return `dohoda.roomParticipant.${roomId || "active"}`;
}

function roomParticipantOverride(roomId = state.activeRoomId) {
  return localStorage.getItem(participantStorageKey(roomId)) || "";
}

function roomParticipantName(roomId = state.activeRoomId) {
  return roomParticipantOverride(roomId) || state.sessionName || state.authUser?.name || activeProfile().name || "";
}

function setRoomParticipantName(roomId, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return;
  localStorage.setItem(participantStorageKey(roomId), cleanName);
  state.sessionName = cleanName;
}

function isRoomContext() {
  return state.view === "room" || location.hash.startsWith("#room-");
}

async function submitAuth() {
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  const payload = {
    email: document.getElementById("authEmail").value.trim(),
    password: document.getElementById("authPassword").value,
  };
  if (state.authMode === "register") {
    payload.name = document.getElementById("authName").value.trim();
  }
  state.authError = "";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Přihlášení se nepovedlo.");
    state.authUser = data.user;
    state.sessionName = data.user?.name || "";
    if (state.sessionName) localStorage.setItem("dohoda.participantName", state.sessionName);
    if (data.store?.rooms) state.rooms = data.store.rooms;
    await applyParticipantFromUrl();
    state.view = location.hash.startsWith("#room-") ? "room" : "profile";
    render();
  } catch (error) {
    state.authError = error.message;
    renderAuth();
  }
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  state.authUser = null;
  state.sessionName = "";
  localStorage.removeItem("dohoda.participantName");
  state.view = "home";
  history.pushState(null, "", location.pathname);
  render();
}

async function loadAuth() {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    if (!response.ok) throw new Error("Auth unavailable");
    const data = await response.json();
    state.authUser = data.user || null;
    state.googleConfigured = Boolean(data.googleConfigured);
    if (state.authUser?.name && (!isRoomContext() || !roomParticipantOverride())) {
      state.sessionName = state.authUser.name;
      localStorage.setItem("dohoda.participantName", state.sessionName);
    }
  } catch {
    state.authUser = null;
  }
}

async function loadRemoteState() {
  try {
    const params = new URLSearchParams();
    const participant = isRoomContext()
      ? roomParticipantOverride() || state.sessionName || ""
      : state.authUser?.name || state.sessionName || "";
    if (participant) params.set("participant", participant);
    const response = await fetch(`/api/state${params.toString() ? `?${params}` : ""}`, { cache: "no-store" });
    if (response.status === 401) {
      state.authUser = null;
      state.online = false;
      return;
    }
    if (!response.ok) throw new Error("State unavailable");
    const data = await response.json();
    if (data.authUser) state.authUser = data.authUser;
    if (Array.isArray(data.rooms)) {
      state.rooms = data.rooms;
      state.online = true;
      state.aiConfigured = Boolean(data.aiConfigured);
      state.databaseConfigured = Boolean(data.databaseConfigured);
      state.googleConfigured = Boolean(data.googleConfigured);
      if (data.authUser) {
        state.authUser = data.authUser;
        if (!isRoomContext() || !roomParticipantOverride()) state.sessionName = data.authUser.name || "";
      }
    }
  } catch {
    state.online = false;
  }
}

async function apiAction(path, payload) {
  const bodyPayload = {
    participant: roomParticipantName(),
    ...payload,
  };
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyPayload),
  });
  if (!response.ok) {
    if (response.status === 401) {
      state.authUser = null;
      renderAuth();
    }
    let message = "Odeslání se nepovedlo.";
    try {
      const detail = await response.json();
      message = detail.detail || detail.error || message;
    } catch {
      message = await response.text() || message;
    }
    throw new Error(message);
  }
  const data = await response.json();
  if (data.authUser) state.authUser = data.authUser;
  if (data.store?.rooms) state.rooms = data.store.rooms;
  return data;
}

function protocolFileName(room, extension) {
  const slug = String(room.title || "dohoda")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 44) || "dohoda";
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-protokol-${date}.${extension}`;
}

function downloadProtocolTxt(room) {
  const content = room.protocol || "Protokol zatím čeká na první záznam.";
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = protocolFileName(room, "txt");
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  addToast("Protokol TXT připraven");
}

function exportProtocolPdf(room) {
  const content = escapeHtml(room.protocol || "Protokol zatím čeká na první záznam.");
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
  if (!printWindow) {
    addToast("Prohlížeč zablokoval export. Povolte vyskakovací okno.");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="cs">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(protocolFileName(room, "pdf"))}</title>
        <style>
          body { margin: 36px; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          h1 { margin: 0 0 18px; font-size: 24px; }
          pre { white-space: pre-wrap; font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          @page { margin: 18mm; }
        </style>
      </head>
      <body>
        <h1>Protokol Dohody</h1>
        <pre>${content}</pre>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

async function start() {
  await loadAuth();
  if (!state.authUser && isInviteJoinContext()) {
    await loadInviteRoom();
  }
  if (state.authUser) {
    await loadRemoteState();
    await applyParticipantFromUrl();
  }
  rememberRoomActivity();
  render();
  setInterval(async () => {
    if (state.view !== "room") return;
    if (state.requestInProgress) return;
    const focused = document.activeElement;
    if (focused && ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)) return;
    const previousSignature = state.roomActivitySignatures[state.activeRoomId] || roomActivitySignature(activeRoom());
    await loadRemoteState();
    maybeNotifyRoomActivity(previousSignature);
    renderRoom();
  }, 2500);
}

async function loadInviteRoom() {
  try {
    if (location.hash.startsWith("#room-")) state.activeRoomId = location.hash.replace("#", "");
    const params = new URLSearchParams(location.search);
    state.inviteToken = params.get("invite") || state.inviteToken;
    const query = new URLSearchParams();
    if (state.inviteToken) query.set("invite", state.inviteToken);
    const response = await fetch(`/api/invite/${state.activeRoomId}?${query}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Pozvánka není platná.");
    state.inviteRoom = data.room;
    state.inviteError = "";
    state.googleConfigured = Boolean(data.googleConfigured);
  } catch (error) {
    state.inviteError = error.message || "Pozvánka není platná.";
  }
}

async function applyParticipantFromUrl() {
  const params = new URLSearchParams(location.search);
  state.inviteToken = params.get("invite") || state.inviteToken;
  if (location.hash.startsWith("#room-")) state.activeRoomId = location.hash.replace("#", "");
  const participant = params.get("participant") || roomParticipantOverride(state.activeRoomId) || "";
  const cleanName = participant.trim();
  if (!cleanName) {
    if (location.hash.startsWith("#room-")) state.view = "room";
    return;
  }
  setRoomParticipantName(state.activeRoomId, cleanName);
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (!room || !room.participants.includes(cleanName)) {
    try {
      await apiAction(`/api/rooms/${state.activeRoomId}/join`, { name: cleanName, invite: state.inviteToken });
      await loadRemoteState();
    } catch {
      addToast("Pozvánka se nepovedla otevřít.");
    }
  }
  if (location.hash.startsWith("#room-")) state.view = "room";
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("hashchange", () => {
  if (location.hash === "#admin") {
    state.view = "admin";
    render();
  } else if (location.hash.startsWith("#room-")) {
    state.view = "room";
    state.activeRoomId = location.hash.replace("#", "");
    render();
  }
});

start();
