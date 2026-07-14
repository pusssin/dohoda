const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
loadLocalEnv(path.join(root, ".env"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
let sqlClient;
let databaseReady;

const defaultMediationSettings = {
  style: "warm",
  autoBridge: true,
  adaptToRecipient: true,
  variants: 3,
};

const styleInstructions = {
  warm:
    "Tón je vřelý, svižný, lidský a lehce optimistický. Mluv krátce, bez poradenské vaty.",
  calm:
    "Tón je klidný, citlivý a efektivní. Uklidni situaci jednou větou a rychle veď k dalšímu kroku.",
  clear:
    "Tón je srozumitelný, strukturovaný a akční. Dej jasný průsečík a jeden konkrétní krok.",
  direct:
    "Tón je přímý, energický a ne tvrdý. Nečekej zbytečně na svolení, když můžeš bezpečně posunout proces.",
  authentic:
    "Tón zachovává autenticitu autora. Nevyhlazuj sdělení do sterilní fráze; jen odstraň útoky, které brání porozumění.",
};

const mediationPlaybook = [
  "Pracuj zájmově: hledej potřeby a zájmy pod pozicemi, ne vítěze sporu.",
  "Používej nenásilnou komunikaci: pozorování, pocit, potřeba, prosba.",
  "Mediuj aktivně: shrň průsečík, propoj strany a navrhni nejmenší testovatelný další krok.",
  "Nebuď nudný formulář. Buď stručný, živý, konkrétní a trochu odlehčující, pokud to nebagatelizuje bolest.",
  "Neptej se na souhlas s každou větou. Když je bezpečné posunout proces, udělej to.",
  "Nezahlcuj variantami. Nabízej varianty jen když účastník řeší tón sdělení nebo když je výběr opravdu užitečný.",
].join(" ");

const store = {
  rooms: [
    {
      id: "room-team",
      title: "Rozdělení odpovědností v týmu",
      type: "Pracovní",
      status: "Aktivní",
      updated: "dnes",
      progress: 18,
      archived: false,
      participants: ["Anna"],
      inviteToken: "demo-team",
      stage: "Vstupní mapování",
      mediationSettings: { ...defaultMediationSettings },
      privateConversations: {
        Anna: [
          {
            author: "AI mediátor",
            text:
              "Toto je váš soukromý rozhovor. Pomůžu vám ujasnit, co potřebujete, pochopit pohled druhé strany a připravit formulaci, kterou můžete případně sdílet.",
            ai: true,
          },
        ],
      },
      goal: "Najít konkrétní dohodu bez dalšího mikromanagementu.",
      messages: [
        {
          author: "AI mediátor",
          text: "Vítejte v místnosti. Nejdřív oddělíme fakta, potřeby a návrhy řešení.",
          ai: true,
        },
        {
          author: "Anna",
          text:
            "Potřebuji, aby bylo jasné, kdo o čem rozhoduje. Teď se odpovědnosti často mění za pochodu.",
        },
      ],
      map: {
        shared: ["Zakladatel chce konflikt řešit ve strukturovaném prostoru."],
        open: ["Čekáme na pohled pozvaných účastníků.", "Kdo má finální slovo u priorit."],
        needs: ["Anna: jasné hranice role a pravidla komunikace."],
      },
      diary: [
        {
          author: "AI mediátor",
          text: "Místnost je připravená pro oddělené soukromé vstupy účastníků.",
          type: "system",
        },
      ],
      agreement: "",
    },
    {
      id: "room-family",
      title: "Péče o rodiče",
      type: "Rodinný",
      status: "Soukromý vstup",
      updated: "včera",
      progress: 8,
      archived: false,
      participants: ["Anna"],
      inviteToken: "demo-family",
      stage: "Vstupní mapování",
      mediationSettings: { ...defaultMediationSettings, style: "calm" },
      privateConversations: {
        Anna: [
          {
            author: "AI mediátor",
            text:
              "Začněme vaším pohledem. Co je pro vás v této situaci nejtěžší a co by vám pomohlo cítit větší jistotu?",
            ai: true,
          },
        ],
      },
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
      diary: [
        {
          author: "AI mediátor",
          text: "Místnost čeká na soukromé vstupy jednotlivých účastníků.",
          type: "system",
        },
      ],
      agreement: "",
    },
  ],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};

const app = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: "Server error", detail: error.message });
  }
};

