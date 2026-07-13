#!/bin/zsh
clear

APP_DIR="/Users/adamkraus/Documents/Codex/2026-05-30/chci-vytvorit-aplikaci-jako-arbitra-dvou/outputs/dohoda-prototype"
CODEX_NODE="/Applications/Codex.app/Contents/Resources/node"
URL="http://127.0.0.1:4173/?v=quiet-list-1#room-team"

echo "Spoustim Dohodu..."
echo ""

cd "$APP_DIR" || {
  echo "Nepodarilo se otevrit slozku aplikace:"
  echo "$APP_DIR"
  echo ""
  echo "Stisknete Enter pro zavreni."
  read
  exit 1
}

if [ ! -x "$CODEX_NODE" ]; then
  echo "Nepodarilo se najit Node v Codex aplikaci:"
  echo "$CODEX_NODE"
  echo ""
  echo "Zkuste do Terminalu zadat:"
  echo "which node"
  echo ""
  echo "Stisknete Enter pro zavreni."
  read
  exit 1
fi

echo "Adresa aplikace:"
echo "$URL"
echo ""
echo "Za chvili ji otevru v prohlizeci. Tohle okno nechte otevrene."
echo "Pro ukonceni aplikace pozdeji stisknete Ctrl+C."
echo ""

(sleep 1.5; open "$URL") &

"$CODEX_NODE" server.js

echo ""
echo "Dohoda se zastavila. Pokud to nebylo zamerne, poslete mi text chyby z tohoto okna."
echo "Stisknete Enter pro zavreni."
read
