const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

const root = __dirname;
loadLocalEnv(path.join(root, ".env"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const publicUrl = (process.env.PUBLIC_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").replace(/\/$/, "");
const adminEmails = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
let sqlClient;
let databaseReady;

const defaultMediationSettings = {
  style: "warm",
  autoBridge: true,
  adaptToRecipient: true,
  variants: 3,
  initiatorMode: false,
};

const maxSourceBytes = 50 * 1024 * 1024;
const maxRoomSourceBytes = 500 * 1024 * 1024;

const styleInstructions = {
  warm:
    "Tón je vřelý, svižný, lidský a lehce optimistický. Mluv krátce, bez poradenské vaty.",
  calm:
    "Tón je klidný, citlivý a efektivní. Uklidni situaci jednou větou a rychle veď k dalšímu kroku.",
  clear:
    "Tón je srozumitelný, strukturovaný a akční. Dej společný bod a jeden konkrétní krok.",
  direct:
    "Tón je přímý, energický a ne tvrdý. Nečekej zbytečně na svolení, když můžeš bezpečně posunout proces.",
  authentic:
    "Tón zachovává autenticitu autora. Nevyhlazuj sdělení do sterilní fráze; jen odstraň útoky, které brání porozumění.",
};

const mediationPlaybook = [
  "Pracuj zájmově: hledej potřeby a zájmy pod pozicemi, ne vítěze sporu.",
  "Používej nenásilnou komunikaci: pozorování, pocit, potřeba, prosba.",
  "Mediuj aktivně: shrň společný bod, propoj strany a navrhni nejmenší testovatelný další krok.",
  "Motivuj každou stranu k vlastnímu vyjádření. Výzva má být krátká, konkrétní a snadno zodpověditelná, ne jako dotazník.",
  "Když z příspěvku není jasný problém, cíl, potřeba nebo požadovaný výsledek, polož jednu zaměřenou doplňující otázku. Nehádej a nepokládej více otázek najednou.",
  "Když je sdělení dostatečně jasné, neopakuj zbytečné otázky a rovnou nabídni spojku nebo další krok.",
  "Nebuď nudný formulář. Buď stručný, živý, konkrétní a trochu odlehčující, pokud to nebagatelizuje bolest.",
  "Neptej se na souhlas s každou větou. Když je bezpečné posunout proces, udělej to.",
  "Rychle podchytávej vztahový kontext: kdo ke komu mluví, co kdo potřebuje, čeho se bojí, kde je ochota a kde odpor.",
  "Směřuj k férovému kompromisu: co je minimum pro každou stranu, co může každá nabídnout a jak poznáme, že dohoda funguje.",
  "Buď stručný a o důležitých krocích informuj. Nezahlcuj variantami. Nabízej varianty jen když účastník řeší tón sdělení nebo když je výběr opravdu užitečný.",
].join(" ");

const store = {
  users: [],
  sessions: {},
  oauthStates: {},
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
      sources: [],
      protocol: "",
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
      sources: [],
      protocol: "",
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
    if (url.pathname === "/auth/google") {
      await loadPersistentStore();
      await startGoogleAuth(req, res);
      return;
    }
    if (url.pathname === "/auth/google/callback") {
      await loadPersistentStore();
      await finishGoogleAuth(req, res, url);
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
      authUsers: store.users.length,
      googleConfigured: Boolean(googleClientId && googleClientSecret),
    });
    return;
  }

  await loadPersistentStore();

  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuthApi(req, res, url);
    return;
  }

  const inviteMatch = url.pathname.match(/^\/api\/invite\/([^/]+)$/);
  if (req.method === "GET" && inviteMatch) {
    const room = findRoom(inviteMatch[1]);
    const invite = String(url.searchParams.get("invite") || "").trim();
    if (!room || !validRoomInvite(room, invite)) {
      sendJson(res, 404, { error: "Pozvánka není platná nebo už neexistuje." });
      return;
    }
    sendJson(res, 200, { room: publicInviteRoom(room), googleConfigured: Boolean(googleClientId && googleClientSecret) });
    return;
  }

  const currentUser = getCurrentUser(req);
  if (!currentUser) {
    const publicJoinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (req.method === "POST" && publicJoinMatch) {
      const room = findRoom(publicJoinMatch[1]);
      if (!room) {
        sendJson(res, 404, { error: "Room not found" });
        return;
      }
      const body = await readJson(req);
      const invite = String(body.invite || "").trim();
      const joinName = cleanName(body.name || body.participant);
      if (!joinName) {
        sendJson(res, 400, { error: "Zadejte jméno pro vstup do místnosti." });
        return;
      }
      if (!validRoomInvite(room, invite)) {
        sendJson(res, 403, { error: "Pozvánka do této místnosti není platná." });
        return;
      }
      const guestUser = createGuestUser(joinName, room.id);
      let actorName;
      try {
        actorName = joinRoom(room, body, guestUser);
      } catch (error) {
        store.users = store.users.filter((user) => user.id !== guestUser.id);
        sendJson(res, error.status || 400, { error: error.message });
        return;
      }
      const token = createSession(guestUser);
      setSessionCookie(res, token);
      await savePersistentStore();
      sendJson(res, 200, {
        room: publicRoomFor(room, actorName),
        store: publicStoreFor(actorName, guestUser),
        authUser: publicUser(guestUser),
      });
      return;
    }
    sendJson(res, 401, { error: "Přihlášení je nutné." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    normalizeStore();
    const viewer = cleanName(url.searchParams.get("participant")) || currentUser.name;
    sendJson(res, 200, {
      ...publicStoreFor(viewer, currentUser),
      aiConfigured: Boolean(openaiApiKey),
      databaseConfigured: Boolean(databaseUrl),
      authUser: publicUser(currentUser),
      googleConfigured: Boolean(googleClientId && googleClientSecret),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/transcribe") {
    if (!openaiApiKey) {
      sendJson(res, 400, { error: "Přepis audia vyžaduje OpenAI API klíč." });
      return;
    }
    const body = await readJson(req);
    const size = Number(body.size || 0);
    if (size > maxSourceBytes) {
      sendJson(res, 413, { error: "Nahrávka je větší než 50 MB." });
      return;
    }
    const text = await transcribeAudioDataUrl(String(body.dataUrl || ""), "voice-message.webm");
    sendJson(res, 200, { text });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/rooms") {
    const body = await readJson(req);
    const author = currentUser.name;
    const room = {
      id: `room-${Date.now().toString(36)}`,
      title: body.title || "Nový konflikt",
      type: body.type || "Jiný",
      status: "Nová",
      updated: "teď",
      progress: 4,
      archived: false,
      ownerId: currentUser.id,
      participants: unique([author]),
      inviteToken: randomToken(),
      stage: "Vstupní mapování",
      mediationSettings: { ...defaultMediationSettings },
      privateConversations: {
        [author]: [
          {
            author: "AI mediátor",
            text:
              "Místnost je založená. Začněme krátce: napište jednou větou, co by se mělo změnit, aby pro vás dohoda dávala smysl. Já z toho vytáhnu podstatu a navrhnu další krok.",
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
      sources: [],
      protocol: "",
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
    sendJson(res, 200, { room: publicRoomFor(room, author), store: publicStoreFor(author, currentUser) });
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
    let actorName = action === "join" ? cleanName(body.name || body.participant) || currentUser.name : roomActorName(currentUser, room, body);

    if (action !== "join" && !canViewRoom(currentUser, room, actorName)) {
      sendJson(res, 403, { error: "Do této místnosti nemáte přístup." });
      return;
    }

    if (action === "join") {
      const joinName = cleanName(body.name || body.participant) || currentUser.name;
      if (body.guest === true && validRoomInvite(room, String(body.invite || "").trim()) && joinName && joinName !== currentUser.name) {
        const guestUser = createGuestUser(joinName, room.id);
        try {
          actorName = joinRoom(room, body, guestUser);
        } catch (error) {
          store.users = store.users.filter((user) => user.id !== guestUser.id);
          sendJson(res, error.status || 400, { error: error.message });
          return;
        }
        const token = createSession(guestUser);
        setSessionCookie(res, token);
        await savePersistentStore();
        sendJson(res, 200, {
          room: publicRoomFor(room, actorName),
          store: publicStoreFor(actorName, guestUser),
          authUser: publicUser(guestUser),
        });
        return;
      }
      try {
        actorName = joinRoom(room, body, currentUser);
      } catch (error) {
        sendJson(res, error.status || 400, { error: error.message });
        return;
      }
    }

    if (action === "nudge") {
      const author = actorName;
      const conversation = ensurePrivateConversation(room, author);
      const hasOwnInput = conversation.some((message) => !message.ai && message.author === author && String(message.text || "").trim());
      const hasRecentNudge = conversation.slice(-4).some((message) => message.idleNudge);
      if (!hasOwnInput && !hasRecentNudge) {
        conversation.push({
          author: "AI mediátor",
          text: mediatorIdlePrompt(room, author),
          ai: true,
          activity: true,
          idleNudge: true,
          decision: "Aktivní výzva mediátora",
        });
        addDiary(room, "AI mediátor", `${author} dostal/a krátkou aktivní výzvu k prvnímu vlastnímu vstupu.`, "mediator-nudge");
      }
    }

    if (action === "private") {
      const author = actorName;
      const text = String(body.text || "").trim();
      if (!text) {
        sendJson(res, 400, { error: "Zpráva je prázdná." });
        return;
      }
      const conversation = ensurePrivateConversation(room, author);
      const topic = mediationActivityTopic(text);
      const turnId = `turn-${randomToken()}`;
      conversation.push({ author, text, decision: "Soukromý vstup účastníka", turnId });
      const immediateTurn = fallbackPrivateMediationTurn(room, text, author);
      conversation.push({
        author: "AI mediátor",
        text: immediateTurn.authorReply,
        ai: true,
        turnId,
        decision: "Okamžitá reakce mediátora",
      });
      applyMediatedRecipientUpdates(room, author, immediateTurn.recipientMessages, turnId);
      addDiary(room, "AI mediátor", `${author} právě řeší s mediátorem: ${topic}. Ostatní uvidí jen bezpečnou podstatu, ne syrový soukromý text.`, "private-topic");
      await savePersistentStore();
      const mediationTurn = await processPrivateMediationTurn(room, text, author);
      replaceAuthorMediatorReply(conversation, turnId, mediationTurn.authorReply);
      applyMediatedRecipientUpdates(room, author, mediationTurn.recipientMessages, turnId);
      applyRelationshipSignals(room, mediationTurn.relationshipSignals);
      applyParticipantSignals(room, mediationTurn.participantSignals);
      addDiary(room, "AI mediátor", `Mediátor odpověděl účastníkovi ${author} a rozeslal ostatním bezpečné shrnutí podstaty.`, "mediator-response");
      updateMap(room, text);
      moveProgress(room, 5);
    }

    if (action === "messages") {
      const author = actorName;
      const text = body.text || "";
      room.messages.push({ author, text });
      addAi(room, await mediatorReply(room, text, author));
      updateMap(room, body.text || "");
      moveProgress(room, 7);
    }

    if (action === "settings") {
      const previousSettings = sanitizeMediationSettings(room.mediationSettings || {});
      room.mediationSettings = sanitizeMediationSettings({
        ...room.mediationSettings,
        ...body,
      });
      const author = actorName;
      if (author && room.mediationSettings.initiatorMode && !previousSettings.initiatorMode) {
        const conversation = ensurePrivateConversation(room, author);
        conversation.push({
          author: "AI mediátor",
          text: initiatorKickoff(room, author),
          ai: true,
          activity: true,
          decision: "Iniciátor zahájil aktivní krok",
        });
        for (const participant of room.participants.filter((name) => name && name !== author)) {
          const targetConversation = ensurePrivateConversation(room, participant);
          targetConversation.push({
            author: "AI mediátor",
            text: initiatorParticipantPrompt(room, author, participant),
            ai: true,
            activity: true,
            decision: "Iniciátor zapojuje účastníky",
          });
        }
        addDiary(room, "AI mediátor", `${author} zapnul/a Iniciátora. Mediátor připravil první aktivující krok pro rozhýbání účastníků.`, "initiator");
      }
    }

    if (action === "agreement") {
      room.agreement = makeAgreement(room);
      syncAgreementIndex(room);
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

    if (action === "add-diary-note") {
      const text = String(body.text || "").trim();
      if (!text) {
        sendJson(res, 400, { error: "Text zápisu je prázdný." });
        return;
      }
      addDiary(room, actorName, text.slice(0, 2000), "manual");
    }

    if (action === "add-source") {
      const source = sanitizeSource(body);
      if (source.size > maxSourceBytes) {
        sendJson(res, 413, { error: "Soubor je větší než 50 MB." });
        return;
      }
      ensureRoomDefaults(room);
      if (roomSourceBytes(room) + source.size > maxRoomSourceBytes) {
        sendJson(res, 413, { error: "Zdroje v této místnosti přesáhly limit 500 MB." });
        return;
      }
      source.addedBy = actorName;
      source.addedById = currentUser.id;
      room.sources.unshift(source);
      room.sources = room.sources.slice(0, 40);
      addDiary(room, actorName, `Přidal/a zdroj: ${source.title}.`, "source");
      if (source.kind === "audio" && source.dataUrl && openaiApiKey) {
        try {
          source.extractedText = await transcribeAudioSource(source);
          source.status = "Přepsáno";
        } catch (error) {
          source.status = "Čeká na přepis";
          source.note = "Audio je uložené, přepis se zatím nepovedl.";
          console.warn("Audio transcription failed:", error.message);
        }
      }
      try {
        source.status = "Analyzuji";
        source.analysis = await analyzeSource(room, source, 10000);
        source.status = source.analysis ? "Analyzováno" : source.status || "Uloženo";
        applySourceAnalysis(room, source);
        addSourceAnalysisToChat(room, actorName, source);
        addDiary(room, "AI mediátor", `Zdroj „${source.title}“ byl automaticky přečten, shrnut a doplněn o otázky pro mediaci.`, "source-analysis");
      } catch (error) {
        source.status = source.extractedText ? "Přečteno" : "Uloženo";
        source.note = "Zdroj je uložený, automatická analýza se zatím nepovedla.";
        ensurePrivateConversation(room, actorName).push({
          author: "AI mediátor",
          text: `Zdroj „${source.title}“ jsem uložil, ale automatické shrnutí se teď nepovedlo. Zkuste „Analyzovat znovu“, případně přidejte krátký textový výňatek.`,
          ai: true,
          activity: true,
          decision: "Zdroj uložen bez automatického shrnutí",
        });
        console.warn("Automatic source analysis failed:", error.message);
      }
    }

    if (action === "analyze-source") {
      const source = room.sources?.find((item) => item.id === body.sourceId);
      if (!source) {
        sendJson(res, 404, { error: "Zdroj nebyl nalezen." });
        return;
      }
      source.analysis = await analyzeSource(room, source);
      source.status = source.analysis ? "Analyzováno" : source.status || "Uloženo";
      applySourceAnalysis(room, source);
      addSourceAnalysisToChat(room, actorName, source);
      addDiary(room, "AI mediátor", `Zdroj „${source.title}“ byl přečten a promítnut do mapy dohody.`, "source-analysis");
    }

    if (action === "delete-source") {
      const source = room.sources?.find((item) => item.id === body.sourceId);
      if (!source) {
        sendJson(res, 404, { error: "Zdroj nebyl nalezen." });
        return;
      }
      if (!canDeleteSource(currentUser, room, source)) {
        sendJson(res, 403, { error: "Smazat zdroj může autor zdroje nebo admin." });
        return;
      }
      room.sources = room.sources.filter((item) => item.id !== source.id);
      addDiary(room, actorName, `Smazal/a zdroj: ${source.title}.`, "source-delete");
    }

    if (action === "delete-room") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      store.rooms = store.rooms.filter((item) => item.id !== room.id);
      await savePersistentStore();
      sendJson(res, 200, { store: publicStoreFor(currentUser.name, currentUser), authUser: publicUser(currentUser) });
      return;
    }

    if (action === "archive") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      room.archived = true;
      room.updated = "archivováno";
    }

    if (action === "restore") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      room.archived = false;
      room.updated = "obnoveno";
    }

    if (action === "lock") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      room.locked = true;
      addDiary(room, "Admin", "Místnost byla uzamčena pro nové účastníky.", "admin");
    }

    if (action === "unlock") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      room.locked = false;
      addDiary(room, "Admin", "Místnost byla znovu otevřena pro pozvánky.", "admin");
    }

    if (action === "reset-invite") {
      if (!canManageRoom(currentUser, room)) {
        sendJson(res, 403, { error: "K této akci nemáte oprávnění." });
        return;
      }
      room.inviteToken = randomToken();
      addDiary(room, "Admin", "Pozvánka do místnosti byla resetována.", "admin");
    }

    await savePersistentStore();
    const viewer = actorName;
    sendJson(res, 200, { room: publicRoomFor(room, viewer), store: publicStoreFor(viewer, currentUser), authUser: publicUser(currentUser) });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function handleAuthApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = getCurrentUser(req);
    sendJson(res, 200, {
      user: user ? publicUser(user) : null,
      googleConfigured: Boolean(googleClientId && googleClientSecret),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJson(req);
    const name = cleanName(body.name);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    if (!name || !email || password.length < 8) {
      sendJson(res, 400, { error: "Vyplňte jméno, e-mail a heslo alespoň 8 znaků." });
      return;
    }
    if (store.users.some((user) => user.email === email)) {
      sendJson(res, 409, { error: "Účet s tímto e-mailem už existuje." });
      return;
    }
    const user = {
      id: `user-${Date.now().toString(36)}-${randomToken()}`,
      name,
      email,
      provider: "password",
      passwordHash: await hashPassword(password),
      admin: shouldBeAdmin(email),
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    const token = createSession(user);
    await savePersistentStore();
    setSessionCookie(res, token);
    sendJson(res, 200, { user: publicUser(user), store: publicStoreFor(user.name, user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    const password = String(body.password || "");
    const user = store.users.find((item) => item.email === email);
    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      sendJson(res, 401, { error: "E-mail nebo heslo nesedí." });
      return;
    }
    const token = createSession(user);
    await savePersistentStore();
    setSessionCookie(res, token);
    sendJson(res, 200, { user: publicUser(user), store: publicStoreFor(user.name, user) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieValue(req, "dohoda_session");
    if (token) delete store.sessions[token];
    await savePersistentStore();
    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Auth endpoint not found" });
}

async function startGoogleAuth(req, res) {
  if (!googleClientId || !googleClientSecret) {
    res.writeHead(302, { Location: "/?auth=google-missing" });
    res.end();
    return;
  }
  const stateToken = randomToken();
  store.oauthStates[stateToken] = {
    createdAt: Date.now(),
  };
  await savePersistentStore();
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: `${baseUrl(req)}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state: stateToken,
    prompt: "select_account",
  });
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  res.end();
}

async function finishGoogleAuth(req, res, url) {
  const stateToken = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const savedState = store.oauthStates[stateToken];
  delete store.oauthStates[stateToken];
  if (!savedState || Date.now() - savedState.createdAt > 10 * 60 * 1000 || !code) {
    await savePersistentStore();
    res.writeHead(302, { Location: "/?auth=google-failed" });
    res.end();
    return;
  }
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: `${baseUrl(req)}/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokenData = await tokenResponse.json();
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!profileResponse.ok) throw new Error("Google profile request failed");
    const profile = await profileResponse.json();
    const email = cleanEmail(profile.email);
    if (!email) throw new Error("Google účet neposlal e-mail");
    let user = store.users.find((item) => item.email === email);
    if (!user) {
      user = {
        id: `user-${Date.now().toString(36)}-${randomToken()}`,
        name: cleanName(profile.name) || email.split("@")[0],
        email,
        provider: "google",
        googleSub: profile.sub,
        admin: shouldBeAdmin(email),
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
    } else {
      user.googleSub = user.googleSub || profile.sub;
      user.provider = user.provider === "password" ? "password+google" : "google";
    }
    const token = createSession(user);
    await savePersistentStore();
    setSessionCookie(res, token);
    res.writeHead(302, { Location: "/" });
    res.end();
  } catch (error) {
    console.warn("Google auth failed:", error.message);
    await savePersistentStore();
    res.writeHead(302, { Location: "/?auth=google-failed" });
    res.end();
  }
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
      if (raw.length > 75 * 1024 * 1024) req.destroy();
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
        ["main", JSON.stringify({ rooms: store.rooms, users: store.users, sessions: store.sessions, oauthStates: store.oauthStates })],
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
    store.users = Array.isArray(data.users) ? data.users : [];
    store.sessions = data.sessions && typeof data.sessions === "object" ? data.sessions : {};
    store.oauthStates = data.oauthStates && typeof data.oauthStates === "object" ? data.oauthStates : {};
  }
  normalizeStore();
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
    ["main", JSON.stringify({ rooms: store.rooms, users: store.users, sessions: store.sessions, oauthStates: store.oauthStates })],
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
  if (!Array.isArray(store.users)) store.users = [];
  if (!store.sessions || typeof store.sessions !== "object") store.sessions = {};
  if (!store.oauthStates || typeof store.oauthStates !== "object") store.oauthStates = {};
  store.rooms.forEach(ensureRoomDefaults);
  for (const [token, session] of Object.entries(store.sessions)) {
    if (!session?.userId || !session?.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) {
      delete store.sessions[token];
    }
  }
  for (const [token, oauthState] of Object.entries(store.oauthStates)) {
    if (!oauthState?.createdAt || Date.now() - oauthState.createdAt > 10 * 60 * 1000) {
      delete store.oauthStates[token];
    }
  }
}

function ensureRoomDefaults(room) {
  room.mediationSettings = sanitizeMediationSettings(room.mediationSettings || {});
  if (!room.privateConversations) room.privateConversations = {};
  removeStaleActivityNotices(room);
  repairLegacyMediatedMessages(room);
  if (!room.inviteToken) room.inviteToken = randomToken();
  if (typeof room.locked !== "boolean") room.locked = false;
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
  if (!Array.isArray(room.sources)) room.sources = [];
  if (typeof room.protocol !== "string") room.protocol = "";
  ensureRelationshipProfile(room);
  ensureParticipantProfiles(room);
}

function repairLegacyMediatedMessages(room) {
  for (const [recipient, conversation] of Object.entries(room.privateConversations || {})) {
    if (!Array.isArray(conversation)) continue;
    for (const message of conversation) {
      if (!message?.mediatedFrom || message.decision !== "Bezpečné shrnutí pro tohoto účastníka") continue;
      const sourceConversation = room.privateConversations[message.mediatedFrom] || [];
      const source = sourceConversation.find((entry) => (
        entry?.turnId === message.turnId && !entry.ai && entry.author === message.mediatedFrom
      ));
      if (source?.text) {
        message.text = fallbackRecipientBridgeReply(room, source.text, message.mediatedFrom, recipient);
      }
      message.decision = "";
    }
  }
}

function ensureRelationshipProfile(room) {
  if (!room.relationshipProfile || typeof room.relationshipProfile !== "object") {
    room.relationshipProfile = { relationships: [] };
  }
  if (!Array.isArray(room.relationshipProfile.relationships)) {
    room.relationshipProfile.relationships = [];
  }
  const participants = Array.isArray(room.participants) ? room.participants.filter(Boolean) : [];
  for (let first = 0; first < participants.length; first += 1) {
    for (let second = first + 1; second < participants.length; second += 1) {
      const pair = normalizedRelationshipPair(participants[first], participants[second]);
      const exists = room.relationshipProfile.relationships.some((item) => (
        normalizedRelationshipPair(item.participantA, item.participantB).key === pair.key
      ));
      if (!exists) {
        room.relationshipProfile.relationships.push({
          participantA: pair.participantA,
          participantB: pair.participantB,
          relationshipType: String(room.type || "zatím nejasný vztah"),
          dynamic: "Pracovní profil se teprve tvoří z prvních konkrétních vstupů.",
          sharedGoal: String(room.goal || "najít přijatelnou dohodu"),
          missingInformation: "Jak účastníci vztah popisují a co od něj potřebují.",
          confidence: "low",
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }
}

function ensureParticipantProfiles(room) {
  if (!room.participantProfiles || typeof room.participantProfiles !== "object") {
    room.participantProfiles = {};
  }
  const participants = Array.isArray(room.participants) ? room.participants.filter(Boolean) : [];
  for (const name of participants) {
    if (!room.participantProfiles[name] || typeof room.participantProfiles[name] !== "object") {
      room.participantProfiles[name] = {
        statedGoal: "",
        needs: [],
        boundaries: [],
        communicationStyle: "zatím nejasné",
        openness: "zatím nejasná",
        blockers: [],
        usefulNextQuestion: "Co by pro vás znamenal férový posun?",
        confidence: "low",
        updatedAt: new Date().toISOString(),
      };
    }
    for (const key of ["needs", "boundaries", "blockers"]) {
      if (!Array.isArray(room.participantProfiles[name][key])) room.participantProfiles[name][key] = [];
    }
  }
}

function normalizedRelationshipPair(participantA, participantB) {
  const names = [cleanName(participantA), cleanName(participantB)].sort((a, b) => a.localeCompare(b, "cs"));
  return { participantA: names[0], participantB: names[1], key: names.join("::") };
}

function applyRelationshipSignals(room, signals) {
  ensureRelationshipProfile(room);
  const participants = new Set(room.participants || []);
  for (const signal of Array.isArray(signals) ? signals : []) {
    const pair = normalizedRelationshipPair(signal?.participantA, signal?.participantB);
    if (!pair.participantA || !pair.participantB || pair.participantA === pair.participantB) continue;
    if (!participants.has(pair.participantA) || !participants.has(pair.participantB)) continue;
    const relationship = room.relationshipProfile.relationships.find((item) => (
      normalizedRelationshipPair(item.participantA, item.participantB).key === pair.key
    ));
    const update = {
      participantA: pair.participantA,
      participantB: pair.participantB,
      relationshipType: String(signal.relationshipType || relationship?.relationshipType || "zatím nejasný vztah").trim(),
      dynamic: String(signal.dynamic || relationship?.dynamic || "").trim(),
      sharedGoal: String(signal.sharedGoal || relationship?.sharedGoal || room.goal || "").trim(),
      missingInformation: String(signal.missingInformation || relationship?.missingInformation || "").trim(),
      confidence: ["low", "medium", "high"].includes(signal.confidence) ? signal.confidence : "low",
      updatedAt: new Date().toISOString(),
    };
    if (relationship) Object.assign(relationship, update);
    else room.relationshipProfile.relationships.push(update);
  }
}

function applyParticipantSignals(room, signals) {
  ensureParticipantProfiles(room);
  const participants = new Set(room.participants || []);
  for (const signal of Array.isArray(signals) ? signals : []) {
    const participant = cleanName(signal?.participant);
    if (!participant || !participants.has(participant)) continue;
    const previous = room.participantProfiles[participant] || {};
    room.participantProfiles[participant] = {
      statedGoal: String(signal.statedGoal || previous.statedGoal || "").trim(),
      needs: mergeShortLists(previous.needs, signal.needs, 6),
      boundaries: mergeShortLists(previous.boundaries, signal.boundaries, 6),
      communicationStyle: String(signal.communicationStyle || previous.communicationStyle || "zatím nejasné").trim(),
      openness: String(signal.openness || previous.openness || "zatím nejasná").trim(),
      blockers: mergeShortLists(previous.blockers, signal.blockers, 6),
      usefulNextQuestion: String(signal.usefulNextQuestion || previous.usefulNextQuestion || "Co by pro vás znamenal férový posun?").trim(),
      confidence: ["low", "medium", "high"].includes(signal.confidence) ? signal.confidence : previous.confidence || "low",
      updatedAt: new Date().toISOString(),
    };
  }
}

function mergeShortLists(previous, next, limit = 6) {
  return unique([
    ...(Array.isArray(previous) ? previous : []),
    ...(Array.isArray(next) ? next : []),
  ].map((item) => String(item || "").trim()).filter(Boolean)).slice(-limit);
}

function removeStaleActivityNotices(room) {
  for (const [participant, conversation] of Object.entries(room.privateConversations || {})) {
    if (!Array.isArray(conversation)) continue;
    room.privateConversations[participant] = conversation.filter((message) => {
      const text = String(message?.text || "");
      return !(
        message?.activity
        && message?.decision === "Neutrální informace o probíhající mediaci"
        && text.includes("Připravuji bezpečnou verzi podstaty")
      );
    });
  }
}

function publicStoreFor(viewer = "", user = null) {
  normalizeStore();
  const visibleRooms = user?.admin
    ? store.rooms
    : store.rooms.filter((room) => canViewRoom(user, room, viewer));
  return {
    rooms: visibleRooms.map((room) => publicRoomFor(room, viewer)),
  };
}

function publicRoomFor(room, viewer = "") {
  ensureRoomDefaults(room);
  syncAgreementIndex(room);
  const safeRoom = { ...room };
  const name = String(viewer || "").trim();
  const privateConversations = {};
  if (name) {
    privateConversations[name] = room.privateConversations?.[name] || [];
  } else {
    safeRoom.inviteToken = "";
  }
  safeRoom.privateConversations = privateConversations;
  safeRoom.sources = room.sources.map(publicSource);
  safeRoom.progressBasis = agreementIndexCriteria(room);
  safeRoom.sourceBytes = roomSourceBytes(room);
  safeRoom.sourceLimit = maxRoomSourceBytes;
  safeRoom.protocol = generateProtocol(room);
  delete safeRoom.relationshipProfile;
  delete safeRoom.participantProfiles;
  return safeRoom;
}

function publicInviteRoom(room) {
  ensureRoomDefaults(room);
  syncAgreementIndex(room);
  return {
    id: room.id,
    title: room.title,
    goal: room.goal || "",
    type: room.type || "",
    status: room.status || "",
    stage: room.stage || "",
    progress: room.progress || 0,
    progressBasis: agreementIndexCriteria(room),
    participants: room.participants || [],
    archived: Boolean(room.archived),
    locked: Boolean(room.locked),
    map: { shared: [], open: [], needs: [] },
    messages: [],
    privateConversations: {},
    sources: [],
    agreement: "",
  };
}

function publicSource(source) {
  return {
    id: source.id,
    kind: source.kind,
    title: source.title,
    url: source.url || "",
    mime: source.mime || "",
    size: source.size || 0,
    fileName: source.fileName || "",
    status: source.status || "Uloženo",
    note: source.note || "",
    excerpt: source.extractedText ? source.extractedText.slice(0, 600) : "",
    analysis: source.analysis || "",
    addedBy: source.addedBy || "",
    addedAt: source.addedAt || "",
  };
}

function roomSourceBytes(room) {
  return (room.sources || []).reduce((sum, source) => sum + Number(source.size || 0), 0);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    admin: Boolean(user.admin),
    provider: user.provider || "password",
    guest: Boolean(user.guest),
  };
}

function validRoomInvite(room, invite) {
  return Boolean(room?.inviteToken && invite && room.inviteToken === invite);
}

function canViewRoom(user, room, viewer = "") {
  if (!user) return false;
  if (user.guest) {
    const name = String(viewer || user.name || "").trim();
    return Boolean(room.id === user.roomId && name === user.name && room.participants?.includes(name));
  }
  if (user.admin) return true;
  if (room.ownerId && room.ownerId === user.id) return true;
  const name = String(viewer || user.name || "").trim();
  return Boolean(name && room.participants?.includes(name));
}

function roomActorName(user, room, body = {}) {
  const requested = cleanName(body.participant || body.author || body.name);
  if (user.guest) return user.name;
  if (!requested) return user.name;
  if (user.admin || requested === user.name || room.participants?.includes(requested)) return requested;
  return user.name;
}

function canManageRoom(user, room) {
  if (!user) return false;
  if (user.admin) return true;
  return Boolean(room.ownerId && room.ownerId === user.id);
}

function canDeleteSource(user, room, source) {
  if (!user) return false;
  if (user.admin) return true;
  if (source.addedById && source.addedById === user.id) return true;
  if (source.addedBy && source.addedBy === user.name) return true;
  return canManageRoom(user, room);
}

function createGuestUser(name, roomId) {
  const user = {
    id: `guest-${Date.now().toString(36)}-${randomToken()}`,
    name,
    email: `guest-${randomToken()}@dohoda.local`,
    provider: "guest",
    guest: true,
    roomId,
    admin: false,
    createdAt: new Date().toISOString(),
  };
  store.users.push(user);
  return user;
}

function joinRoom(room, body, user) {
  const invite = String(body.invite || "").trim();
  const joinName = cleanName(body.name || body.participant) || user?.name || "";
  if (!joinName) {
    const error = new Error("Zadejte jméno pro vstup do místnosti.");
    error.status = 400;
    throw error;
  }
  const alreadyParticipant = room.participants?.includes(joinName);
  const validInvite = validRoomInvite(room, invite);
  if (room.inviteToken && !validInvite && !alreadyParticipant && !room.participants?.includes(user?.name) && !user?.admin) {
    const error = new Error("Pozvánka do této místnosti není platná.");
    error.status = 403;
    throw error;
  }
  if (room.locked && !alreadyParticipant) {
    const error = new Error("Místnost je uzamčená pro nové účastníky.");
    error.status = 403;
    throw error;
  }
  room.participants = unique([...(room.participants || []), joinName]);
  if (!alreadyParticipant) {
    if (!room.privateConversations) room.privateConversations = {};
    room.privateConversations[joinName] = [
      {
        author: "AI mediátor",
        text: newcomerBriefing(room, joinName),
        ai: true,
        activity: true,
        decision: "Uvítací přehled a výzva pro nového účastníka",
      },
    ];
    addAi(room, `${joinName} se připojil/a do místnosti.`);
    addDiary(room, "AI mediátor", `${joinName} vstoupil/a do místnosti a má vlastní soukromý prostor s mediátorem.`, "join");
  }
  return joinName;
}

function shouldBeAdmin(email) {
  return store.users.length === 0 || adminEmails.includes(cleanEmail(email));
}

function sanitizeMediationSettings(settings) {
  const style = ["warm", "calm", "clear", "direct", "authentic"].includes(settings.style)
    ? settings.style
    : defaultMediationSettings.style;
  const variants = Math.max(0, Math.min(3, Number(settings.variants ?? defaultMediationSettings.variants)));
  return {
    style,
    autoBridge: true,
    adaptToRecipient: true,
    variants,
    initiatorMode: false,
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
  room.protocol = generateProtocol(room);
}

function randomToken() {
  return crypto.randomBytes(9).toString("base64url");
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt);
  return `scrypt:${salt}:${key}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const key = await scrypt(password, parts[1]);
  const saved = Buffer.from(parts[2], "base64url");
  const candidate = Buffer.from(key, "base64url");
  return saved.length === candidate.length && crypto.timingSafeEqual(saved, candidate);
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 32, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString("base64url"));
    });
  });
}

function createSession(user) {
  const token = randomToken() + randomToken();
  store.sessions[token] = {
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  return token;
}

function getCurrentUser(req) {
  normalizeStore();
  const token = cookieValue(req, "dohoda_session");
  const session = token ? store.sessions[token] : null;
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    delete store.sessions[token];
    return null;
  }
  return store.users.find((user) => user.id === session.userId) || null;
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
  const prefix = `${name}=`;
  const match = cookies.find((item) => item.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : "";
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `dohoda_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${secure}`,
  );
}

function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL) ? "; Secure" : "";
  res.setHeader("Set-Cookie", `dohoda_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function baseUrl(req) {
  if (publicUrl) return publicUrl.startsWith("http") ? publicUrl : `https://${publicUrl}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  const hostName = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${hostName}`;
}

function sanitizeSource(body) {
  const kind = ["text", "link", "file", "audio", "image"].includes(body.kind) ? body.kind : "file";
  const extractedText = String(body.extractedText || "").slice(0, 180_000);
  return {
    id: `source-${Date.now().toString(36)}-${randomToken()}`,
    kind,
    title: String(body.title || body.fileName || body.url || "Nový zdroj").trim().slice(0, 140),
    url: String(body.url || "").trim().slice(0, 2000),
    mime: String(body.mime || "").trim().slice(0, 160),
    size: Math.max(0, Number(body.size || 0)),
    fileName: String(body.fileName || "").trim().slice(0, 220),
    dataUrl: String(body.dataUrl || ""),
    extractedText,
    status: extractedText ? "Přečteno" : "Uloženo",
    note: String(body.note || "").trim().slice(0, 400),
    addedBy: String(body.author || "").trim().slice(0, 120),
    addedAt: new Date().toISOString(),
    analysis: "",
  };
}

async function transcribeAudioSource(source) {
  return transcribeAudioDataUrl(source.dataUrl, source.fileName || "audio.webm");
}

async function transcribeAudioDataUrl(dataUrl, fileName = "audio.webm") {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Audio nemá platný obsah.");
  const mime = match[1] || "audio/webm";
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > maxSourceBytes) throw new Error("Audio je větší než 50 MB.");
  const form = new FormData();
  const blob = new Blob([buffer], { type: mime });
  form.append("file", blob, fileName);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "cs");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiApiKey}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Audio transcription failed: ${response.status}`);
  const data = await response.json();
  return String(data.text || "").slice(0, 180_000);
}

async function analyzeSource(room, source, timeoutMs = 16000) {
  if (source.kind === "link" && source.url && !source.extractedText) {
    const linkTimeout = Math.min(8000, Math.max(1500, Math.floor(timeoutMs / 2)));
    source.extractedText = await fetchReadableLinkText(source.url, linkTimeout);
    if (source.extractedText) source.status = "Přečteno";
  }
  if (!source.extractedText && source.dataUrl && source.kind !== "image" && source.kind !== "audio") {
    source.extractedText = extractReadableDataUrlText(source);
    if (source.extractedText) source.status = "Přečteno";
  }
  const sourceText = source.extractedText || source.url || source.note || source.title;
  if (source.kind === "image" && source.dataUrl && openaiApiKey) return analyzeImageSource(room, source, Math.min(timeoutMs, 9000));
  if (!sourceText) return fallbackSourceAnalysis(source);
  if (!openaiApiKey) return fallbackSourceAnalysis(source);
  try {
    const payload = {
      model: openaiModel,
      input: [
        {
          role: "system",
          content:
            "Jsi AI mediátor v aplikaci Dohoda. Analyzuj zdroj stručně, neutrálně a prakticky. Neřeš právní závěry. Vrať přesně tyto sekce v češtině: Krátké shrnutí: 2 až 3 věty. Co z toho plyne pro dohodu: 1 až 2 věty. Otázky pro mediaci: 3 konkrétní otázky. Další krok: 1 krátká věta.",
        },
        {
          role: "user",
          content: [
            `Téma místnosti: ${room.title}`,
            `Cíl: ${room.goal || ""}`,
            `Zdroj: ${source.title}`,
            `Typ: ${source.kind} ${source.mime || ""}`,
            "",
            String(sourceText).slice(0, 40_000),
          ].join("\n"),
        },
      ],
      max_output_tokens: 520,
    };
    const response = await openaiResponsesRequest(payload, timeoutMs);
    return extractResponseText(response) || fallbackSourceAnalysis(source);
  } catch (error) {
    console.warn("OpenAI source analysis fallback:", error.message);
    return fallbackSourceAnalysis(source);
  }
}

async function analyzeImageSource(room, source, timeoutMs = 18000) {
  try {
    const payload = {
      model: openaiModel,
      input: [
        {
          role: "system",
          content:
            "Jsi AI mediátor v aplikaci Dohoda. Popiš obrázek jako podklad ke konfliktu neutrálně: fakta z obrázku, možné potřeby/obavy, otázky k ověření a co může pomoci dohodě. Česky, stručně.",
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: `Téma místnosti: ${room.title}\nZdroj: ${source.title}` },
            { type: "input_image", image_url: source.dataUrl },
          ],
        },
      ],
      max_output_tokens: 520,
    };
    const response = await openaiResponsesRequest(payload, timeoutMs);
    return extractResponseText(response) || fallbackSourceAnalysis(source);
  } catch (error) {
    console.warn("OpenAI image analysis fallback:", error.message);
    return fallbackSourceAnalysis(source);
  }
}

async function fetchReadableLinkText(url, timeoutMs = 8000) {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    const response = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "DohodaMediator/0.1",
        Accept: "text/html,text/plain,application/json;q=0.8,*/*;q=0.2",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    const raw = (await response.text()).slice(0, 220_000);
    if (contentType.includes("html")) return htmlToText(raw).slice(0, 180_000);
    return raw.replace(/\s+/g, " ").trim().slice(0, 180_000);
  } catch {
    return "";
  }
}

function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackSourceAnalysis(source) {
  const preview = (source.extractedText || source.url || source.title || "").replace(/\s+/g, " ").trim().slice(0, 260);
  const readable = Boolean(preview && preview !== source.title);
  return [
    `Krátké shrnutí: ${readable ? preview : "Zdroj je uložený, ale zatím z něj nemám dost čitelného obsahu. Pokud jde o PDF, sken nebo kancelářský dokument, pomůže vložit krátký výňatek textu nebo použít ruční analýzu po doplnění obsahu."}`,
    "Co z toho plyne pro dohodu: Zdroj může sloužit jako podklad k ověření faktů a k oddělení domněnek od potřeb jednotlivých stran.",
    "Otázky pro mediaci:",
    "- Která tvrzení ze zdroje jsou pro dohodu opravdu podstatná?",
    "- Co z toho je fakt, co interpretace a co potřeba některé strany?",
    "- Jaký jeden další krok by tento zdroj mohl zpřesnit?",
    "Další krok: Doplňte jednu větu, proč je tento zdroj pro dohodu důležitý.",
  ].join("\n");
}

function extractReadableDataUrlText(source) {
  try {
    const match = String(source.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return "";
    const mime = match[1] || source.mime || "";
    const buffer = Buffer.from(match[2], "base64");
    if (mime.startsWith("text/") || /\.(txt|md|csv|json|html|xml|rtf)$/i.test(source.fileName || "")) {
      return buffer.toString("utf8").replace(/\s+/g, " ").trim().slice(0, 180_000);
    }
    if (
      mime.includes("wordprocessingml.document") ||
      mime.includes("vnd.openxmlformats-officedocument.wordprocessingml.document") ||
      /\.docx$/i.test(source.fileName || "")
    ) {
      return extractDocxText(buffer).slice(0, 180_000);
    }
    if (mime.includes("pdf") || /\.pdf$/i.test(source.fileName || "")) {
      return roughPdfText(buffer).slice(0, 180_000);
    }
  } catch (error) {
    console.warn("Source text extraction failed:", error.message);
  }
  return "";
}

function extractDocxText(buffer) {
  const xmlParts = [
    readZipEntry(buffer, "word/document.xml"),
    ...listZipEntryNames(buffer)
      .filter((name) => /^word\/(header|footer)\d+\.xml$/i.test(name))
      .map((name) => readZipEntry(buffer, name)),
  ].filter(Boolean);
  return xmlParts.map(wordXmlToText).join("\n").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function listZipEntryNames(buffer) {
  const entries = zipEntries(buffer);
  return entries.map((entry) => entry.name);
}

function readZipEntry(buffer, wantedName) {
  const entry = zipEntries(buffer).find((item) => item.name === wantedName);
  if (!entry) return "";
  const localSignature = buffer.readUInt32LE(entry.localOffset);
  if (localSignature !== 0x04034b50) return "";
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26);
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28);
  const dataStart = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return compressed.toString("utf8");
  if (entry.method === 8) return zlib.inflateRawSync(compressed).toString("utf8");
  return "";
}

function zipEntries(buffer) {
  const endOffset = findEndOfCentralDirectory(buffer);
  if (endOffset < 0) return [];
  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = [];
  for (let index = 0; index < totalEntries && offset < buffer.length - 46; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 66_000);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function wordXmlToText(xml) {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function roughPdfText(buffer) {
  const raw = buffer.toString("latin1");
  const chunks = [];
  for (const match of raw.matchAll(/\(([^()]{3,500})\)\s*T[jJ]/g)) chunks.push(match[1]);
  if (chunks.length < 3) {
    for (const match of raw.matchAll(/[A-Za-zÁ-ž0-9][A-Za-zÁ-ž0-9\s.,;:!?()[\]\/\-]{20,}/g)) chunks.push(match[0]);
  }
  return chunks
    .map((text) => text.replace(/\\([()\\])/g, "$1").replace(/\\n|\\r|\\t/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function applySourceAnalysis(room, source) {
  const text = `${source.title} ${source.analysis || source.extractedText || source.url || ""}`;
  const summary = sourceAnalysisSummary(source.analysis || source.extractedText || "");
  addUnique(room.map.shared, `Zdroj „${source.title}“ byl přidán jako podklad pro ověření faktů.`);
  if (summary) addUnique(room.map.shared, summary);
  if (/term[ií]n|datum|kdy|lh[uů]ta/i.test(text)) addUnique(room.map.open, "Ze zdrojů ověřit termíny, závazky a časovou osu.");
  if (/potřeb|obav|hranice|důvěr|duver|odpověd/i.test(text)) addUnique(room.map.needs, "Ze zdrojů doplnit potřeby, obavy a hranice jednotlivých stran.");
  moveProgress(room, 4);
}

function addSourceAnalysisToChat(room, actorName, source) {
  const conversation = ensurePrivateConversation(room, actorName);
  const analysis = String(source.analysis || "").trim();
  const summary = sourceAnalysisSummary(analysis);
  conversation.push({
    author: "AI mediátor",
    text: [
      `Zdroj „${source.title}“ jsem přečetl a přidal do analýzy dohody.`,
      summary ? `\n${summary}` : "",
      "\nMůžete mi teď napsat, co je z toho pro vás nejdůležitější nebo co mám porovnat s pohledem druhé strany.",
    ].join(""),
    ai: true,
    activity: true,
    decision: "Shrnutí přidaného zdroje",
  });
}

function sourceAnalysisSummary(analysis) {
  const match = analysis.match(/Krátké shrnutí:\s*([\s\S]*?)(?:\nCo z toho plyne|\nOtázky pro mediaci|\nDalší krok|$)/i);
  const text = (match ? match[1] : analysis).replace(/\s+/g, " ").trim();
  return text ? `Krátké shrnutí: ${text.slice(0, 420)}` : "";
}

function generateProtocol(room) {
  ensureRoomDefaultsShallow(room);
  const date = new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Prague",
  }).format(new Date());
  const lines = [
    `Protokol místnosti: ${room.title || "Dohoda"}`,
    `Aktuální datum: ${date}`,
    `Cíl: ${room.goal || "Najít dohodu"}`,
    `Účastníci: ${(room.participants || []).join(", ") || "zatím neuvedeno"}`,
    "",
    "Průběžný zápis:",
  ];
  const diary = Array.isArray(room.diary) ? room.diary : [];
  if (!diary.length) lines.push("- Zatím bez událostí.");
  for (const item of diary) {
    const when = item.at ? new Date(item.at).toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "";
    lines.push(`- ${when ? `${when} · ` : ""}${item.author || "Záznam"}: ${protocolDiaryText(item)}`);
  }
  return lines.join("\n");
}

function protocolDiaryText(item) {
  if (item?.type === "private-topic") {
    return "Účastník komunikoval s mediátorem. Do protokolu se ukládá jen procesní záznam, ne původní soukromá zpráva.";
  }
  if (item?.type === "mediator-response") {
    return "Mediátor odpověděl účastníkovi a ostatním stranám předal pouze bezpečné shrnutí podstaty.";
  }
  return String(item?.text || "");
}

function ensureRoomDefaultsShallow(room) {
  if (!Array.isArray(room.diary)) room.diary = [];
  if (!Array.isArray(room.participants)) room.participants = [];
}

function ensurePrivateConversation(room, author) {
  if (!room.privateConversations) room.privateConversations = {};
  if (!room.privateConversations[author]) {
    room.privateConversations[author] = [
      {
        author: "AI mediátor",
        text:
          "Vítejte v místnosti. Začněme jednoduše: napište jednou větou, co by se podle vás mělo změnit, aby dohoda dávala smysl. Já z toho vytáhnu podstatu a navrhnu další krok.",
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

async function processPrivateMediationTurn(room, text, author) {
  const recipients = room.participants.filter((name) => name && name !== author);
  const fallback = fallbackPrivateMediationTurn(room, text, author);

  if (!openaiApiKey) return fallback;

  try {
    const turn = await openaiPrivateMediationTurn(room, text, author, recipients);
    const byRecipient = new Map(
      (turn.recipientMessages || [])
        .filter((item) => item && recipients.includes(cleanName(item.recipient)) && String(item.message || "").trim())
        .map((item) => [cleanName(item.recipient), sanitizeRecipientReframe(item.message, text, author)]),
    );
    return {
      authorReply: String(turn.authorReply || "").trim() || fallback.authorReply,
      recipientMessages: recipients.map((recipient) => ({
        recipient,
        message: byRecipient.get(recipient) || fallbackRecipientBridgeReply(room, text, author, recipient),
      })),
      relationshipSignals: Array.isArray(turn.relationshipSignals) ? turn.relationshipSignals : [],
      participantSignals: Array.isArray(turn.participantSignals) && turn.participantSignals.length
        ? turn.participantSignals
        : fallback.participantSignals,
    };
  } catch (error) {
    console.warn("OpenAI mediation turn fallback:", error.message);
    return fallback;
  }
}

function sanitizeRecipientReframe(candidate, originalText, author) {
  const original = String(originalText || "").trim();
  let message = String(candidate || "").trim();
  if (!message) return original;
  message = message.replace(new RegExp(`^${escapeRegExp(author)}\\s*:\\s*`, "iu"), "").trim();
  const processCommentary = /(?:ai\s+medi[aá]tor|p(?:ř|r)episuji|p(?:ř|r)eformulov|shrnuji|bezpe(?:č|c)n(?:á|e|ou)\s+(?:verze|podstata)|p(?:ů|u)vodn(?:í|i)\s+(?:text|zpr[aá]va)|autor\s+(?:pr[aá]v(?:ě|e)\s+)?komunikuje)/iu;
  if (processCommentary.test(message)) return fallbackRecipientBridgeReply(null, original, author, "");

  const sourceTokens = semanticTokens(original);
  const messageTokens = new Set(semanticTokens(message));
  if (sourceTokens.length) {
    const overlap = sourceTokens.filter((token) => messageTokens.has(token)).length;
    const required = sourceTokens.length <= 4 ? 1 : Math.max(2, Math.ceil(sourceTokens.length * 0.25));
    if (overlap < required) return fallbackRecipientBridgeReply(null, original, author, "");
  }
  return message;
}

function semanticTokens(value) {
  const stopWords = new Set(["aby", "ale", "ani", "bych", "bylo", "co", "do", "ho", "je", "jsem", "jsi", "mi", "na", "ne", "od", "se", "si", "tak", "ten", "to", "ve", "ze"]);
  return unique(String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) || [])
    .filter((token) => !stopWords.has(token));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fallbackPrivateMediationTurn(room, text, author) {
  const recipients = room.participants.filter((name) => name && name !== author);
  return {
    authorReply: fallbackPrivateMediatorReply(room, text, author),
    recipientMessages: recipients.map((recipient) => ({
      recipient,
      message: fallbackRecipientBridgeReply(room, text, author, recipient),
    })),
    relationshipSignals: [],
    participantSignals: [inferParticipantSignalFromText(room, text, author)],
  };
}

function inferParticipantSignalFromText(room, text, author) {
  const lower = String(text || "").toLowerCase();
  const needs = [];
  const boundaries = [];
  const blockers = [];
  if (/nev[ií]m|nechap|necháp|zmatek|jasn/i.test(lower)) needs.push("srozumitelný kontext a jasnější orientace");
  if (/vad[ií]|štve|stve|bol[ií]|zra[nň]/i.test(lower)) needs.push("aby byla pojmenovaná věc, která vadí nebo zraňuje");
  if (/nechci|hranice|dost|sta[cč]/i.test(lower)) boundaries.push("jasnější hranice a respekt k nim");
  if (/neochot|ignor|nereag|ml[cč]/i.test(lower)) blockers.push("pocit nízké ochoty nebo nedostatečné reakce druhé strany");
  if (!needs.length && !boundaries.length && !blockers.length && !isGreetingMessage(text)) {
    needs.push("konkrétněji pojmenovat, co má být jinak");
  }
  return {
    participant: author,
    statedGoal: isGreetingMessage(text) ? "" : String(text || "").trim().slice(0, 180),
    needs,
    boundaries,
    communicationStyle: isGreetingMessage(text) ? "navazuje kontakt" : "stručný, zatím potřebuje zpřesnění",
    openness: "otevřenost zatím nelze spolehlivě určit",
    blockers,
    usefulNextQuestion: "Co je jeden konkrétní příklad, podle kterého poznáme, co se má změnit?",
    confidence: "low",
  };
}

function replaceAuthorMediatorReply(conversation, turnId, text) {
  const reply = conversation.find((message) => message.turnId === turnId && message.ai);
  if (!reply) return;
  reply.text = String(text || reply.text).trim() || reply.text;
  reply.decision = "Soukromá odpověď mediátora";
}

function applyMediatedRecipientUpdates(room, author, recipientMessages, turnId = "") {
  for (const item of recipientMessages || []) {
    const recipient = cleanName(item.recipient);
    if (!recipient || recipient === author || !room.participants.includes(recipient)) continue;
    const message = String(item.message || "").trim();
    if (!message) continue;
    const conversation = ensurePrivateConversation(room, recipient);
    const existing = turnId
      ? conversation.find((entry) => entry.turnId === turnId && entry.mediatedFrom === author)
      : null;
    const update = {
      author: "AI mediátor",
      text: message,
      ai: true,
      mediatedFrom: author,
      turnId,
      decision: "",
    };
    if (existing) Object.assign(existing, update);
    else conversation.push(update);
  }
}

async function distributeMediatedUpdate(room, text, author) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const recipients = room.participants.filter((name) => name && name !== author);
  if (!recipients.length) return;

  await Promise.all(recipients.map(async (recipient) => {
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
  }));
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
  if (isGreetingMessage(clean)) return "pozdrav a navázání kontaktu";
  if (isIncompleteDisclosure(clean)) return "účastník chce nejdřív pojmenovat, co mu vadí";
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
  return "nový soukromý vstup k tématu dohody";
}

async function openaiMediatorReply(room, text, author) {
  const response = await openaiResponsesRequest({
    model: openaiModel,
    input: [
      {
        role: "system",
        content: [
          "Jsi Dohoda, nezaujatý AI mediátor v konfliktu. Nejsi soudce a neurčuješ vítěze.",
          "Pomáháš stranám rychle najít společný bod, oddělit fakta od interpretací, pojmenovat potřeby a posunout se o jeden konkrétní krok.",
          "Odpovídej česky, stručně, živě, nadějně a bez chladného korporátního tónu.",
          "Když je zpráva ostrá, zraněná nebo chaotická, přelož ji pro ostatní strany do srozumitelnější a méně zraňující řeči. Nepřepisuj význam tak, aby se autor ztratil.",
          "Když je zapnutý automatický překlad mezi stranami, tvoje odpověď má být hlavně most: bezpečné jádro sdělení, napojení na zájmy druhé strany a jeden další krok.",
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
    temperature: 0.62,
    max_output_tokens: 260,
  }, 8000);

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
    .slice(-8)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const recipients = room.participants.filter((name) => name !== author).join(", ") || "ostatní strany";
  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Typ konfliktu: ${room.type}`,
    `Účastníci: ${room.participants.join(", ")}`,
    `Styl mediace: ${settings.style}`,
    `Iniciátor režim: ${settings.initiatorMode ? "ano" : "ne"}`,
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
      ? "Odpověz jako mediátor pro ostatní strany. Max 80 slov. Struktura: bezpečné jádro, spojka mezi stranami, jeden další krok. Buď svižný a lidský."
      : "Odpověz jako mediátor do komunikace mezi stranami. Max 80 slov. Buď konkrétní, užitečný a veď k dalšímu kroku.",
  ].join("\n");
}

async function openaiPrivateMediatorReply(room, text, author) {
  const response = await openaiResponsesRequest({
    model: openaiModel,
    input: [
      {
        role: "system",
        content: [
          "Jsi soukromý AI mediátor v aplikaci Dohoda. Mluvíš jen s jedním účastníkem.",
          "Tvým cílem je rychle pochopit podstatu, najít společný bod s druhou stranou a udělat další mediační krok.",
          "Odpovídej česky, empaticky, živě, velmi stručně a povzbudivě. Nezněj stroze, terapeuticky ani sportovně-direktivně.",
          "Varianty formulace dávej přesně podle nastavení místnosti. Když jsou zapnuté, napiš je na konec jako samostatný blok s nadpisem 'Návrhy formulace:' a očísluj je.",
          "V každé odpovědi rozlišuj dvě věci: co je soukromá podpora pro tohoto účastníka a co je podstata, kterou lze bezpečně předat ostatním stranám.",
          "Vždy výslovně pojmenuj mediační rozhodnutí: co zůstává soukromé, co lze předat jako shrnutí a co zatím nepředávat.",
          "Drž fázi mediace, ale nebuď pomalý. Pokud vidíš jasné napojení mezi stranami, pojmenuj ho hned.",
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
    temperature: 0.62,
    max_output_tokens: 260,
  }, 8500);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI private request failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI private response did not contain text");
  return output.trim();
}

async function openaiPrivateMediationTurn(room, text, author, recipients) {
  const response = await openaiResponsesRequest({
    model: openaiModel,
    input: [
      {
        role: "system",
        content: [
          "Jsi Dohoda, nezaujatý AI mediátor. Vedeš soukromý dialog s jedním účastníkem a současně bezpečně propojuješ všechny strany.",
          "Reaguj na každou zprávu bez výjimky, včetně pozdravu, jednoslovné odpovědi nebo neurčité poznámky. Nikdy nenechávej účastníka bez přímé reakce.",
          "Na pozdrav odpověz přirozeně a krátce. U obsahově prázdné zprávy nic neinterpretuj; lehce účastníka vyzvi k první konkrétní větě.",
          "Nejdřív přímo reaguj na otázku nebo sdělení autora. Otázku nikdy neobcházej procesní frází.",
          "Soukromá odpověď má být lidská, konkrétní, stručná a akční. Aktivně účastníka vtahuj do rozhovoru, ale nezatěžuj ho sérií otázek.",
          "Mediátor není pasivní zapisovatel. Když se rozhovor nehýbe, nabídni nejmenší bezpečný krok: jednu větu, jednu volbu, jednu otázku nebo malý test dohody.",
          "Nejdřív rafinovaně a přirozeně zachyť problém: kdo je ve vztahu, co se děje, co koho bolí nebo brzdí, co každý potřebuje a jaké řešení by mohlo být férové.",
          "Sestavuj interní pracovní profily účastníků: jejich cíle, potřeby, hranice, komunikační styl, ochotu ke kompromisu, blokery a otázku, která je může posunout. Pracuj s tím jako s hypotézou, ne jako s faktem.",
          "Hledej ospravedlnitelné a férové kompromisy pro všechny strany. Kde to dává smysl, přemýšlej jako vyjednavač: co je výměna, ústupek, protihodnota, ověřitelný závazek a kontrolní bod.",
          "Pokud není jasné, co účastník považuje za problém, čeho chce dosáhnout nebo co od ostatních potřebuje, polož právě jednu konkrétní doplňující otázku.",
          "Pokud je záměr jasný, neptej se znovu na totéž. Navrhni další krok a zakonči jednoduchou výzvou, na kterou lze snadno odpovědět.",
          "Automatické přerámování je již schválené nastavením místnosti. Nikdy se autora neptej, zda smíš zprávu přepsat nebo předat, a neoznamuj mu, že ji právě předáváš.",
          "Pro každého dalšího účastníka napiš obsahově věrnou reformulaci v první osobě, jako by ji stále říkal původní autor. Zachovej konkrétní fakta, osoby, požadavky, nejistotu, emoci i intenzitu sdělení.",
          "Odstraň jen urážky, nálepky a zbytečně útočnou formu. Nenahrazuj konkrétní obsah obecnými potřebami, nevymýšlej motivy, společné cíle, pravidla ani návrhy, které autor neuvedl.",
          "Zpráva pro příjemce nesmí obsahovat úvod, komentář ani vysvětlení mediátora. Nikdy nepiš, že něco přepisuješ, shrnuješ, filtruješ, bezpečně předáváš nebo že autor právě komunikuje s mediátorem.",
          "Pokud je původní sdělení neurčité, ponech neurčitost a nic nedoplňuj. Pokud je to jen pozdrav, příjemci předej jen přirozený pozdrav.",
          "Pokud autor výslovně žádá, aby konkrétní věc zůstala soukromá, tuto věc příjemcům neposílej.",
          "Nikdy nevydávej soukromé informace jednoho příjemce jinému. Kontext příjemce používej jen pro přizpůsobení tónu.",
          "Z prvních indicií průběžně sestavuj pracovní profil vztahů. Rozlišuj fakta od hypotéz, nepřeháněj jistotu a u každé dvojice uveď jednu nejdůležitější chybějící informaci.",
          "Odpovídej česky. Nevysvětluj svůj interní postup.",
          mediationPlaybook,
          styleInstruction(room),
        ].join(" "),
      },
      {
        role: "user",
        content: buildPrivateMediationTurnContext(room, text, author, recipients),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "dohoda_mediation_turn",
        strict: true,
        schema: {
          type: "object",
          properties: {
            authorReply: {
              type: "string",
              description: "Přímá soukromá odpověď autorovi, která skutečně reaguje na jeho otázku nebo sdělení.",
            },
            recipientMessages: {
              type: "array",
              description: "Jedna významově věrná reformulace v první osobě pro každého dalšího účastníka, bez komentáře mediátora.",
              items: {
                type: "object",
                properties: {
                  recipient: { type: "string" },
                  message: { type: "string" },
                },
                required: ["recipient", "message"],
                additionalProperties: false,
              },
            },
            participantSignals: {
              type: "array",
              description: "Aktualizované pracovní hypotézy o jednotlivých účastnících. Nejsou zobrazovány účastníkům jako fakta.",
              items: {
                type: "object",
                properties: {
                  participant: { type: "string" },
                  statedGoal: { type: "string" },
                  needs: {
                    type: "array",
                    items: { type: "string" },
                  },
                  boundaries: {
                    type: "array",
                    items: { type: "string" },
                  },
                  communicationStyle: { type: "string" },
                  openness: { type: "string" },
                  blockers: {
                    type: "array",
                    items: { type: "string" },
                  },
                  usefulNextQuestion: { type: "string" },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["participant", "statedGoal", "needs", "boundaries", "communicationStyle", "openness", "blockers", "usefulNextQuestion", "confidence"],
                additionalProperties: false,
              },
            },
            relationshipSignals: {
              type: "array",
              description: "Aktualizované pracovní hypotézy o vztazích mezi účastníky. Nejsou zobrazovány účastníkům jako fakta.",
              items: {
                type: "object",
                properties: {
                  participantA: { type: "string" },
                  participantB: { type: "string" },
                  relationshipType: { type: "string" },
                  dynamic: { type: "string" },
                  sharedGoal: { type: "string" },
                  missingInformation: { type: "string" },
                  confidence: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["participantA", "participantB", "relationshipType", "dynamic", "sharedGoal", "missingInformation", "confidence"],
                additionalProperties: false,
              },
            },
          },
          required: ["authorReply", "recipientMessages", "participantSignals", "relationshipSignals"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.55,
    max_output_tokens: Math.min(1200, 380 + recipients.length * 180),
  }, 3800);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI mediation turn failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI mediation turn did not contain text");
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("OpenAI mediation turn did not contain valid JSON");
  }
}

async function openaiRecipientBridgeReply(room, text, author, recipient) {
  const response = await openaiResponsesRequest({
    model: openaiModel,
    input: [
      {
        role: "system",
        content: [
          "Jsi Dohoda, AI mediátor, který bezpečně překládá soukromé sdělení jedné strany pro jinou stranu konfliktu.",
          "Cíl: adresát má vědět, o čem druhá strana komunikuje, ale nemá být zbytečně zasažen surovou formulací.",
          "Zachovej podstatu sdělení, potřebu a emoci autora. Pokud je to užitečné, uveď, že původní tón mohl být ostřejší nebo zraněný, ale neeskaluj.",
          "Nemluv jako korporátní filtr. Buď lidský, stručný, svižný a srozumitelný.",
          "Hledej společný bod a navrhni jeden konkrétní další krok. Neprodlužuj proces otázkami, pokud můžeš nabídnout bezpečný tah.",
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
    temperature: 0.62,
    max_output_tokens: 160,
  }, 4500);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI recipient bridge failed: ${response.status} ${detail.slice(0, 180)}`);
  }

  const data = await response.json();
  const output = extractResponseText(data);
  if (!output) throw new Error("OpenAI recipient bridge response did not contain text");
  return output.trim();
}

async function openaiResponsesRequest(payload, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrivateMediatorContext(room, text, author) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const privateHistory = ensurePrivateConversation(room, author)
    .slice(-6)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const publicMessages = room.messages
    .slice(-5)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const otherParticipants = room.participants.filter((name) => name !== author).join(", ") || "zatím nikdo další";

  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Aktuální účastník: ${author}`,
    `Ostatní účastníci: ${otherParticipants}`,
    `Styl mediace: ${settings.style}`,
    `Iniciátor režim: ${settings.initiatorMode ? "ano" : "ne"}`,
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
    `Odpověz soukromě a svižně, max ${settings.variants > 0 ? 125 : 90} slov. Použij oddíly: "Podstata", "Spojka", "Co předám", "Další tah". ${settings.initiatorMode ? "Jako Iniciátor přidej jednu krátkou otázku nebo mikrokrok, který zapojí ostatní." : ""} ${settings.variants > 0 ? `Na konec přidej blok "Návrhy formulace:" a přesně ${settings.variants} velmi krátké očíslované varianty vět.` : "Nepřidávej samostatné návrhy formulace."}`,
  ].join("\n");
}

function buildPrivateMediationTurnContext(room, text, author, recipients) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  ensureRelationshipProfile(room);
  ensureParticipantProfiles(room);
  const authorHistory = ensurePrivateConversation(room, author)
    .slice(-7)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  const recipientContexts = recipients.map((recipient) => {
    const history = ensurePrivateConversation(room, recipient)
      .slice(-4)
      .map((message) => `${message.author}: ${message.text}`)
      .join("\n");
    return [`Příjemce: ${recipient}`, history || "- bez předchozího vstupu"].join("\n");
  }).join("\n\n");
  const relationshipContext = room.relationshipProfile.relationships
    .map((relationship) => [
      `${relationship.participantA} + ${relationship.participantB}`,
      `typ: ${relationship.relationshipType}`,
      `dynamika: ${relationship.dynamic}`,
      `společný cíl: ${relationship.sharedGoal}`,
      `chybí zjistit: ${relationship.missingInformation}`,
      `jistota: ${relationship.confidence}`,
    ].join(" | "))
    .join("\n");
  const participantProfileContext = (room.participants || [])
    .map((participant) => {
      const profile = room.participantProfiles?.[participant] || {};
      return [
        `${participant}`,
        `cíl: ${profile.statedGoal || "zatím nejasný"}`,
        `potřeby: ${(profile.needs || []).join("; ") || "zatím nejasné"}`,
        `hranice: ${(profile.boundaries || []).join("; ") || "zatím nejasné"}`,
        `styl: ${profile.communicationStyle || "zatím nejasný"}`,
        `otevřenost: ${profile.openness || "zatím nejasná"}`,
        `blokery: ${(profile.blockers || []).join("; ") || "zatím nejasné"}`,
        `další otázka: ${profile.usefulNextQuestion || "zatím nejasná"}`,
        `jistota: ${profile.confidence || "low"}`,
      ].join(" | ");
    })
    .join("\n");

  return [
    `Místnost: ${room.title}`,
    `Cíl místnosti: ${room.goal}`,
    `Aktuální autor: ${author}`,
    `Další účastníci: ${recipients.join(", ") || "žádní"}`,
    `Fáze: ${room.stage || "Vstupní mapování"}`,
    `Styl: ${settings.style}`,
    `Iniciátor: ${settings.initiatorMode ? "zapnutý" : "vypnutý"}`,
    `Automatické předávání podstaty: ${settings.autoBridge ? "zapnuté" : "vypnuté"}`,
    `Přizpůsobení tónu příjemci: ${settings.adaptToRecipient ? "zapnuté" : "vypnuté"}`,
    `Počet návrhů formulace pro autora: ${settings.variants}`,
    "",
    "Mapa dohody:",
    `Body shody: ${room.map.shared.join("; ") || "zatím žádné"}`,
    `Otevřené body: ${room.map.open.join("; ") || "zatím žádné"}`,
    `Potřeby: ${room.map.needs.join("; ") || "zatím žádné"}`,
    "",
    "Pracovní profil vztahů (hypotézy, nikoli potvrzená fakta):",
    relationshipContext || "- zatím bez profilu",
    "",
    "Pracovní profily účastníků (hypotézy, nikoli potvrzená fakta):",
    participantProfileContext || "- zatím bez profilů",
    "",
    "Soukromý rozhovor s autorem:",
    authorHistory || "- bez historie",
    "",
    `NOVÁ ZPRÁVA AUTORA, NA KTEROU MUSÍŠ PŘÍMO ODPOVĚDĚT: ${text}`,
    "",
    "Soukromé kontexty jednotlivých příjemců. Použij je jen pro tón a nikdy jejich obsah neprozrazuj:",
    recipientContexts || "- nejsou další příjemci",
    "",
    [
      `Pole recipientMessages musí obsahovat přesně ${recipients.length} položek, jednu pro každé jméno z tohoto seznamu: ${recipients.join(", ") || "prázdný seznam"}.`,
      settings.autoBridge
        ? "Každá zpráva příjemci je pouze významově věrná reformulace nové zprávy autora v první osobě. Bez úvodu, vysvětlení, hodnocení, spojky nebo výzvy mediátora."
        : "Automatické předávání je vypnuté: pole recipientMessages ponech prázdné.",
      settings.adaptToRecipient
        ? "Tón lze jemně přizpůsobit příjemci, ale nesmí se změnit význam ani konkrétní obsah."
        : "Použij pro všechny příjemce stejnou věrnou formulaci.",
      `Soukromá odpověď autorovi má nejvýše ${settings.variants > 0 ? 150 : 105} slov.`,
      settings.variants > 0
        ? `Když autor řeší, jak něco sdělit, přidej na konec přesně ${settings.variants} krátké návrhy pod nadpisem „Návrhy formulace:“. Jinak návrhy nepřidávej násilně.`
        : "Nepřidávej návrhy formulace.",
      settings.initiatorMode
        ? "Jako Iniciátor zakonči odpověď jednoduchým mikrokrokem, který rychle zapojí ostatní."
        : "Zakonči jedním přirozeným dalším krokem nebo krátkou otázkou, která účastníka motivuje pokračovat.",
      "Jestli není z nové zprávy jasný problém nebo požadovaný cíl, polož pouze jednu doplňující otázku zaměřenou na nejdůležitější chybějící informaci.",
      "Nikdy autora nežádej o svolení k automatickému přerámování a příjemci nikdy nepopisuj, co mediátor se zprávou udělal.",
      `Pole participantSignals aktualizuj hlavně pro autora ${author}, případně i pro ostatní jen pokud máš oporu v jejich vlastním dosavadním kontextu. Uveď konkrétní potřeby, hranice, blokery a jednu otázku, která může člověka rozhýbat.`,
      `Pole relationshipSignals aktualizuj pro dvojice zahrnující autora a příjemce: ${recipients.map((recipient) => `${author} + ${recipient}`).join(", ") || "žádné"}. Zachovej nejistotu a nevydávej domněnky za fakta.`,
    ].join(" "),
  ].join("\n");
}

function buildRecipientBridgeContext(room, text, author, recipient) {
  const settings = sanitizeMediationSettings(room.mediationSettings || {});
  const recipientHistory = ensurePrivateConversation(room, recipient)
    .slice(-5)
    .map((message) => `${message.author}: ${message.text}`)
    .join("\n");
  return [
    `Místnost: ${room.title}`,
    `Cíl: ${room.goal}`,
    `Autor původního sdělení: ${author}`,
    `Adresát přerámování: ${recipient}`,
    `Styl mediace: ${settings.style}`,
    `Iniciátor režim: ${settings.initiatorMode ? "ano" : "ne"}`,
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
      "Max 70 slov.",
      "Začni stručně: kdo přinesl nový pohled a jaké je bezpečné jádro.",
      "Pak pojmenuj možnou spojku se zájmem adresáta.",
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
  const parts = [styleInstructions[settings.style] || styleInstructions.warm];
  if (settings.initiatorMode) {
    parts.push("Režim Iniciátor: aktivně zapojuj účastníky. Navrhuj krátké otázky, mikrokroky a malé bezpečné výzvy. Cílem je rychle získat odpověď, společný bod nebo ověřitelný další krok.");
  }
  return parts.join(" ");
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
  const otherSourceLabel = others.length === 1 ? others[0] : "ostatních stran";
  const settings = sanitizeMediationSettings(room.mediationSettings || {});

  if (isGreetingMessage(text)) {
    return [
      "Ahoj, jsem tady a reaguji na každou zprávu.",
      others.length
        ? "Začněme úplně jednoduše: co by podle vás měla druhá strana o vašem pohledu pochopit? Stačí jedna věta."
        : "Začněme úplně jednoduše: co by se podle vás mělo změnit, aby tato dohoda dávala smysl? Stačí jedna věta.",
    ].join("\n");
  }

  if (isIncompleteDisclosure(text)) {
    return [
      "Ještě nevím, co vám vadí, ale chci tomu porozumět.",
      "Co konkrétně vám v té situaci vadí nejvíc? Stačí jeden příklad.",
    ].join("\n");
  }

  if (containsPersonLabel(text)) {
    return [
      "Rozumím, že chování druhé strany teď vnímáte negativně.",
      "Co konkrétně udělala nebo neudělala, z čeho ten pocit vznikl? Stačí jeden příklad.",
    ].join("\n");
  }

  if (lower.includes("co tady") || lower.includes("k čemu") || lower.includes("k cemu")) {
    return "Tady můžete mluvit přímo se mnou. Pomůžu oddělit fakta, pocity a požadavky a ostatním zobrazím stejný význam v méně útočné podobě. Co potřebujete, aby druhá strana pochopila jako první?";
  }

  if (lower.includes("termín") || lower.includes("termin") || lower.includes("do kdy")) {
    return withDraftVariants(settings, [
      "Bez vyjádření druhé strany zatím nevíme, proč se termín mění. Nemá smysl hádat motiv.",
      "Užitečné bude domluvit jednoduché pravidlo: změna platí po potvrzení obou a současně se určí nový konkrétní čas.",
    ], [
      "Můžeme se domluvit, že změna termínu bude platit až po potvrzení obou a rovnou stanovíme nový čas?",
      "Potřebuji větší předvídatelnost. Když se termín mění, pojďme vždy uvést důvod a potvrdit náhradní termín.",
      "Navrhuji jednoduché pravidlo: změna, nový termín a potvrzení obou v jedné zprávě.",
    ], text);
  }

  if (/nev[ií]m.*(?:o čem|o cem|co).*(?:p[ií]š|pis)/u.test(lower)) {
    return [
      "Rozumím, chybí vám přehled o tom, co je pro vás z druhého rozhovoru podstatné.",
      `Co potřebujete od ${otherSourceLabel} vědět jako první: pohled na problém, cíl, nebo konkrétní návrh dalšího kroku?`,
    ].join("\n");
  }

  if (text.includes("?") || /^(proč|proc|jak|co|kdy|kde|může|muze|má|ma)\b/.test(lower.trim())) {
    return withDraftVariants(settings, [
      "Z dosavadních informací to ještě nejde poctivě rozhodnout.",
      "Vy potřebujete jasnou odpověď a na druhé straně je potřeba prostor popsat vlastní pohled bez obvinění. Který jeden ověřitelný fakt je pro odpověď nejdůležitější?",
    ], [
      "Můžete mi prosím říct, jak to vidíte vy a co by podle vás byl férový další krok?",
      "Nechci hádat vaše důvody. Co je hlavní překážka a jaké řešení by pro vás bylo přijatelné?",
      "Co z toho je podle vás fakt, v čem se rozcházíme a na čem se můžeme domluvit hned?",
    ], text);
  }

  if (lower.includes("štve") || lower.includes("stve") || lower.includes("vadí") || lower.includes("nechci") || lower.includes("bojím")) {
    return withDraftVariants(settings, [
      "Slyším, že je tu hranice, která už potřebuje být jasná.",
      "Co přesně se má změnit v chování druhé strany, abyste poznal/a skutečný posun?",
    ], [
      "Potřebuji konkrétní reakci a jasné pravidlo, abychom se netočili v nejistotě.",
      "Nechci z toho dělat boj o vinu. Potřebuji vědět, kdo o čem rozhoduje a kdy se k tomu vrátíme.",
      "Pro mě je důležité, aby se odpovědnost neměnila za pochodu bez společného potvrzení.",
    ], text);
  }

  if (lower.includes("souhlas") || lower.includes("možná") || lower.includes("mozna")) {
    return withDraftVariants(settings, [
      "Tady už je kousek shody. Pojďme ho hned převést do něčeho konkrétního.",
      "Jaké jedno pravidlo z toho může začít platit už tento týden?",
    ], [
      "Myslím, že tady už máme kus shody. Pojďme ho převést do jednoho konkrétního pravidla.",
      "Souhlasím se směrem, ale potřebuju, aby z toho vzniklo něco ověřitelného.",
      "Navrhuji zapsat, co přesně začne platit a kdy ověříme, jestli to funguje.",
    ], text);
  }

  return withDraftVariants(settings, [
    "Rozumím. Pojďme z toho rychle vytáhnout konkrétní cíl.",
    "Co má odteď platit jinak, abyste poznal/a, že se situace opravdu zlepšila?",
  ], [
    "Potřebuji, abychom se posunuli od domýšlení ke konkrétnímu pravidlu.",
    "Chci popsat svůj pohled tak, aby byl slyšet, ale nezvýšil napětí.",
    "Pojďme najít jednu změnu, která začne platit hned a dá se za pár dní ověřit.",
  ], text);
}

function withDraftVariants(settings, bodyLines, drafts, originalText = "") {
  const sourceText = String(originalText).toLowerCase();
  const wordingRequested = /jak.*(?:říct|rict|napsat|formul)|přeformul|preformul|zn[ií]t/u.test(sourceText);
  const count = wordingRequested ? Math.max(0, Math.min(3, Number(settings.variants || 0))) : 0;
  const tunedLines = [...bodyLines];
  if (settings.initiatorMode) {
    tunedLines.push("Aktivace: pošlete ostatním jednu otázku, na kterou jde odpovědět do 30 sekund.");
  }
  if (!count) return tunedLines.join("\n");
  return [
    ...tunedLines,
    "",
    "Návrhy formulace:",
    ...drafts.slice(0, count).map((draft, index) => `${index + 1}. ${draft}`),
  ].join("\n");
}

function initiatorKickoff(room, author) {
  const others = room.participants.filter((name) => name !== author);
  const targets = others.length ? others.join(", ") : "další účastníky";
  return [
    "Iniciátor zapnutý. Jdu to rozhýbat.",
    "Bez tlaku: stačí velmi malý vstup.",
    `Téma pro ${targets}: co je jedna věc, kterou umíme uznat na pohledu druhé strany?`,
    "Mikrokrok: pošlete ostatním jednu krátkou otázku, na kterou jde odpovědět do 30 sekund.",
    "",
    "Návrhy formulace:",
    "1. Zkusme každý napsat jednu věc, kterou na pohledu druhé strany dokážeme uznat.",
    "2. Neřešme teď celé drama. Dejme si jen 30 sekund: co je nejmenší společný krok?",
    "3. Můžeme začít jednoduše: každý jednu větu, co potřebuje, a jednu větu, co nabízí.",
  ].join("\n");
}

function initiatorParticipantPrompt(room, author, participant) {
  return [
    `${author} zapnul/a Iniciátora, takže zkusím mediaci trochu rozhýbat.`,
    `Pro vás, ${participant}: napište jen jednu větu. Co z pohledu druhé strany umíte uznat, i když s ní nesouhlasíte celou?`,
    "Stačí krátce. Cíl není ustoupit, ale najít první společný bod.",
  ].join("\n");
}

function mediatorIdlePrompt(room, participant) {
  const others = (room.participants || []).filter((name) => name && name !== participant);
  const title = trimSentenceEnd(room.title || "tahle dohoda");
  if (!others.length) {
    return [
      `${participant}, pojďme to rozjet co nejlehčeji.`,
      `K tématu „${title}“ mi napište jen jednu větu: co by se mělo změnit, aby to pro vás začalo dávat smysl?`,
      "Nemusí to být dokonale formulované. Od toho jsem tady.",
    ].join("\n");
  }
  return [
    `${participant}, vezmu vás do toho krátce a bez tlaku.`,
    `V místnosti je také ${others.join(", ")}. Abych mohl férově propojovat pohledy, potřebuji od vás první vlastní stopu.`,
    "Vyberte jednu možnost a napište jedinou větu: co vám vadí, co potřebujete, nebo co jste ochotný/á nabídnout jako první malý krok?",
  ].join("\n");
}

function newcomerBriefing(room, participant) {
  const stage = room.stage || room.status || "vstupní mapování";
  const existingParticipants = room.participants.filter((name) => name && name !== participant);
  const title = trimSentenceEnd(room.title || "Nová dohoda");
  const goal = trimSentenceEnd(room.goal || "najít konkrétní dohodu");
  const shared = formatBriefingItems(room.map?.shared?.slice(-3), "společné body se zatím hledají");
  const open = formatBriefingItems(room.map?.open?.slice(-3), "hlavní otevřené body se teprve pojmenovávají");
  const recentTopics = safeNewcomerTopics(room);
  return [
    `Vítejte, ${participant}. Nejdřív krátký kontext, potom dostanete prostor pro svůj vlastní pohled.`,
    `Téma: ${title}.`,
    `Cíl místnosti: ${goal}.`,
    existingParticipants.length
      ? `${existingParticipants.length === 1 ? "Další účastník" : "Další účastníci"} v místnosti: ${existingParticipants.join(", ")}. Fáze: ${stage}.`
      : `Zatím jste v místnosti první účastník. Fáze: ${stage}.`,
    recentTopics.length
      ? `Dosud se bezpečně otevřelo: ${recentTopics.join("; ")}.`
      : "Dosavadní účastníci zatím nepředali dost konkrétního obsahu pro společné shrnutí.",
    `Co se zatím rýsuje: ${shared}.`,
    `Co zůstává otevřené: ${open}.`,
    "Teď váš pohled: co z toho vidíte stejně nebo jinak a čeho byste chtěl/a dosáhnout? Stačí jedna věta. Pokud nebude něco jasné, zeptám se jen na jednu důležitou věc.",
  ].join("\n");
}

function trimSentenceEnd(value) {
  return String(value || "").trim().replace(/[.;:,!?\s]+$/u, "");
}

function formatBriefingItems(items, fallback) {
  const values = (items || []).map(trimSentenceEnd).filter(Boolean);
  return values.length ? values.join("; ") : fallback;
}

function safeNewcomerTopics(room) {
  const topics = (room.diary || [])
    .filter((item) => ["private-topic", "source-analysis", "analysis", "agreement"].includes(item?.type))
    .slice(-5)
    .map((item) => {
      const text = String(item.text || "").replace(/\s+/g, " ").trim();
      if (item.type === "private-topic") {
        const match = text.match(/^(.+?) právě řeší s mediátorem: (.+?)\. Ostatní/u);
        if (match) return `${match[1]}: téma „${match[2]}“`;
      }
      if (item.type === "source-analysis") return "do mapy byl promítnut nový zdroj";
      if (item.type === "agreement") return "vznikl pracovní návrh dohody";
      if (item.type === "analysis") return "byly aktualizovány společné a otevřené body";
      return "";
    })
    .filter(Boolean);
  return unique(topics).slice(-4);
}

function fallbackRecipientBridgeReply(room, text, author, recipient) {
  if (isGreetingMessage(text)) {
    return "Ahoj.";
  }
  if (isIncompleteDisclosure(text)) {
    return "Chci pojmenovat něco, co mi vadí, ale zatím jsem to ještě neupřesnil/a.";
  }
  if (containsPersonLabel(text)) {
    return "Mám pocit, že z druhé strany chybí ochota ke spolupráci. Potřebuji ještě popsat konkrétní situaci, ze které ten pocit vznikl.";
  }
  // Když AI není dostupná, je bezpečnější zachovat význam doslova než jej nahradit obecným odhadem.
  return String(text || "").trim();
}

function isGreetingMessage(text) {
  const value = String(text || "").trim().toLowerCase().replace(/[!.,?\s]+$/u, "");
  return /^(ahoj|čau|cau|zdar|nazdar|dobrý den|dobry den|hello|hi|hey)$/u.test(value);
}

function isIncompleteDisclosure(text) {
  const value = String(text || "").trim().toLowerCase();
  return /^(víš|vis|vís|vite|víte)\s+(co|cože)\s+(mi|mě|mne|nám)\s+(vadí|vadi)[?!.\s]*$/u.test(value)
    || /^(můžu|muzu|mohu)\s+(ti|vám)\s+(něco|neco)\s+(říct|rict)[?!.\s]*$/u.test(value);
}

function containsPersonLabel(text) {
  const value = String(text || "").trim().toLowerCase();
  return /(?:^|[\s,])že\s+[\p{L}][\p{L}-]*\s+je\s+(neochotn\p{L}*|lín\p{L}*|sobeck\p{L}*|arogantn\p{L}*|nespolehliv\p{L}*|hrozn\p{L}*|nemožn\p{L}*)(?=[\s.,!?]|$)/u.test(value);
}

function updateMap(room, text) {
  const lower = text.toLowerCase();
  if (lower.includes("souhlas")) addUnique(room.map.shared, "V komunikaci se objevil výslovný souhlas.");
  if (lower.includes("termín") || lower.includes("kdy")) addUnique(room.map.open, "Doplnit termín a vlastníka dohody.");
  if (lower.includes("hranice") || lower.includes("nechci")) addUnique(room.map.needs, "Některá strana potřebuje jasně chráněnou hranici.");
}

function moveProgress(room, amount) {
  syncAgreementIndex(room, amount);
}

function syncAgreementIndex(room, activityBoost = 0) {
  const score = calculateAgreementIndex(room);
  const previous = Number(room.progress || 0);
  const cap = agreementIndexCap(room);
  const boosted = Math.min(cap, score + Math.min(4, Math.max(0, activityBoost || 0)));
  room.progress = Math.max(score, Math.min(Math.max(Math.min(previous, cap), boosted), Math.min(cap, score + 8)));
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

function calculateAgreementIndex(room) {
  const criteria = agreementIndexCriteria(room);
  let score = criteria.reduce((sum, item) => sum + item.value, 0);
  const participants = room.participants || [];
  const participantInputs = participantInputCount(room);
  if (participants.length < 2) score = Math.min(score, 32);
  else if (participantInputs < 2) score = Math.min(score, 52);
  if (!String(room.agreement || "").trim()) score = Math.min(score, 74);
  return score;
}

function agreementIndexCap(room) {
  const participants = room.participants || [];
  const participantInputs = participantInputCount(room);
  if (participants.length < 2) return 32;
  if (participantInputs < 2) return 52;
  if (!String(room.agreement || "").trim()) return 74;
  return 96;
}

function agreementIndexCriteria(room) {
  ensureRoomDefaults(room);
  const participants = room.participants || [];
  const participantInputs = participantInputCount(room);
  const sharedCount = room.map.shared.length;
  const needsCount = room.map.needs.length;
  const openCount = room.map.open.length;
  const sourceCount = (room.sources || []).filter((source) => source.analysis || source.extractedText || source.url).length;
  const hasAgreement = Boolean(String(room.agreement || "").trim());
  const hasConcreteTerms = hasAgreement && /kdo|co|do kdy|term[ií]n|odpov[eě]dn|kontrol/i.test(room.agreement || "");
  const activeSidesScore = participants.length >= 2 ? 14 : participants.length === 1 ? 6 : 0;
  const inputScore = participants.length
    ? Math.min(20, Math.round((participantInputs / Math.max(2, participants.length)) * 20))
    : 0;
  return [
    {
      id: "participants",
      label: "Zapojení stran",
      value: activeSidesScore,
      max: 14,
      detail: participants.length >= 2 ? "V místnosti je víc než jedna strana." : "Zatím je přítomná jen jedna strana.",
    },
    {
      id: "inputs",
      label: "Vlastní vstupy účastníků",
      value: inputScore,
      max: 20,
      detail: `${participantInputs}/${Math.max(2, participants.length || 2)} stran už popsalo vlastní pohled.`,
    },
    {
      id: "needs",
      label: "Pojmenované potřeby",
      value: Math.min(16, needsCount * 5),
      max: 16,
      detail: `${needsCount} zachycených potřeb nebo hranic.`,
    },
    {
      id: "shared",
      label: "Body shody",
      value: Math.min(16, sharedCount * 5),
      max: 16,
      detail: `${sharedCount} bodů, na kterých se dá stavět.`,
    },
    {
      id: "open",
      label: "Otevřené body pod kontrolou",
      value: sharedCount || needsCount ? Math.max(0, 12 - Math.min(12, openCount * 3)) : 0,
      max: 12,
      detail: openCount ? `${openCount} otevřených bodů ještě brzdí dohodu.` : "Otevřené body zatím nejsou překážkou.",
    },
    {
      id: "sources",
      label: "Podklady",
      value: Math.min(8, sourceCount * 4),
      max: 8,
      detail: sourceCount ? `${sourceCount} zdrojů je čitelných nebo analyzovaných.` : "Zatím bez využitých podkladů.",
    },
    {
      id: "agreement",
      label: "Konkrétnost dohody",
      value: (hasAgreement ? 10 : 0) + (hasConcreteTerms ? 4 : 0),
      max: 14,
      detail: hasAgreement ? "Existuje pracovní návrh dohody." : "Návrh dohody ještě není připravený.",
    },
  ];
}

function participantInputCount(room) {
  const participants = room.participants || [];
  return participants.filter((name) =>
    (room.privateConversations?.[name] || []).some((message) => !message.ai && String(message.text || "").trim()),
  ).length;
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