if (require.main === module && !process.env.VERCEL) {
  const server = http.createServer(app);
  server.listen(port, host, () => {
    const shownHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    console.log(`Dohoda prototype server: http://${shownHost}:${port}`);
  });
}

module.exports = app;

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    const database = await checkDatabase();
    sendJson(res, 200, {
      ok: true,
      aiConfigured: Boolean(openaiApiKey),
      databaseConfigured: Boolean(databaseUrl),
      databaseOk: database.ok,
      databaseError: database.error,
      rooms: store.rooms.length,
    });
    return;
  }

  await loadPersistentStore();

  if (req.method === "GET" && url.pathname === "/api/state") {
    normalizeStore();
    const viewer = url.searchParams.get("participant") || "";
    sendJson(res, 200, {
      ...publicStoreFor(viewer),
      aiConfigured: Boolean(openaiApiKey),
      databaseConfigured: Boolean(databaseUrl),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const room = {
      id: `room-${Date.now().toString(36)}`,
      title: body.title || "Nový konflikt",
      type: body.type || "Jiný",
      status: "Nová",
      updated: "teď",
      progress: 4,
      archived: false,
      participants: unique([body.author || "Zakladatel"]),
      inviteToken: randomToken(),
      stage: "Vstupní mapování",
      mediationSettings: { ...defaultMediationSettings },
      privateConversations: {
        [body.author || "Zakladatel"]: [
          {
            author: "AI mediátor",
            text:
              "Místnost je založená. Tady můžete popsat svůj pohled. Mediátor ostatním předá jen bezpečnější a srozumitelnější verzi toho, co je potřeba sdělit.",
            ai: true,
          },
        ],
      },
      goal: body.goal || "Najít konkrétní dohodu",
      messages: [
        {
          author: "AI mediátor",
          text:
            "Místnost byla založena. Pozvěte další účastníky odkazem a nechte je nejdřív vyplnit soukromý vstup.",
          ai: true,
        },
      ],
      map: {
        shared: ["Místnost je připravená pro první vstupy."],
        open: ["Čekáme na pohled dalších stran."],
        needs: ["Zakladatel chce strukturovaný proces."],
      },
      diary: [
        {
          author: "AI mediátor",
          text: "Místnost byla založena. Další krok: pozvat účastníky a získat jejich soukromé vstupy.",
          type: "system",
        },
      ],
      agreement: "",
    };
    store.rooms.unshift(room);
    await savePersistentStore();
    sendJson(res, 200, { room: publicRoomFor(room, body.author), store: publicStoreFor(body.author) });
    return;
  }

  const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/([^/]+)$/);
  if (req.method === "POST" && match) {
    const room = findRoom(match[1]);
    if (!room) {
      sendJson(res, 404, { error: "Room not found" });
      return;
    }
    const action = match[2];
    const body = await readJson(req);

    if (action === "join") {
      if (body.name) {
        room.participants = unique([...room.participants, body.name]);
        ensurePrivateConversation(room, body.name);
      }
      addAi(room, `${body.name || "Nový účastník"} se připojil do místnosti.`);
      addDiary(room, "AI mediátor", `${body.name || "Nový účastník"} vstoupil/a do místnosti a má vlastní soukromý prostor s mediátorem.`, "join");
    }

    if (action === "private") {
      const author = body.author || "Účastník";
      const text = body.text || "";
      const conversation = ensurePrivateConversation(room, author);
      const topic = mediationActivityTopic(text);
      conversation.push({ author, text, decision: "Soukromý vstup účastníka" });
      addParticipantActivityNotices(room, author, text);
      addDiary(room, "AI mediátor", `${author} právě řeší s mediátorem: ${topic}. Ostatní uvidí jen bezpečnou podstatu, ne syrový soukromý text.`, "private-topic");
      await savePersistentStore();
      const privateReplyPromise = privateMediatorReply(room, text, author);
      const distributionPromise = distributeMediatedUpdate(room, text, author);
      conversation.push({
        author: "AI mediátor",
        text: await privateReplyPromise,
        ai: true,
        decision: "Soukromá podpora a návrhy formulací",
      });
      await distributionPromise;
      addAuthorDistributionNotice(room, author);
      updateMap(room, text);
      moveProgress(room, 5);
    }

    if (action === "messages") {
      const author = body.author || "Účastník";
      const text = body.text || "";
      room.messages.push({ author, text });
      addAi(room, await mediatorReply(room, text, author));
      updateMap(room, body.text || "");
      moveProgress(room, 7);
    }

    if (action === "settings") {
      room.mediationSettings = sanitizeMediationSettings({
        ...room.mediationSettings,
        ...body,
      });
    }

    if (action === "agreement") {
      room.agreement = makeAgreement(room);
      room.status = "Návrh dohody";
      room.progress = Math.max(room.progress, 86);
      room.stage = "Návrh dohody";
      addDiary(room, "AI mediátor", "Mediátor připravil pracovní návrh dohody z dosavadní mapy konfliktu.", "agreement");
    }

    if (action === "analysis") {
      addAi(
        room,
        "Aktualizoval jsem mapu. Nejbližší užitečný krok je potvrdit, který otevřený bod má největší dopad na dohodu.",
      );
      updateMap(room, "souhlas termín hranice");
      moveProgress(room, 8);
      addDiary(room, "AI mediátor", "Mapa dohody byla aktualizována: shoda, otevřené body a potřeby jsou připravené k další kontrole.", "analysis");
    }

    if (action === "archive") {
      room.archived = true;
      room.updated = "archivováno";
    }

    if (action === "restore") {
      room.archived = false;
      room.updated = "obnoveno";
    }

    await savePersistentStore();
    const viewer = body.author || body.name || body.participant || "";
    sendJson(res, 200, { room: publicRoomFor(room, viewer), store: publicStoreFor(viewer) });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(root, safePath));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function getSqlClient() {
  if (!databaseUrl) return null;
  if (sqlClient) return sqlClient;
  let neon;
  try {
    ({ neon } = require("@neondatabase/serverless"));
  } catch (error) {
    throw new Error("DATABASE_URL je nastavené, ale chybí balíček @neondatabase/serverless.");
  }
  sqlClient = neon(databaseUrl);
  return sqlClient;
}

async function ensureDatabase() {
  if (!databaseUrl) return null;
  const sql = await getSqlClient();
  if (!databaseReady) {
    databaseReady = (async () => {
      await sql.query(`
        CREATE TABLE IF NOT EXISTS dohoda_state (
          id text PRIMARY KEY,
          data jsonb NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await sql.query(
        `
          INSERT INTO dohoda_state (id, data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO NOTHING
        `,
        ["main", JSON.stringify({ rooms: store.rooms })],
      );
    })();
  }
  await databaseReady;
  return sql;
}

async function loadPersistentStore() {
  const sql = await ensureDatabase();
  if (!sql) return;
  const result = await sql.query("SELECT data FROM dohoda_state WHERE id = $1", ["main"]);
  const rows = queryRows(result);
  const data = rows[0]?.data;
  if (data && Array.isArray(data.rooms)) {
    store.rooms = data.rooms;
  }
}

async function savePersistentStore() {
  const sql = await ensureDatabase();
  if (!sql) return;
  await sql.query(
    `
      INSERT INTO dohoda_state (id, data, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = now()
    `,
    ["main", JSON.stringify({ rooms: store.rooms })],
  );
}

async function checkDatabase() {
  if (!databaseUrl) return { ok: false, error: "DATABASE_URL není nastavené" };
  try {
    await loadPersistentStore();
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function queryRows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.rows)) return result.rows;
  return [];
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function findRoom(id) {
  const room = store.rooms.find((item) => item.id === id);
  if (room) ensureRoomDefaults(room);
  return room;
}

function normalizeStore() {
  store.rooms.forEach(ensureRoomDefaults);
}

function ensureRoomDefaults(room) {
  room.mediationSettings = sanitizeMediationSettings(room.mediationSettings || {});
  if (!room.privateConversations) room.privateConversations = {};
  if (!room.inviteToken) room.inviteToken = randomToken();
  if (!room.stage) room.stage = room.progress >= 80 ? "Návrh dohody" : room.progress >= 45 ? "Hledání mostu" : "Vstupní mapování";
  if (!Array.isArray(room.diary)) {
    room.diary = [
      {
        author: "AI mediátor",
        text: "Místnost je připravená. Mediátor odděluje soukromé vstupy od bezpečných sdělení pro ostatní.",
        type: "system",
      },
    ];
  }
  if (!room.map) room.map = { shared: [], open: [], needs: [] };
  if (!Array.isArray(room.map.shared)) room.map.shared = [];
  if (!Array.isArray(room.map.open)) room.map.open = [];
  if (!Array.isArray(room.map.needs)) room.map.needs = [];
}

function publicStoreFor(viewer = "") {
  normalizeStore();
  return {
    rooms: store.rooms.map((room) => publicRoomFor(room, viewer)),
  };
}

function publicRoomFor(room, viewer = "") {
  ensureRoomDefaults(room);
  const safeRoom = { ...room };
  const name = String(viewer || "").trim();
  const privateConversations = {};
  if (name) {
    privateConversations[name] = room.privateConversations?.[name] || [];
  } else {
    safeRoom.inviteToken = "";
  }
  safeRoom.privateConversations = privateConversations;
  return safeRoom;
}

function sanitizeMediationSettings(settings) {
  const style = ["warm", "calm", "clear", "direct", "authentic"].includes(settings.style)
    ? settings.style
    : defaultMediationSettings.style;
  const variants = Math.max(1, Math.min(3, Number(settings.variants || defaultMediationSettings.variants)));
  return {
    style,
    autoBridge: settings.autoBridge !== false,
    adaptToRecipient: settings.adaptToRecipient !== false,
    variants,
  };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function addAi(room, text) {
  room.messages.push({ author: "AI mediátor", text, ai: true });
}

function addDiary(room, author, text, type = "note") {
  ensureRoomDefaults(room);
  room.diary.push({
    author,
    text,
    type,
    at: new Date().toISOString(),
  });
  room.diary = room.diary.slice(-80);
}

function randomToken() {
  return crypto.randomBytes(9).toString("base64url");
}

function ensurePrivateConversation(room, author) {
  if (!room.privateConversations) room.privateConversations = {};
  if (!room.privateConversations[author]) {
    room.privateConversations[author] = [
      {
        author: "AI mediátor",
        text:
          "Toto je váš soukromý prostor s AI mediátorem. Pomůžu vám pojmenovat potřeby, porozumět druhé straně a připravit bezpečnou formulaci pro případné sdílení.",
        ai: true,
      },
    ];
  }
  return room.privateConversations[author];
}

async function mediatorReply(room, text, author) {
  if (openaiApiKey) {
    try {
      return await openaiMediatorReply(room, text, author);
    } catch (error) {
      console.warn("OpenAI mediator fallback:", error.message);
    }
  }
  return fallbackMediatorReply(room, text, author);
}

async function privateMediatorReply(room, text, author) {
  if (openaiApiKey) {
    try {
      return await openaiPrivateMediatorReply(room, text, author);
    } catch (error) {
      console.warn("OpenAI private mediator fallback:", error.message);
    }
  }
  return fallbackPrivateMediatorReply(room, text, author);
}

async function distributeMediatedUpdate(room, text, author) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const recipients = room.participants.filter((name) => name && name !== author);
  if (!recipients.length) return;

  for (const recipient of recipients) {
    const conversation = ensurePrivateConversation(room, recipient);
    const mediatedText = settings.autoBridge
      ? await mediatedRecipientUpdate(room, text, author, recipient)
      : `${author} právě přidal/a nový pohled. AI mediátor ho bere v úvahu při hledání dohody.`;
    conversation.push({
      author: "AI mediátor",
      text: mediatedText,
      ai: true,
      mediatedFrom: author,
      decision: "Bezpečné shrnutí pro tohoto účastníka",
    });
  }
}

function addParticipantActivityNotices(room, author, text = "") {
  const recipients = room.participants.filter((name) => name && name !== author);
  const topic = mediationActivityTopic(text);
  for (const recipient of recipients) {
    const conversation = ensurePrivateConversation(room, recipient);
    conversation.push({
      author: "AI mediátor",
      text: `${author} právě komunikuje s mediátorem. Téma: ${topic}. Připravuji bezpečnou verzi podstaty pro ostatní strany.`,
      ai: true,
      activity: true,
      decision: "Neutrální informace o probíhající mediaci",
    });
  }
}

function addAuthorDistributionNotice(room, author) {
  const recipients = room.participants.filter((name) => name && name !== author);
  if (!recipients.length) return;
  const conversation = ensurePrivateConversation(room, author);
  conversation.push({
    author: "AI mediátor",
    text: `Ostatní strany jsem informoval, že se mnou právě komunikujete. Každému z nich předávám jen bezpečnější a srozumitelnější verzi podstaty, ne nutně vaše doslovné znění.`,
    ai: true,
    activity: true,
    decision: "Potvrzení přenosu ostatním stranám",
  });
}

async function mediatedRecipientUpdate(room, text, author, recipient) {
  if (openaiApiKey) {
    try {
      return await openaiRecipientBridgeReply(room, text, author, recipient);
    } catch (error) {
      console.warn("OpenAI recipient bridge fallback:", error.message);
    }
  }
  return fallbackRecipientBridgeReply(room, text, author, recipient);
}

function mediationActivityTopic(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  const lower = clean.toLowerCase();
  if (!clean) return "nový vstup k dohodě";
  if (lower.includes("ignor") || lower.includes("nereag") || lower.includes("neodpov")) {
    return "potřeba nebýt přehlížen/a a dostat srozumitelnou reakci";
  }
  if (lower.includes("odpověd") || lower.includes("zodpověd") || lower.includes("rozhod")) {
    return "jasnější odpovědnosti, rozhodování a hranice rolí";
  }
  if (lower.includes("štve") || lower.includes("stve") || lower.includes("vadí")) {
    return "silná hranice nebo věc, která už začíná zraňovat";
  }
  if (lower.includes("nechci") || lower.includes("bojím") || lower.includes("obav")) {
    return "obava nebo hranice, kterou je potřeba pojmenovat bezpečněji";
  }
  if (lower.includes("termín") || lower.includes("termin") || lower.includes("kdy")) {
    return "termíny, závazky a konkrétní další kroky";
  }
  const preview = clean.length > 120 ? `${clean.slice(0, 117)}...` : clean;
  return `nový pohled k tématu dohody: „${preview}“`;
}

async function openaiMediatorReply(room, text, author) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: "system",
          content: [
            "Jsi Dohoda, nezaujatý AI mediátor v konfliktu. Nejsi soudce a neurčuješ vítěze.",
            "Pomáháš stranám rychle najít průsečík, oddělit fakta od interpretací, pojmenovat potřeby a posunout se o jeden konkrétní krok.",
            "Odpovídej česky, stručně, živě, nadějně a bez chladného korporátního tónu.",
            "Když je zpráva ostrá, zraněná nebo chaotická, přelož ji pro ostatní strany do srozumitelnější a méně zraňující řeči. Nepřepisuj význam tak, aby se autor ztratil.",
            "Když je zapnutý automatický překlad mezi stranami, tvoje odpověď má být hlavně most: bezpečné jádro sdělení, průsečík se zájmy druhé strany a jeden další krok.",
            "Neptej se zbytečně na svolení. Pokud je sdělení bezpečné shrnout, shrň ho a propoj strany.",
            "Nepředstírej právní ani terapeutickou autoritu.",
            mediationPlaybook,
            styleInstruction(room),
          ].join(" "),
        },
        {
          role: "user",
          content: buildMediatorContext(room, text, author),
        },
      ],
      temperature: 0.72,
      max_output_tokens: 620,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI response did not contain text");
  return output.trim();
}

function buildMediatorContext(room, text, author) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const recentMessages = room.messages
    .slice(-12)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const recipients = room.participants.filter((name) => name !== author).join(", ") || "ostatní strany";
  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Typ konfliktu: ${room.type}`,
    `Účastníci: ${room.participants.join(", ")}`,
    `Styl mediace: ${settings.style}`,
    `Automatický překlad mezi stranami: ${settings.autoBridge ? "ano" : "ne"}`,
    `Přizpůsobovat tón adresátům: ${settings.adaptToRecipient ? "ano" : "ne"}`,
    "",
    "Mapa konfliktu:",
    `Body shody: ${room.map.shared.join("; ")}`,
    `Otevřené body: ${room.map.open.join("; ")}`,
    `Potřeby stran: ${room.map.needs.join("; ")}`,
    "",
    "Poslední zprávy:",
    recentMessages,
    "",
    `Nová zpráva od ${author}: ${text}`,
    `Adresáti překladu/přerámování: ${recipients}`,
    "",
    settings.autoBridge
      ? "Odpověz jako mediátor pro ostatní strany. Max 120 slov. Struktura: 1. bezpečné jádro sdělení, 2. možný průsečík, 3. jeden konkrétní další krok. Buď vřelý, svižný a neformální."
      : "Odpověz jako mediátor do komunikace mezi stranami. Max 120 slov. Buď konkrétní, užitečný, lidský a veď k dalšímu kroku.",
  ].join("\n");
}

async function openaiPrivateMediatorReply(room, text, author) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: "system",
          content: [
            "Jsi soukromý AI mediátor v aplikaci Dohoda. Mluvíš jen s jedním účastníkem.",
            "Tvým cílem je rychle pochopit podstatu, najít průsečík s druhou stranou a udělat další mediační krok.",
            "Odpovídej česky, empaticky, živě, stručně a povzbudivě. Nezněj stroze, terapeuticky ani sportovně-direktivně.",
            "Nenabízej varianty automaticky. Varianty formulace dej jen tehdy, když účastník řeší přesné znění nebo tón.",
            "V každé odpovědi rozlišuj dvě věci: co je soukromá podpora pro tohoto účastníka a co je podstata, kterou lze bezpečně předat ostatním stranám.",
            "Vždy výslovně pojmenuj mediační rozhodnutí: co zůstává soukromé, co lze předat jako shrnutí a co zatím nepředávat.",
            "Drž fázi mediace, ale nebuď pomalý. Pokud vidíš jasný průsečík, pojmenuj ho hned.",
            "Pokud účastník ventiluje, krátce uznej emoci a ihned ji přelož do potřeby nebo dalšího kroku.",
            "Nikdy netvrď, že znáš soukromé myšlenky druhé strany. Neprozrazuj soukromé informace.",
            mediationPlaybook,
            styleInstruction(room),
          ].join(" "),
        },
        {
          role: "user",
          content: buildPrivateMediatorContext(room, text, author),
        },
      ],
      temperature: 0.7,
      max_output_tokens: 520,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI private request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI private response did not contain text");
  return output.trim();
}

async function openaiRecipientBridgeReply(room, text, author, recipient) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      input: [
        {
          role: "system",
          content: [
            "Jsi Dohoda, AI mediátor, který bezpečně překládá soukromé sdělení jedné strany pro jinou stranu konfliktu.",
            "Cíl: adresát má vědět, o čem druhá strana komunikuje, ale nemá být zbytečně zasažen surovou formulací.",
            "Zachovej podstatu sdělení, potřebu a emoci autora. Pokud je to užitečné, uveď, že původní tón mohl být ostřejší nebo zraněný, ale neeskaluj.",
            "Nemluv jako korporátní filtr. Buď lidský, stručný, svižný a srozumitelný.",
            "Hledej průsečík a navrhni jeden konkrétní další krok. Neprodlužuj proces otázkami, pokud můžeš nabídnout bezpečný tah.",
            "Nepředstírej jistotu o vnitřních motivech autora.",
            mediationPlaybook,
            styleInstruction(room),
          ].join(" "),
        },
        {
          role: "user",
          content: buildRecipientBridgeContext(room, text, author, recipient),
        },
      ],
      temperature: 0.72,
      max_output_tokens: 320,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI recipient bridge failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI recipient bridge response did not contain text");
  return output.trim();
}

function buildPrivateMediatorContext(room, text, author) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const privateHistory = ensurePrivateConversation(room, author)
    .slice(-10)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const publicMessages = room.messages
    .slice(-8)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const otherParticipants = room.participants.filter((name) => name !== author).join(", ") || "zatím nikdo další";

  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Aktuální účastník: ${author}`,
    `Ostatní účastníci: ${otherParticipants}`,
    `Styl mediace: ${settings.style}`,
    `Počet navržených formulací: ${settings.variants}`,
    `Přizpůsobovat tón adresátovi: ${settings.adaptToRecipient ? "ano" : "ne"}`,
    `Fáze mediace: ${room.stage || "Vstupní mapování"}`,
    "",
    "Mapa konfliktu:",
    `Body shody: ${room.map.shared.join("; ")}`,
    `Otevřené body: ${room.map.open.join("; ")}`,
    `Potřeby stran: ${room.map.needs.join("; ")}`,
    "",
    "Veřejný kontext:",
    publicMessages || "- žádný",
    "",
    "Soukromý rozhovor s tímto účastníkem:",
    privateHistory || "- žádný",
    "",
    `Nová soukromá zpráva od ${author}: ${text}`,
    "",
    `Odpověz soukromě a svižně, max 150 slov. Použij oddíly: 1. "Podstata" - co je jádro sdělení. 2. "Průsečík" - kde se to může potkat se zájmem ostatních. 3. "Co předám" - bezpečné shrnutí pro ostatní a co zůstává soukromé. 4. "Další tah" - jeden konkrétní krok. Varianty formulace nabídni jen pokud jsou opravdu nutné.`,
  ].join("\n");
}

function buildRecipientBridgeContext(room, text, author, recipient) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const recipientHistory = ensurePrivateConversation(room, recipient)
    .slice(-8)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Autor původního sdělení: ${author}`,
    `Adresát přerámování: ${recipient}`,
    `Styl mediace: ${settings.style}`,
    `Přizpůsobovat tón adresátovi: ${settings.adaptToRecipient ? "ano" : "ne"}`,
    "",
    "Mapa konfliktu:",
    `Body shody: ${room.map.shared.join("; ")}`,
    `Otevřené body: ${room.map.open.join("; ")}`,
    `Potřeby stran: ${room.map.needs.join("; ")}`,
    "",
    "Dosavadní soukromý kontext adresáta:",
    recipientHistory || "- žádný",
    "",
    `Původní zpráva od ${author}: ${text}`,
    "",
    [
      `Napiš zprávu pro ${recipient}.`,
      "Max 110 slov.",
      "Začni stručně: kdo přinesl nový pohled a jaké je bezpečné jádro.",
      "Pak pojmenuj možný průsečík se zájmem adresáta.",
      "Ujisti adresáta, že nejde o doslovný přepis soukromého chatu, ale o bezpečnou podstatu.",
      "Na konci přidej jeden malý krok, který může adresát udělat hned.",
      settings.style === "authentic"
        ? "Protože je zvolen autentický styl, zachovej víc původní energie autora, ale bez zbytečného útoku."
        : "Zachovej vřelý a neútočný tón.",
    ].join(" "),
  ].join("\n");
}

