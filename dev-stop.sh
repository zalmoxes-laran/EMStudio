#!/usr/bin/env bash
# Ferma quello che ./dev.sh lascia acceso — PER IDENTITÀ, mai per porta.
#
# Perché esiste: `dev.sh` mette in `pids` il SUBSHELL di `(cd frontend && npm
# run dev)`, non il `node` di Vite. Al Ctrl-C il bridge muore (il suo pid è
# quello vero) e Vite sopravvive tenendo :5173, così il rilancio scivola su
# 5174 — e la rotta `/em/studio/` di Caddy, che punta a 5173, trova il vuoto.
#
# Perché per identità e non per porta: il 4 settembre un
# `lsof -ti:5173 | xargs kill -9` ha ucciso il FORWARDER di Colima, e con lui la
# VM e tutti i container. Su questa macchina una porta può essere tenuta da un
# inoltro, non dal processo che credi. Quindi qui si guarda chi è, e ciò che non
# si riconosce NON si tocca: si nomina e si lascia vivo.
#
#   ./dev-stop.sh            ferma bridge + Vite di QUESTO checkout
#   ./dev-stop.sh --dry      dice solo cosa farebbe
#   ./dev-stop.sh --port N   controlla anche la porta N (default 5173 8765)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY=0; PORTS=(5173 8765)
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry|-n) DRY=1; shift ;;
    --port) PORTS+=("$2"); shift 2 ;;
    *) echo "uso: $0 [--dry] [--port N]"; exit 2 ;;
  esac
done

# Chi NON si tocca mai, qualunque porta tenga: inoltri, VM, container.
PROTECTED='ssh|limactl|colima|qemu|docker|com\.docker|vpnkit|lima-guestagent'

say() { printf '%s\n' "$*"; }

# I processi di QUESTO checkout, riconosciuti dalla riga di comando.
mine() {
  ps -Ao pid=,args= | awk -v root="$ROOT" '
    $0 ~ /em_bridge\.py/ && index($0, root) { print $1 " bridge"; next }
    $0 ~ /(vite|npm.*run dev|node.*vite)/ && index($0, root) { print $1 " vite" }
  '
}

killed=0
while read -r pid what; do
  [[ -z "${pid:-}" ]] && continue
  line="$(ps -o args= -p "$pid" 2>/dev/null | cut -c1-90)"
  if [[ "$DRY" == 1 ]]; then say "  fermerei $what pid $pid — $line"; continue
  fi
  say "  fermo $what pid $pid"
  kill "$pid" 2>/dev/null
  killed=$((killed+1))
done < <(mine)

# Attesa educata, poi insistenza — solo sui nostri.
if [[ "$DRY" == 0 && "$killed" -gt 0 ]]; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do sleep 0.2; [[ -z "$(mine)" ]] && break; done
  while read -r pid _; do [[ -n "${pid:-}" ]] && kill -9 "$pid" 2>/dev/null; done < <(mine)
fi

# E adesso il controllo che conta: le porte sono libere? Se non lo sono, DICI CHI
# le tiene invece di ucciderlo. Un nome è più utile di un colpo.
for port in "${PORTS[@]}"; do
  holders="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2)"
  if [[ -z "$holders" ]]; then say "✅  :$port libera"; continue; fi
  say "⚠️  :$port ancora occupata da:"
  ours="$(mine | awk '{print $1}' | tr '\n' ' ')"
  printf '%s\n' "$holders" | while read -r cmd pid rest; do
    args="$(ps -o args= -p "$pid" 2>/dev/null | cut -c1-70)"
    if [[ "$cmd" =~ $PROTECTED ]]; then
      say "    $cmd (pid $pid) — NON lo tocco: è un inoltro o una VM. $args"
    elif [[ " $ours " == *" $pid "* ]]; then
      say "    $cmd (pid $pid) — è nostro, e in --dry non l'ho fermato. $args"
    else
      say "    $cmd (pid $pid) — estraneo a questo checkout: $args"
    fi
  done
  say "    (se è davvero da fermare, fallo tu guardando chi è: kill <pid>)"
done
