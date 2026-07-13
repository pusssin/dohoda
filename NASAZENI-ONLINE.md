# Dohoda online

Pro pripojeni ucastniku mimo vas pocitac musi aplikace bezet na verejne adrese.
Nestaci otevrit `index.html` jako soubor, protoze pozvanky a spolecny stav mistnosti potrebuji server.

## Nejjednodussi postup

1. Nahrajte slozku `dohoda-prototype` do GitHub repozitare.
2. Na hostingu vytvorte novou Node.js web aplikaci z tohoto repozitare.
3. Nastavte:
   - start command: `npm start`
   - port: hosting si ho vetsinou doplni pres promennou `PORT`
   - volitelne `OPENAI_API_KEY`, pokud ma AI mediator odpovidat pres skutecny model
4. Po nasazeni otevrite verejnou adresu aplikace.
5. V mistnosti kliknete na `Pozvat dalsiho ucastnika` a poslete odkaz druhe osobe.

## AI API klic pro lokalni test

Pro skutecne odpovedi AI mediatoru nastavte `OPENAI_API_KEY` jen na serveru.
Nikdy ho nevkladejte do `app.js`, `index.html` ani do pozvankoveho odkazu.

Postup:

1. Zkopirujte `.env.example` na `.env`.
2. Do `.env` vlozte svuj API klic:

   ```bash
   OPENAI_API_KEY=sk-proj-vlozte_sem_svuj_klic
   OPENAI_MODEL=gpt-4.1-mini
   ```

3. Restartujte server.
4. V aplikaci by se misto `Demo mediator` melo objevit `AI mediator online`.

Bez `OPENAI_API_KEY` aplikace stale bezi, ale pouziva jen jednoduche demo odpovedi.

## Dulezite omezeni prototypu

Aktualni verze uklada mistnosti jen do pameti serveru. To je pro prvni demo v poradku,
ale po restartu hostingu se data ztrati. Pro skutecnou aplikaci bude dalsi krok databaze.

Minimalni dalsi krok pro realne pouziti:

- databaze pro mistnosti, ucastniky a soukrome chaty
- prihlaseni nebo aspon bezpecne vstupni tokeny do mistnosti
- oddeleni soukromych rozhovoru jednotlivych ucastniku na urovni serveru
- produkcni nastaveni AI modelu pres `OPENAI_API_KEY`