function styleInstruction(room) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  return styleInstructions[settings.style] || styleInstructions.warm;
}

function extractResponseText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";
  return data.output
    .flatMap((item) => item.content || [])
    .map((part) => part.text || "")
    .join("");
}

function fallbackMediatorReply(room, text, author) {
  const lower = text.toLowerCase();
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const others = room.participants.filter((name) => name !== author).join(", ") || "ostatní";
  if (settings.autoBridge) {
    return `${author} pravděpodobně přináší něco, co je pro něj důležité. Pro ${others} bych to přeložil jemněji takto: „Potřebuji, abychom si to pojmenovali bez tlaku a našli pravidlo, které bude dávat smysl všem.“ Co by vám pomohlo cítit, že je tahle dohoda fér?`;
  }
  if (lower.includes("co tady") || lower.includes("k čemu") || lower.includes("k cemu") || lower.includes("jako")) {
    return `${author}, tohle je společná místnost pro řešení konfliktu „${room.title}“. Cílem není rozhodnout, kdo má pravdu, ale pomoct všem stranám bezpečně popsat svůj pohled, najít body shody a dojít ke konkrétní dohodě. Můžete začít jednou větou: co je pro vás v téhle situaci nejdůležitější?`;
  }
  if (lower.includes("souhlas")) {
    return `Díky, ${author}. Slyším první bod shody. Zkusme ho zpřesnit: s čím přesně souhlasíte a jak by se to mělo projevit v dohodě?`;
  }
  if (lower.includes("nechci") || lower.includes("vadí") || lower.includes("bojím")) {
    return `Rozumím, ${author}. Zkusím to přerámovat jako potřebu: za touhle námitkou je pravděpodobně důležitá hranice nebo obava. Co by vám dalo pocit, že dohoda je pro vás férová?`;
  }
  if (lower.includes("kdy") || lower.includes("termín") || lower.includes("do kdy")) {
    return "Tohle už je dobrý kandidát do dohody. Navrhuji doplnit čtyři věci: kdo je za krok odpovědný, co přesně udělá, do kdy a jak poznáme, že to stačilo.";
  }
  return `${author}, díky. Abychom se posunuli, pomůže říct to trochu konkrétněji: co se podle vás stalo, co na tom pro vás bylo nejdůležitější a jaký výsledek by vám připadal férový?`;
}

