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

## Vercel + Neon databaze

Vercel Postgres se pro nove projekty nyni resi pres externi Postgres integrace.
Nejjednodussi cesta je Neon Postgres z Vercel Marketplace.

Postup:

1. Ve Vercelu otevri projekt `dohoda`.
2. Otevri `Storage` nebo `Marketplace`.
3. Vyber `Neon Postgres`.
4. Pripoj databazi k projektu.
5. Zkontroluj, ze Vercel do projektu pridal `DATABASE_URL`.
6. V `Settings -> Environment Variables` pridej jeste:

   ```bash
   OPENAI_API_KEY=sk-proj-...
   OPENAI_MODEL=gpt-4.1-mini
   ```

7. Spust novy deployment.

Aplikace si pri prvnim API pozadavku sama vytvori tabulku `dohoda_state`.
Pokud `DATABASE_URL` neni nastavene, aplikace porad funguje v pameti serveru,
ale data se mohou ztratit po restartu nebo novem deploymentu.

## Dulezite omezeni prototypu

Pokud je nastavene `DATABASE_URL`, mistnosti se ukladaji do Postgres/Neon databaze.
Bez `DATABASE_URL` se mistnosti ukladaji jen do pameti serveru, coz je pro prvni demo
v poradku, ale po restartu hostingu se data ztrati.

Minimalni dalsi krok pro realne pouziti:

- prihlaseni nebo aspon bezpecne vstupni tokeny do mistnosti
- oddeleni soukromych rozhovoru jednotlivych ucastniku na urovni serveru
- produkcni nastaveni AI modelu pres `OPENAI_API_KEY`
