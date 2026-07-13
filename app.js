const app = document.getElementById("app");

const state = {
  view: location.hash.startsWith("#room-") ? "room" : "home",
  activeProfileId: "u1",
  activeRoomId: location.hash.replace("#", "") || "room-team",
  expandedProfileRoomId: "",
  activeTool: "map",
  sessionName: localStorage.getItem("dohoda.participantName") || "",
  theme: localStorage.getItem("dohoda.theme") || "light",
  online: false,
  aiConfigured: false,
  databaseConfigured: false,
  requestInProgress: false,
  advancedOpen: false,
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

function route(view, roomId) {
  state.view = view;
  if (roomId) state.activeRoomId = roomId;
  history.pushState(null, "", view === "room" ? `${location.pathname}#${state.activeRoomId}` : location.pathname);
  render();
}

function render() {
  applyTheme();
  if (state.view === "home") renderHome();
  if (state.view === "profile") renderProfile();
  if (state.view === "room") renderRoom();
}

function renderHome() {
  app.className = "app minimal";
  app.innerHTML = `
    <section class="entry" aria-label="Vstup do aplikace">
      <div class="entry-title">
        <div class="mark" aria-hidden="true">D</div>
        <h1>Dohoda</h1>
        <p class="subtitle">Nezaujatý AI mediátor pro konflikty, které potřebují klidný prostor, jasný proces a konkrétní výsledek.</p>
        <button class="theme-toggle entry-theme" type="button" onclick="toggleTheme()">${themeLabel()}</button>
      </div>
      <form id="profileForm" class="entry-form">
        <label>
          Váš profil
          <input id="profileName" type="text" value="${escapeHtml(state.sessionName || activeProfile().name)}" />
        </label>
        <button class="primary-btn" type="submit">Pokračovat</button>
      </form>
    </section>
  `;

  document.getElementById("profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("profileName").value.trim();
    if (name) setSessionName(name);
    route("profile");
  });
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
      const copied = await copyText(`${location.origin}${location.pathname}?join=1#${roomId}`, "Pozvánka zkopírována");
      flashButton(button, copied ? "Zkopírováno" : "Označeno");
    });
  });

  document.querySelectorAll("[data-archive-room]").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${button.dataset.archiveRoom}/archive`, {});
      await loadRemoteState();
      renderProfile();
    });
  });

  document.querySelectorAll("[data-restore-room]").forEach((button) => {
    button.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${button.dataset.restoreRoom}/restore`, {});
      await loadRemoteState();
      renderProfile();
    });
  });
}