function fallbackPrivateMediatorReply(room, text, author) {
  const lower = text.toLowerCase();
  const others = room.participants.filter((name) => name !== author);
  const otherLabel = others.length ? others.join(", ") : "druhá strana";
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const variants = Math.max(1, Math.min(3, settings.variants));

  if (lower.includes("co tady") || lower.includes("k čemu") || lower.includes("k cemu")) {
    return [
      "Podstata: chcete vědět, co se tu děje s vašimi slovy.",
      "Průsečík: všem pomůže, když je jasné, co je soukromá práce a co jde dál do místnosti.",
      `Co předám: ostatním jen to, že ${author} si ujasňuje způsob práce s mediátorem. Soukromé formulace zůstávají tady.`,
      "Další tah: napište jednou větou, co potřebujete, aby druhá strana konečně pochopila.",
    ].join("\n");
  }

  if (lower.includes("štve") || lower.includes("stve") || lower.includes("vadí") || lower.includes("nechci") || lower.includes("bojím")) {
    return [
      "Podstata: je tu hranice, která už potřebuje být slyšet.",
      `Průsečík: vy chcete respekt, ${otherLabel} může chtít necítit tlak. To se dá spojit přes jasné pravidlo místo výčitek.`,
      `Co předám: ${author} potřebuje konkrétní reakci a srozumitelnou dohodu, ne boj o vinu. Syrový tón nechávám soukromě.`,
      "Další tah: pošlu ostatním bezpečné jádro a vy mi napište, jaký minimální výsledek by vám stačil pro posun.",
    ].join("\n");
  }

  if (lower.includes("souhlas") || lower.includes("možná") || lower.includes("mozna")) {
    return [
      "Podstata: tady už je kousek shody.",
      "Průsečík: shodu je potřeba okamžitě převést do pravidla, jinak se zase rozpustí.",
      `Co předám: ${author} vidí společný směr a chce ho proměnit v konkrétní dohodu.`,
      "Další tah: pojmenujme jedno pravidlo, které může začít platit hned tento týden.",
    ].join("\n");
  }

  return [
    "Podstata: chcete být pochopen/a a dostat se k použitelné dohodě.",
    `Průsečík: vy i ${otherLabel} pravděpodobně potřebujete méně nejasností a méně obrany.`,
    `Co předám: ${author} přináší nový pohled a hledá pravidlo, které bude fungovat pro obě strany.`,
    "Další tah: zkusme to stáhnout na jednu konkrétní větu: co má odteď platit jinak?",
  ].join("\n");
}

