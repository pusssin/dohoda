const http = require("http");
const fs = require("fs");
const path = require("path");

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
    "Tón je vřelý, lidský, povzbuzující a nadějný. Vyhýbej se studenému poradenskému jazyku. Používej běžnou češtinu.",
  calm:
    "Tón je klidný, citlivý a opatrný. Nejprve uznej emoci, potom jemně nabídni další pohled.",
  clear:
    "Tón je srozumitelný, strukturovaný a laskavě věcný. Drž se krátkých kroků a jasných formulací.",
  direct:
    "Tón je přímý, ale ne tvrdý. Pojmenuj podstatu bez obviňování a nabídni praktickou cestu dál.",
  authentic:
    "Tón zachovává maximum autenticity autora. Nevyhlazuj sdělení do sterilní fráze. Zjemni jen to, co by zbytečně zraňovalo nebo bránilo porozumění, a jasně odděl původní emoci od bezpečnější formulace.",
};

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
    sendJson(res, 200, {
      ...store,
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
      agreement: "",
    };
    store.rooms.unshift(room);
    await savePersistentStore();
    sendJson(res, 200, { room, store });
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
    }

    if (action === "private") {
      const author = body.author || "Účastník";
      const text = body.text || "";
      const conversation = ensurePrivateConversation(room, author);
      conversation.push({ author, text });
      addParticipantActivityNotices(room, author, text);
      await savePersistentStore();
      const privateReplyPromise = privateMediatorReply(room, text, author);
      const distributionPromise = distributeMediatedUpdate(room, text, author);
      conversation.push({
        author: "AI mediátor",
        text: await privateReplyPromise,
        ai: true,
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
    }

    if (action === "analysis") {
      addAi(
        room,
        "Aktualizoval jsem mapu. Nejbližší užitečný krok je potvrdit, který otevřený bod má největší dopad na dohodu.",
      );
      updateMap(room, "souhlas termín hranice");
      moveProgress(room, 8);
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
    sendJson(res, 200, { room, store });
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
  if (!room.map) room.map = { shared: [], open: [], needs: [] };
  if (!Array.isArray(room.map.shared)) room.map.shared = [];
  if (!Array.isArray(room.map.open)) room.map.open = [];
  if (!Array.isArray(room.map.needs)) room.map.needs = [];
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
            "Pomáháš stranám porozumět si, oddělit fakta od interpretací, pojmenovat potřeby, hlídat férový tón a navrhovat konkrétní další krok.",
            "Odpovídej česky, lidsky, nadějně a bez chladného korporátního tónu.",
            "Když je zpráva ostrá, zraněná nebo chaotická, přelož ji pro ostatní strany do srozumitelnější a méně zraňující řeči. Nepřepisuj význam tak, aby se autor ztratil.",
            "Když je zapnutý automatický překlad mezi stranami, tvoje odpověď má být hlavně most: co asi autor potřebuje sdělit, jak to mohou ostatní slyšet bezpečněji, a jedna otázka, která posune dohodu.",
            "Nepředstírej právní ani terapeutickou autoritu.",
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
      ? "Odpověz jako mediátor pro ostatní strany. Nejdřív krátce přelož nebo zjemni sdělení autora bez ztráty významu. Pak přidej jednu otázku nebo další krok. Odpověď má být vřelá a srozumitelná."
      : "Odpověz jako mediátor do komunikace mezi stranami. Buď konkrétní, užitečný a lidský. Pokud je to vhodné, polož jednu otázku nebo navrhni další krok.",
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
            "Tvým cílem je pomoci mu uklidnit situaci, pojmenovat potřeby, rozlišit fakta a interpretace, představit možný pohled druhé strany a připravit bezpečné formulace pro komunikaci mezi stranami.",
            "Odpovídej česky, empaticky, živě a povzbudivě. Nezněj stroze ani sportovně-direktivně.",
            "Nabízej několik variant formulace, aby si účastník mohl vybrat tón, který je mu blízký.",
            "V každé odpovědi rozlišuj dvě věci: co je soukromá podpora pro tohoto účastníka a co je podstata, kterou lze bezpečně předat ostatním stranám.",
            "Pokud účastník píše něco, co je zjevně jen ventilace nebo nejistota, nejprve mu pomoz porozumět tomu, co opravdu chce adresovat ostatním.",
            "Nikdy netvrď, že znáš soukromé myšlenky druhé strany. Neprozrazuj soukromé informace.",
            styleInstruction(room),
          ].join(" "),
        },
        {
          role: "user",
          content: buildPrivateMediatorContext(room, text, author),
        },
      ],
      temperature: 0.76,
      max_output_tokens: 760,
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
            "Nemluv jako korporátní filtr. Buď lidský, stručný, klidný a srozumitelný.",
            "Nepředstírej jistotu o vnitřních motivech autora.",
            styleInstruction(room),
          ].join(" "),
        },
        {
          role: "user",
          content: buildRecipientBridgeContext(room, text, author, recipient),
        },
      ],
      temperature: 0.72,
      max_output_tokens: 420,
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
    `Odpověz soukromě. Použij krátké oddíly: 1. "Co slyším u vás" - lidsky pojmenuj potřebu nebo emoci. 2. "Co bych předal/a ostatním" - řekni, jakou podstatu by mediátor bezpečně komunikoval druhým stranám. 3. "Možné formulace" - navrhni ${settings.variants} různé formulace. Varianty mají mít rozdílný tón, například jemnější, jasnější a vstřícnější.`,
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
      "Začni stručně: kdo přinesl nový pohled a o čem zhruba je.",
      "Pak přelož sdělení do bezpečnější řeči pro adresáta.",
      "Na konci přidej jednu otázku nebo malý krok, který pomůže porozumění.",
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
      "Co slyším u vás: chcete pochopit, k čemu tenhle prostor slouží a co se s vašimi slovy bude dít.",
      `Co bych předal/a ostatním: ${author} si teď ujasňuje, jak bezpečně používat mediaci, a zatím nepřináší konkrétní návrh k dohodě.`,
      "Možné formulace:",
      "1. „Nejdřív si potřebuji ujasnit, jak tenhle proces funguje.“",
      "2. „Chci mluvit otevřeně, ale zároveň nechci, aby se moje slova zbytečně vyhrotila.“",
      "3. „Pomůže mi vědět, co se bude předávat ostatním a co zůstává jen jako práce s mediátorem.“",
    ].join("\n");
  }

  if (lower.includes("štve") || lower.includes("stve") || lower.includes("vadí") || lower.includes("nechci") || lower.includes("bojím")) {
    return [
      "Co slyším u vás: je tam silná hranice nebo obava. To je důležitý signál, ne chyba.",
      `Co bych předal/a ostatním: ${author} potřebuje, aby se jeho/její hranice brala vážně, ale chce ji formulovat tak, aby nezněla jako útok. Možná perspektiva ${otherLabel}: nemusí nutně odmítat vaši potřebu, může se bát ztráty autonomie, tlaku nebo další kontroly.`,
      "",
      "Možné formulace:",
      ...[
        "Jemnější: „Narážím v tom na něco, co je pro mě citlivé. Potřeboval bych to probrat klidněji, abychom se slyšeli.“",
        "Jasnější: „Vadí mi hlavně nejistota. Potřebuji vědět, podle čeho se rozhoduje a co už je domluvené.“",
        "Vstřícnější: „Nechci vás tlačit do kouta. Chci jen najít pravidlo, ve kterém se budeme moct oba cítit bezpečně.“",
      ].slice(0, variants),
    ].join("\n");
  }

  if (lower.includes("souhlas") || lower.includes("možná") || lower.includes("mozna")) {
    return [
      "Co slyším u vás: objevuje se ochota hledat most, ale nejspíš potřebujete doplnit podmínku férovosti.",
      `Co bych předal/a ostatním: ${author} vidí část, se kterou může souhlasit, a zároveň potřebuje jasně pojmenovat, co musí platit, aby dohoda byla bezpečná.`,
      "Možné formulace:",
      "1. „Souhlasím, že nechceme další zbytečný proces. Zároveň potřebuji jednoduché pravidlo, aby se odpovědnosti neměnily bez potvrzení.“",
      "2. „Tady se umíme potkat. Potřebuju jen doplnit, podle čeho poznáme, že dohoda opravdu platí.“",
      "3. „Vidím společný směr. Pojďme ho převést do jednoho konkrétního pravidla.“",
    ].join("\n");
  }

  return [
    `Co slyším u vás: chcete, aby vás druhá strana opravdu pochopila a aby dohoda nebyla jen formální, ale použitelná.`,
    `Co bych předal/a ostatním: ${author} přináší nový pohled, který stojí za klidné vyslechnutí. Možná perspektiva ${otherLabel}: nemusí jít o odmítnutí vaší potřeby, ale o jinou obavu, tempo nebo způsob komunikace.`,
    "",
    "Možné formulace:",
    ...[
      "Jemnější: „Rád bych to zkusil pojmenovat tak, abychom se neposouvali do výčitek, ale k dohodě.“",
      "Jasnější: „Potřebuji vědět, co konkrétně platí a podle čeho poznáme, že jsme se domluvili.“",
      "Vstřícnější: „Chci najít řešení, které bude dávat smysl i vám, jen potřebuji lépe pochopit vaše hranice.“",
    ].slice(0, variants),
  ].join("\n");
}

function fallbackRecipientBridgeReply(room, text, author, recipient) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const authenticity = settings.style === "authentic"
    ? "Ponechávám víc původní energie sdělení, ale odstraňuji to, co by zbytečně zraňovalo."
    : "Překládám to do klidnější řeči, aby šlo lépe slyšet podstatu.";
  return [
    `${author} právě přinesl/a nový pohled. ${authenticity}`,
    `Pro vás, ${recipient}, může být užitečné slyšet hlavně toto: druhá strana potřebuje, aby se její obava nebo hranice nebrala jako útok, ale jako signál, že je potřeba jasnější dohoda.`,
    `Možný další krok: můžete krátce odpovědět, co z toho slyšíte jako skutečnou potřebu, ještě než začnete navrhovat řešení.`,
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
  if (room.progress >= 80) room.status = "Blízko dohody";
  else if (room.progress >= 45) room.status = "V procesu";
  else if (room.progress >= 18) room.status = "Zklidňování";
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