function renderJoinRoom(room) {
  const theme = conflictTheme(room);
  app.className = "app minimal";
  app.innerHTML = `
    <section class="entry" aria-label="Připojení do místnosti" style="${theme.style}">
      <div class="entry-title">
        <div class="mark" aria-hidden="true">D</div>
        <h1>Připojit se</h1>
        <p class="subtitle">Byli jste pozváni do místnosti „${escapeHtml(room.title)}“. Zadejte jméno, pod kterým budete v konfliktu vystupovat.</p>
        ${conflictMeter(room)}
      </div>
      <form id="joinForm" class="entry-form">
        <label>
          Vaše jméno
          <input id="joinName" type="text" placeholder="Např. Petr" autofocus />
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
      setSessionName(name);
      await apiAction(`/api/rooms/${room.id}/join`, { name });
      await loadRemoteState();
      route("room", room.id);
    } catch {
      addToast("Připojení se nepovedlo. Zkuste to znovu.");
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
              <p class="meta">Posun</p>
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
  if (!state.sessionName || new URLSearchParams(location.search).get("join") === "1") {
    renderJoinRoom(room);
    return;
  }
  const theme = conflictTheme(room);
  const inviteUrl = `${location.origin}${location.pathname}?join=1#${room.id}`;
  app.innerHTML = `
    ${topbar()}
    <section class="room-shell minimal-room" style="${theme.style}">
      <div class="room-focus">
        <button class="ghost-btn back-link" type="button" id="backToProfile">Zpět na profil</button>

        <header class="room-hero">
          <div class="room-hero-copy">
            <p class="room-kicker">Téma konfliktu</p>
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
                <h2>${escapeHtml(state.sessionName)} + AI mediátor</h2>
                <p class="meta">Vaše slova se vám uloží přesně tak, jak je napíšete. Ostatním účastníkům mediátor ukáže bezpečnější podstatu a pojmenuje, jaké téma se právě řeší.</p>
              </div>
              <span class="chip ${state.aiConfigured ? "" : "amber"}">${state.aiConfigured ? "AI mediátor online" : "Demo mediátor"}</span>
            </div>
            ${privateBridgePanel(room)}
            <div class="messages private-main-stream" id="privateMessages">${privateConversation(room).map((message) => messageView({ ...message, me: !message.ai })).join("")}</div>
            <form id="privateMediatorForm" class="composer private-main-composer">
              <textarea id="privateMediatorText" rows="4" placeholder="Napište svůj pohled. Mediátor ho ostatním případně přeloží bezpečněji."></textarea>
              <button class="primary-btn" type="submit">Poslat</button>
            </form>
            <details class="side-tools chat-tools" ${state.advancedOpen ? "open" : ""}>
              <summary>Analýza a dohoda</summary>
              <div class="drawer-actions">
                <button id="draftAgreement" class="primary-btn" type="button">Navrhnout dohodu</button>
              </div>
              <div class="tabs">
                ${toolTab("map", "Mapa")}
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
              <code id="inviteUrl">${escapeHtml(inviteUrl)}</code>
              <p class="meta">Další účastníci se objeví až po vstupu přes tento odkaz.</p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  `;

  bindRoomEvents(room, inviteUrl);
}

function toolTab(id, label) {
  return `<button class="tab ${state.activeTool === id ? "active" : ""}" type="button" data-tool="${id}">${label}</button>`;
}

function mediationSettings(room) {
  return {
    style: room.mediationSettings?.style || "warm",
    autoBridge: room.mediationSettings?.autoBridge !== false,
    adaptToRecipient: room.mediationSettings?.adaptToRecipient !== false,
    variants: Number(room.mediationSettings?.variants || 3),
  };
}

function mediationSettingsPanel(room) {
  const settings = mediationSettings(room);
  const autoBridgeHelp = "Když někdo napíše zprávu, ostatním stranám ji mediátor podle potřeby předá v bezpečnější a srozumitelnější podobě.";
  const adaptHelp = "Mediátor zohlední, komu zpráva míří: jinak mluví s někým zraněným, jinak s někým rozčileným nebo věcným.";
  return `
    <form id="mediationSettingsForm" class="mediation-settings">
      <div>
        <strong>Styl mediace</strong>
        <p class="meta">Určuje jazyk, vřelost a způsob překladu mezi stranami.</p>
      </div>
      <label>
        Přístup
        <select id="mediationStyle">
          <option value="warm" ${settings.style === "warm" ? "selected" : ""}>Vřelý a optimistický</option>
          <option value="calm" ${settings.style === "calm" ? "selected" : ""}>Klidný a citlivý</option>
          <option value="clear" ${settings.style === "clear" ? "selected" : ""}>Jasný a strukturovaný</option>
          <option value="direct" ${settings.style === "direct" ? "selected" : ""}>Přímý, ale laskavý</option>
          <option value="authentic" ${settings.style === "authentic" ? "selected" : ""}>Co nejautentičtější</option>
        </select>
      </label>
      <label>
        Počet návrhů formulace
        <select id="mediationVariants">
          <option value="1" ${settings.variants === 1 ? "selected" : ""}>1 varianta</option>
          <option value="2" ${settings.variants === 2 ? "selected" : ""}>2 varianty</option>
          <option value="3" ${settings.variants === 3 ? "selected" : ""}>3 varianty</option>
        </select>
      </label>
      <label class="toggle-line" title="${escapeHtml(autoBridgeHelp)}">
        <input id="autoBridge" type="checkbox" ${settings.autoBridge ? "checked" : ""} />
        <span>Automaticky přerámovat zprávu pro ostatní</span>
        <span class="hint-dot" aria-label="${escapeHtml(autoBridgeHelp)}">?</span>
      </label>
      <label class="toggle-line" title="${escapeHtml(adaptHelp)}">
        <input id="adaptToRecipient" type="checkbox" ${settings.adaptToRecipient ? "checked" : ""} />
        <span>Přizpůsobovat tón adresátovi</span>
        <span class="hint-dot" aria-label="${escapeHtml(adaptHelp)}">?</span>
      </label>
    </form>
  `;
}