function fallbackRecipientBridgeReply(room, text, author, recipient) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const authenticity = settings.style === "authentic"
    ? "Ponechávám víc původní energie sdělení, ale odstraňuji to, co by zbytečně zraňovalo."
    : "Překládám to do klidnější řeči, aby šlo lépe slyšet podstatu.";
  return [
    `${author} právě přinesl/a nový pohled. ${authenticity}`,
    `Jádro pro vás, ${recipient}: nejde teď o útok, ale o potřebu srozumitelnější reakce a jasnější dohody.`,
    "Průsečík: méně domýšlení, víc konkrétních pravidel.",
    "Další tah: napište jednou větou, co z toho umíte uznat, a jednu věc, kterou potřebujete vy.",
  ].join("\n");
}

function updateMap(room, text) {
  const lower = text.toLowerCase();
  if (lower.includes("souhlas")) addUnique(room.map.shared, "V komunikaci se objevil výslovný souhlas.");
  if (lower.includes("termín") || lower.includes("kdy")) addUnique(room.map.open, "Doplnit termín a vlastníka dohody.");
  if (lower.includes("hranice") || lower.includes("nechci")) addUnique(room.map.needs, "Některá strana potřebuje jasně chráněnou hranici.");
}

function moveProgress(room, amount) {
  room.progress = Math.min(96, Math.max(0, room.progress + amount));
  if (room.progress >= 86) {
    room.status = "Blízko dohody";
    room.stage = "Kontrola dohody";
  } else if (room.progress >= 70) {
    room.status = "Návrh dohody";
    room.stage = "Návrh dohody";
  } else if (room.progress >= 45) {
    room.status = "V procesu";
    room.stage = "Hledání mostu";
  } else if (room.progress >= 18) {
    room.status = "Zklidňování";
    room.stage = "Pojmenování potřeb";
  } else {
    room.stage = "Vstupní mapování";
  }
}

function addUnique(list, item) {
  if (!list.includes(item)) list.push(item);
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
    "- Každá změna dohody bude nejdřív přeložena mediátorem všem zúčastněným.",
    "- Po 14 dnech proběhne kontrola, zda dohoda funguje.",
    "",
    "Otevřené body:",
    ...room.map.open.map((item) => `- ${item}`),
  ].join("\n");
}
