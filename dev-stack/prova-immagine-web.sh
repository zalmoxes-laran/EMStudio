#!/bin/sh
# prova-immagine-web · l'immagine web di EMStudio serve DAVVERO le due pagine
#
# La forma del guasto che questa prova esiste per prendere non è «il container
# non parte»: è la PAGINA BIANCA. Una SPA servita con la `base` sbagliata
# risponde 200 con una shell che poi chiede i suoi moduli a un indirizzo che
# non esiste, e il browser non dice niente a nessuno tranne che a chi guarda.
# Un `curl /` che vede 200 lo dichiarerebbe a posto.
#
# Quindi la prova non guarda il codice di stato della shell: legge la shell,
# ESTRAE ogni riferimento che ci sta dentro, e chiede QUELLI.
#
#   1. parte con --user 12345:0 (un UID che non è nel suo /etc/passwd)
#   2. /health risponde dall'esterno
#   3. / è l'EDITOR, e /read/ è il LETTORE — due pagine, non due volte la stessa
#   4. ogni assets/… che il lettore nomina risponde 200
#   5. il testo della licenza è dentro l'immagine
#
# LA MUTAZIONE: costruisci con `base: "/em/studio/"` invece che `./` e il
# punto 4 deve diventare rosso mentre 2 e 3 restano verdi — cioè la prova deve
# distinguere «serve» da «serve qualcosa che funziona».
#
set -eu
IMG="${1:-emstudio:uidtest}"
PORTA=18404
UID_FINTO=12345
QUI="$(cd "$(dirname "$0")" && pwd)"
RADICE="$(cd "$QUI/.." && pwd)"

rosse=0; verdi=0
ok()   { verdi=$((verdi+1)); printf "  \033[32m✓\033[0m %s\n" "$*"; }
male() { rosse=$((rosse+1)); printf "  \033[31m✗\033[0m %s\n" "$*"; }

printf "▶ %s  (--user %s:0)\n" "$IMG" "$UID_FINTO"

if docker run --rm --entrypoint sh "$IMG" -c "getent passwd $UID_FINTO" >/dev/null 2>&1; then
  male "$UID_FINTO esiste nel /etc/passwd dell'immagine: la prova è vuota"; exit 1
fi
ok "$UID_FINTO non esiste nel /etc/passwd dell'immagine"

u="$(docker image inspect --format '{{.Config.User}}' "$IMG")"
case "$u" in ''|*[!0-9]*) male "USER dell'immagine è «$u», non un numero";; *) ok "USER dell'immagine è il numero $u";; esac

SHA="$(shasum -a 256 "$RADICE/LICENSE" 2>/dev/null | cut -d' ' -f1 || sha256sum "$RADICE/LICENSE" | cut -d' ' -f1)"
dentro="$(docker run --rm --user "$UID_FINTO:0" --entrypoint sh "$IMG" -c 'sha256sum /licenses/LICENSE 2>/dev/null | cut -d" " -f1' || true)"
[ "$dentro" = "$SHA" ] && ok "/licenses/LICENSE c'è ed è lo stesso file del repo" \
                       || male "/licenses/LICENSE assente o diverso (dentro: ${dentro:-niente})"

c="$(docker run -d --rm --user "$UID_FINTO:0" -p "$PORTA:8080" "$IMG")"
trap 'docker rm -f "$c" >/dev/null 2>&1 || true' EXIT

i=0; vivo=no
while [ $i -lt 40 ]; do
  curl -fsS -m 2 "http://127.0.0.1:$PORTA/health" >/dev/null 2>&1 && { vivo=sì; break; }
  [ -z "$(docker ps -q -f id="$c")" ] && break
  i=$((i+1)); sleep 0.5
done
if [ "$vivo" = "sì" ]; then ok "parte e /health risponde 200 (porta $PORTA)"
else male "non risponde su /health"; docker logs "$c" 2>&1 | tail -10 | sed 's/^/      /'; exit 1; fi

# 3 · due pagine DIVERSE, riconosciute dal loro contenuto e non dallo stato
editor="$(curl -fsS -m 5 "http://127.0.0.1:$PORTA/" || true)"
lettore="$(curl -fsS -m 5 "http://127.0.0.1:$PORTA/read/" || true)"
[ -n "$editor" ]  && ok "/ risponde con una pagina ($(printf %s "$editor" | wc -c | tr -d ' ') byte)" || male "/ non risponde"
[ -n "$lettore" ] && ok "/read/ risponde con una pagina ($(printf %s "$lettore" | wc -c | tr -d ' ') byte)" || male "/read/ non risponde"
if [ -n "$editor" ] && [ -n "$lettore" ] && [ "$editor" != "$lettore" ]; then
  ok "sono due pagine diverse (l'editor e il lettore, non due volte la stessa)"
else
  male "/ e /read/ servono la STESSA pagina"
fi

# 4 · IL PUNTO. Ogni riferimento scritto nella shell del lettore, chiesto
# davvero, con l'indirizzo che un browser userebbe: relativo alla directory da
# cui la shell è arrivata, cioè /read/.
rif="$(printf '%s' "$lettore" \
       | grep -oE '(src|href)="[^"]+"' \
       | sed -E 's/^(src|href)="//; s/"$//' \
       | grep -vE '^(https?:|data:|#|mailto:)' | sort -u)"
if [ -z "$rif" ]; then
  male "la shell del lettore non nomina nessun asset: o è inlinata o non è la shell"
else
  n=0; persi=0
  for r in $rif; do
    n=$((n+1))
    url="http://127.0.0.1:$PORTA/read/${r#./}"
    curl -fsS -m 5 -o /dev/null "$url" || { persi=$((persi+1)); printf "      404 → %s\n" "$url"; }
  done
  [ "$persi" -eq 0 ] && ok "tutti i $n riferimenti del lettore rispondono 200" \
                     || male "$persi riferimenti su $n NON rispondono (pagina bianca)"
fi

printf "\n── %d verdi · %d rosse ──\n" "$verdi" "$rosse"
[ "$rosse" -eq 0 ]