function privateConversation(room) {
  const name = state.sessionName || activeProfile().name;
  return room.privateConversations?.[name] || [
    {
      author: "AI mediátor",
      text:
        "Toto je váš soukromý prostor. Popište mi svůj pohled a pomůžu vám najít formulaci, která nezvyšuje napětí.",
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
          "Toto je váš soukromý prostor. Popište mi svůj pohled a pomůžu vám najít formulaci, která nezvyšuje napětí.",
        ai: true,
      },
    ];
  }
  return room.privateConversations[author];
}

function privateBridgePanel(room) {
  const others = room.participants.filter((name) => name !== state.sessionName);
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

function listTool(title, items) {
  return `
    <div class="tool-card">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function messageView(message) {
  const mine = message.me || message.author === state.sessionName;
  const label = message.mediatedFrom
    ? `Mediovaný přenos od ${message.mediatedFrom}`
    : message.activity
      ? "Aktivita v mediaci"
      : message.author;
  return `
    <article class="message ${message.ai ? "ai" : ""} ${mine ? "me" : ""} ${message.pending ? "pending" : ""} ${message.activity ? "activity" : ""} ${message.mediatedFrom ? "mediated" : ""}">
      <strong>${escapeHtml(label)}</strong>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `;
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

  const settingsForm = document.getElementById("mediationSettingsForm");
  if (settingsForm) {
    settingsForm.addEventListener("change", async () => {
      const payload = {
        style: document.getElementById("mediationStyle").value,
        variants: Number(document.getElementById("mediationVariants").value),
        autoBridge: document.getElementById("autoBridge").checked,
        adaptToRecipient: document.getElementById("adaptToRecipient").checked,
      };
      room.mediationSettings = payload;
      try {
        await apiAction(`/api/rooms/${room.id}/settings`, payload);
        await loadRemoteState();
        addToast("Nastavení mediace uloženo");
      } catch (error) {
        addToast(error.message || "Nastavení se nepovedlo uložit.");
      }
    });
  }

  document.getElementById("privateMediatorForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const textarea = document.getElementById("privateMediatorText");
    const button = event.currentTarget.querySelector("button");
    const text = textarea.value.trim();
    if (!text) return;
    const author = state.sessionName || activeProfile().name;
    setFormWaiting(button, true, "AI odpovídá...");
    state.requestInProgress = true;
    const conversation = ensureClientPrivateConversation(room, author);
    conversation.push({ author, text });
    conversation.push({
      author: "AI mediátor",
      text: "AI mediátor připravuje odpověď pro vás a bezpečný přenos podstaty pro ostatní účastníky...",
      ai: true,
      pending: true,
    });
    textarea.value = "";
    renderRoom();
    try {
      await apiAction(`/api/rooms/${room.id}/private`, {
        author,
        text,
      });
      await loadRemoteState();
      renderRoom();
    } catch (error) {
      await loadRemoteState();
      renderRoom();
      addToast(error.message || "Odeslání se nepovedlo.");
    } finally {
      state.requestInProgress = false;
    }
  });

  document.getElementById("draftAgreement").addEventListener("click", async () => {
    await apiAction(`/api/rooms/${room.id}/agreement`, {});
    await loadRemoteState();
    state.activeTool = "agreement";
    renderRoom();
  });

  const summarize = document.getElementById("summarizeRoom");
  if (summarize) {
    summarize.addEventListener("click", async () => {
      await apiAction(`/api/rooms/${room.id}/analysis`, {});
      await loadRemoteState();
      renderRoom();
    });
  }

}

async function createRoom() {
  const title = document.getElementById("newRoomTitle").value.trim();
  if (!title) return;
  const payload = {
    title,
    type: document.getElementById("newRoomType").value,
    goal: document.getElementById("newRoomGoal").value,
    author: state.sessionName || activeProfile().name,
  };
  const result = await apiAction("/api/rooms", payload);
  await loadRemoteState();
  ensurePrivateNotes(result.room.id);
  route("room", result.room.id);
}

function topbar() {
  return `
    <nav class="topbar">
      <button class="brand ghost-btn" type="button" onclick="route('profile')">
        <span class="mark" aria-hidden="true">D</span>
        <strong>Dohoda</strong>
      </button>
      <div class="topbar-actions">
        <button class="theme-toggle" type="button" onclick="toggleTheme()">${themeLabel()}</button>
        <button class="ghost-btn" type="button" onclick="route('home')">Úvod</button>
        <button class="secondary-btn" type="button" onclick="route('profile')">Profil</button>
      </div>
    </nav>
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

function themeLabel() {
  return state.theme === "dark" ? "Světlý režim" : "Tmavý režim";
}

function activeProfile() {
  const profile = state.profiles.find((item) => item.id === state.activeProfileId);
  if (state.sessionName) profile.name = state.sessionName;
  return profile;
}

function activeRoom() {
  const room = state.rooms.find((item) => item.id === state.activeRoomId);
  if (room) return room;
  state.activeRoomId = state.rooms[0].id;
  return state.rooms[0];
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
    </div>
  `;
}

function conflictStage(progress) {
  if (progress >= 86) return "zelená: dohoda se rýsuje";
  if (progress >= 58) return "olivová: hledáme konkrétní pravidla";
  if (progress >= 30) return "jantarová: konflikt se zklidňuje";
  return "červená: začátek konfliktu";
}

function conflictTheme(room) {
  const progress = Math.max(0, Math.min(100, room.progress ?? 0));
  const red = [196, 83, 90];
  const amber = [190, 147, 75];
  const green = [78, 151, 124];
  const firstHalf = progress < 50;
  const from = firstHalf ? red : amber;
  const to = firstHalf ? amber : green;
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
  button.disabled = waiting;
  button.textContent = waiting ? label : "Poslat";
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

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("State unavailable");
    const data = await response.json();
    if (Array.isArray(data.rooms)) {
      state.rooms = data.rooms;
      state.online = true;
      state.aiConfigured = Boolean(data.aiConfigured);
      state.databaseConfigured = Boolean(data.databaseConfigured);
    }
  } catch {
    state.online = false;
  }
}

async function apiAction(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
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
  if (data.store?.rooms) state.rooms = data.store.rooms;
  return data;
}

async function start() {
  await loadRemoteState();
  await applyParticipantFromUrl();
  render();
  setInterval(async () => {
    if (state.view !== "room") return;
    if (state.requestInProgress) return;
    const focused = document.activeElement;
    if (focused && ["INPUT", "TEXTAREA", "SELECT"].includes(focused.tagName)) return;
    await loadRemoteState();
    renderRoom();
  }, 2500);
}

async function applyParticipantFromUrl() {
  const params = new URLSearchParams(location.search);
  const participant = params.get("participant");
  if (!participant) return;
  const cleanName = participant.trim();
  if (!cleanName) return;
  if (location.hash.startsWith("#room-")) state.activeRoomId = location.hash.replace("#", "");
  setSessionName(cleanName);
  const room = activeRoom();
  if (!room.participants.includes(cleanName)) {
    try {
      await apiAction(`/api/rooms/${room.id}/join`, { name: cleanName });
      await loadRemoteState();
    } catch {
      addToast("Testovací role se nepovedla připojit.");
    }
  }
  state.view = "room";
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
  if (location.hash.startsWith("#room-")) {
    state.view = "room";
    state.activeRoomId = location.hash.replace("#", "");
    render();
  }
});

start();
