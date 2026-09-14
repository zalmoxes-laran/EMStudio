/**
 * Le PISTE — «ho visto questo digest in questo posto, in questo momento».
 *
 * Un registro mutevole, plurale e non autorevole, in un file separato
 * (`<asset>.hints.json`) e **mai coperto da nessun digest**. Il file è separato
 * per necessità e non per ordine: un record immutabile non può contenere un
 * campo mutevole, perché riscriverlo ne cambierebbe il contenuto.
 *
 * Sono l'**unica cosa che questa notte scrive**. Il timbro si legge e basta.
 *
 * ## Il guadagno, che è il contrario di quello che sembra
 *
 * **Una pista sbagliata è innocua.** La si segue, si ricalcola l'impronta, e o è
 * la cosa giusta o ci si accorge subito. Un sistema che punta per NOME consegna
 * *in silenzio* il file sbagliato, che è il modo peggiore di sbagliare che
 * esista — ed è la ragione per cui `stamp.ts` accetta solo per impronta.
 *
 * ## `scope`: riservatezza, non pulizia
 *
 * `public` può viaggiare — un URI di uno store è un indirizzo. `private` **non
 * esce mai**, e non per ordine: un percorso assoluto pubblicato è inutile agli
 * altri e indiscreto verso chi lo ha scritto, perché porta il nome utente, la
 * struttura delle cartelle e a volte il nome di un committente.
 *
 *     /Users/mrossi/lavori/Fondazione Ansaldo/2015/nuvola.ply
 *
 * dice quattro cose che nessuno aveva intenzione di dire.
 *
 * Quindi {@link forExport} è l'unica porta verso l'esterno e **non ha un
 * parametro per disattivare il filtro**: una porta che si può aprire a metà è
 * una porta che un giorno qualcuno apre a metà.
 */

export const HINTS_VERSION = 1;
export const HINTS_SUFFIX = ".hints.json";

export type HintScope = "public" | "private";
export type HintKind = "s3" | "http" | "local" | "blend";

export interface Hint {
  locator: string;
  kind: HintKind;
  scope: HintScope;
  when: string;
  /** il nome della macchina — sta in una pista `private` e **non esce mai**,
   *  nemmeno da una pubblica: il nome del computer di una persona non è parte
   *  di un indirizzo. */
  machine?: string;
}

export interface Hints {
  hints: number;
  digest: string;
  seen: Hint[];
}

export function hintsPathFor(filePath: string): string {
  return `${filePath}${HINTS_SUFFIX}`;
}

export function newHints(digest: string): Hints {
  return { hints: HINTS_VERSION, digest, seen: [] };
}

export function kindFor(locator: string): HintKind {
  const text = String(locator || "");
  if (text.startsWith("s3://")) return "s3";
  if (text.startsWith("http://") || text.startsWith("https://")) return "http";
  if (text.startsWith("blend://")) return "blend";
  return "local";
}

/** Il verso del dubbio va verso `private`, **sempre**. Sbagliare verso
 *  «privato» costa una pista che non viaggia; sbagliare verso «pubblico» costa
 *  il nome utente di qualcuno. */
export function scopeFor(locator: string, kind?: HintKind): HintScope {
  const guessed = kind ?? kindFor(locator);
  return guessed === "s3" || guessed === "http" ? "public" : "private";
}

/**
 * Annota «visto qui, adesso». **Aggiorna, non duplica, non cancella.**
 *
 * Lo stesso locator sulla stessa macchina è la stessa pista riosservata: si
 * aggiorna il suo `when` e resta al suo posto. Una riga per ogni sguardo farebbe
 * crescere il file senza aggiungere un fatto. Lo stesso percorso su un'ALTRA
 * macchina è invece un'altra pista.
 *
 * **Le piste non si cancellano, invecchiano.** In questo modulo non c'è, e non
 * ci sarà, niente che chieda a una persona di sistemare un percorso: un file
 * spostato non è un errore da correggere, è un fatto da riosservare.
 */
export function noteSeen(
  hints: Hints, locator: string,
  opts: { kind?: HintKind; scope?: HintScope; machine?: string; when?: string } = {},
): Hint {
  const kind = opts.kind ?? kindFor(locator);
  const entry: Hint = {
    locator: String(locator),
    kind,
    scope: opts.scope ?? scopeFor(locator, kind),
    when: opts.when ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  if (opts.machine) entry.machine = opts.machine;
  for (const existing of hints.seen) {
    if (existing.locator === entry.locator && existing.machine === entry.machine) {
      Object.assign(existing, entry);
      return existing;
    }
  }
  hints.seen.push(entry);
  return entry;
}

/**
 * Le piste che possono viaggiare: **solo `public`**, e senza il nome macchina.
 *
 * L'unica porta verso l'esterno, e senza interruttore. Restituisce sempre un
 * registro ben formato anche quando resta vuoto: «di questo digest non so
 * nessun posto pubblico» è una risposta onesta, mentre nessun file lascerebbe
 * credere che il registro non esista.
 */
export function forExport(hints: Hints): Hints {
  return {
    hints: HINTS_VERSION,
    digest: hints.digest,
    seen: (hints.seen ?? [])
      .filter((h) => h && h.scope === "public")
      .map(({ machine: _machine, ...rest }) => rest as Hint),
  };
}

/** I locator che non devono uscire — **per poterlo provare**, non per usarli. */
export function privateLocators(hints: Hints): string[] {
  return (hints.seen ?? []).filter((h) => h.scope !== "public")
    .map((h) => h.locator);
}

// ── scrivere: l'unica scrittura della notte ─────────────────────────────────

let resolveBridge: (() => Promise<string>) | null = null;

export function setHintsBridgeResolver(fn: () => Promise<string>): void {
  resolveBridge = fn;
}

async function bridge(): Promise<string> {
  if (!resolveBridge) throw new Error("no bridge resolver installed");
  return await resolveBridge();
}

export async function readHints(path: string): Promise<Hints | null> {
  try {
    const res = await fetch(
      `${await bridge()}/fs/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) return null;
    const parsed = (await res.json()) as Hints;
    return parsed && parsed.hints === HINTS_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Scrive il registro DI CASA, piste private comprese — è il file locale.
 *
 * La rotta del bridge rifiuta per nome qualunque cosa non finisca in
 * `.hints.json`, quindi **questa funzione non può scrivere dentro un timbro**
 * nemmeno se la si chiamasse con il percorso sbagliato. L'invariante è custodito
 * ai due estremi: qui `hintsPathFor` compone il nome, e là il server lo verifica.
 */
export async function writeHints(path: string, hints: Hints): Promise<boolean> {
  if (!path.endsWith(HINTS_SUFFIX)) {
    // Non un `throw` generico: la frase dice PERCHÉ, perché il giorno in cui
    // qualcuno la legge sta cercando di fare esattamente la cosa vietata.
    throw new Error(
      `${path}: hints are written to <asset>${HINTS_SUFFIX}. A stamp is the ` +
      `immutable record of a step and nothing here modifies one.`);
  }
  try {
    const res = await fetch(`${await bridge()}/stamp/hints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, hints }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Quello che una ricerca riuscita produce: **una pista, non una modifica al
 * timbro.**
 *
 * È il gesto che chiude E5. Si è cercato un genitore irrisolto, lo si è
 * accettato per impronta, e quello che si registra è il POSTO in cui è stato
 * visto — un fatto mutevole, in un file mutevole, accanto a un verbale che resta
 * quello che era.
 */
export async function recordFound(
  digest: string, locator: string,
  opts: { machine?: string; anchor?: string } = {},
): Promise<{ written: boolean; path: string; hints: Hints }> {
  const path = hintsPathFor(opts.anchor ?? locator);
  const existing = await readHints(path);
  const hints = existing ?? newHints(digest);
  noteSeen(hints, locator, { machine: opts.machine });
  const written = await writeHints(path, hints);
  return { written, path, hints };
}
