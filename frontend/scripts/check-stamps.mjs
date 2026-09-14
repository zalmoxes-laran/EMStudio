// DTCEMS1 · il timbro si legge, e l'unica cosa che si scrive è una pista.
//
//   node scripts/check-stamps.mjs
//
// Due specie di prova, e la seconda è quella che il disegno pretende.
//
// **Di comportamento**: l'accettazione è per IMPRONTA e mai per nome, il file
// riesportato sopra è NON TIMBRATO, la dimensione scarta prima di leggere un
// byte, una pista `private` non esce.
//
// **Strutturale**: nessun percorso di questo codice scrive dentro un
// `.stamp.json`. E **ogni asserzione strutturale qui ha il suo controesempio
// deliberato**, che deve farla fallire — una prova che può solo passare non è
// una prova, è una decorazione che si porta appresso la fiducia di chi la legge.
import * as esbuild from "esbuild";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chiama, stringheLetterali } from "./sorgenti.mjs";

const SRC = new URL("../src/", import.meta.url).pathname;
const SCRIPTS = new URL("./", import.meta.url).pathname;

async function carica(entry) {
  const bundle = await esbuild.build({
    entryPoints: [`${SRC}${entry}`], bundle: true, format: "esm", write: false,
  });
  return await import("data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64"));
}

const S = await carica("stamp.ts");
const H = await carica("stamp-hints.ts");
const V = await carica("views/stamps.ts");

let fatte = 0;
const prova = (nome, fn) => { fn(); fatte++; console.log(`  ok · ${nome}`); };
const provaAsync = async (nome, fn) => { await fn(); fatte++; console.log(`  ok · ${nome}`); };

// ── il finto disco ──────────────────────────────────────────────────────────
//
// Un disco di prova e non un vero filesystem: quello che si sta misurando è la
// REGOLA DI ACCETTAZIONE, e un disco vero la misurerebbe insieme al bridge, al
// permesso e al modo in cui questa macchina scrive i file. Le tre cose che
// contano — i byte, la dimensione, il nome — le decide questo oggetto.

function fintoDisco(files) {
  const scritture = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (init?.method === "POST" && u.endsWith("/stamp/hints")) {
      const body = JSON.parse(init.body);
      // IL BRIDGE VERO RIFIUTA PER NOME, e questo doppio rifiuta uguale: se il
      // doppio accettasse tutto, la prova sulla riservatezza passerebbe contro
      // un server che in produzione dice di no.
      if (!String(body.path).endsWith(".hints.json"))
        return { ok: false, status: 400, json: async () => ({}) };
      scritture.push(body);
      files.set(body.path, JSON.stringify(body.hints));
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (init?.method === "POST" && u.endsWith("/stamp/identity")) {
      const values = JSON.parse(init.body).values;
      const identities = {};
      for (const v of values) {
        // la RISPOSTA DELLA LIBRERIA, riprodotta qui alla lettera (s3Dgraphy
        // `describe_identity`): il doppio non inventa una quarta parola
        const scheme = v.includes(":") ? v.split(":")[0].toLowerCase() : null;
        const strength = scheme === "sha256" ? "verifiable"
          : scheme === "emstruct1" ? "comparable" : "unknown";
        identities[v] = { scheme, value: v, strength,
                          verifiable: strength === "verifiable",
                          claim: `«${strength}»` };
      }
      return { ok: true, status: 200, json: async () => ({ identities }) };
    }
    const m = u.match(/\/fs\/(file|checksum|list)\?path=([^&]*)/);
    if (!m) return { ok: false, status: 404, json: async () => ({}) };
    const path = decodeURIComponent(m[2]);
    if (m[1] === "file") {
      const body = files.get(path);
      return body === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => JSON.parse(body) };
    }
    if (m[1] === "checksum") {
      const body = files.get(path);
      return body === undefined
        ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200,
            json: async () => ({ checksum: `sha256:${digestOf(body)}` }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return scritture;
}

/** Un'"impronta" di prova: deterministica sui byte e su nient'altro. Non è
 *  sha256 e non deve esserlo — quello che si misura è che l'accettazione guardi
 *  IL CONTENUTO e non il nome, e per quello basta una funzione del contenuto. */
function digestOf(text) {
  let h = 0n;
  for (const c of text) h = (h * 131n + BigInt(c.codePointAt(0))) % (2n ** 64n);
  return h.toString(16).padStart(64, "0");
}

function timbro(id, digest, extra = {}) {
  return { stamp: 1, self: { resource_id: id, digest, ...extra }, from: [] };
}

// ── E3 · per nome si cerca, per IMPRONTA si accetta ─────────────────────────

console.log("\n· E3 — l'accettazione è l'impronta, mai il nome");

const listaVuota = { roots: false, path: "/p", parent: null, entries: [] };
S.setStampBridgeResolver(async () => "http://bridge");
H.setHintsBridgeResolver(async () => "http://bridge");

await provaAsync("un file col suo timbro si accetta per impronta", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  files.set("/p/mesh.glb.stamp.json",
            JSON.stringify(timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`)));
  const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                  type: "file", size: 7, mtime: 1, ext: "glb" });
  assert.equal(r.why, "by-digest");
  assert.equal(r.stamp.self.resource_id, "res:mesh");
});

await provaAsync(
  "IL FILE RIESPORTATO SOPRA è NON TIMBRATO — non riaccoppiato per nome",
  async () => {
    const files = new Map();
    files.set("/p/mesh.glb", "BYTES-NUOVI");          // riesportato sopra
    fintoDisco(files);
    // il timbro accanto parla dei byte VECCHI: è vero, e parla di altro
    files.set("/p/mesh.glb.stamp.json",
              JSON.stringify(timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`)));
    const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                    type: "file", size: 11, mtime: 2, ext: "glb" });
    assert.equal(r.why, "digest-mismatch",
      "il nome combaciava: se questo dicesse `by-digest`, la vecchia " +
      "provenienza sarebbe appena stata attaccata a byte nuovi");
    assert.equal(r.stamp, null, "nessun timbro accettato");
    assert.ok(r.rejected, "…ma il timbro rifiutato si TIENE: «c'era e non è di " +
      "questi byte» è un fatto che vale mostrare");
  });

await provaAsync("LA DIMENSIONE SCARTA prima di leggere un byte", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  files.set("/p/mesh.glb.stamp.json", JSON.stringify(
    timbro("res:mesh", `sha256:${digestOf("BYTES-A")}`,
           { measures: { size_bytes: 999999 } })));
  S.resetHashedCount();
  const r = await S.resolveFile({ name: "mesh.glb", path: "/p/mesh.glb",
                                  type: "file", size: 7, mtime: 1, ext: "glb" });
  assert.equal(r.why, "digest-mismatch");
  assert.equal(S.hashedCount(), 0,
    "la dimensione dichiarata non combaciava: nessuna impronta doveva essere " +
    "calcolata, ed è tutto il punto di E4");
});

prova("IL NOME ORDINA e non decide", () => {
  assert.ok(S.nameSimilarity("nuvola.ply", "nuvola.ply") === 1);
  assert.ok(S.nameSimilarity("GT16_nuvola_2015.ply", "GT16_nuvola_2015.e57") > 0.9,
    "stesso nome, altra estensione: quasi uguale — per ORDINARE");
  assert.ok(S.nameSimilarity("nuvola.ply", "tileset.zip") < 0.3);
  // …e la somiglianza NON è un'accettazione: due file identici di nome e
  // diversi di contenuto restano due file diversi, cosa che solo l'impronta sa
  assert.notEqual(digestOf("A"), digestOf("B"));
});

prova("un .stamp.json che non è un timbro NON è «nessun timbro»", () => {
  assert.throws(() => S.validateStamp({ graphs: {} }), /different species/);
  assert.throws(() => S.validateStamp({ stamp: 99, self: { resource_id: "x" } }),
                /version/);
  assert.throws(() => S.validateStamp({ stamp: 1, self: {} }), /resource_id/);
});

// ── E5 · il nodo col punto interrogativo ────────────────────────────────────

console.log("\n· E5 — l'assenza con un nome");

await provaAsync("un genitore che non si risolve diventa un nodo col ?", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  const root = {
    stamp: 1,
    self: { resource_id: "res:mesh", digest: `sha256:${digestOf("BYTES-A")}` },
    from: [{ resource_id: "res:nuvola", digest: "sha256:" + "a1".repeat(32),
             label: "GT16 · nuvola 2015" }],
    how: { process_id: "proc:1", technique: "decimation" },
  };
  const chain = await S.walkChain(root, "/p/mesh.glb", "/p");
  assert.equal(chain.missing.length, 1);
  const words = await S.identityOf(S.missingDigests
    ? S.missingDigests(chain) : V.missingDigests(chain));
  const scene = V.adaptChain(chain, words);
  assert.equal(scene.missing, 1);
  const ghost = scene.nodes.find((n) => n.id === "missing:res:nuvola");
  assert.ok(ghost, "il genitore mancante si DISEGNA");
  assert.ok(ghost.name.startsWith("? "), "e porta il punto interrogativo");
  // MOSTRA QUELLO CHE SI SA: identità, etichetta, forza dell'identità
  assert.equal(ghost.data.resource_id, "res:nuvola");
  assert.equal(ghost.data.checksum, "sha256:" + "a1".repeat(32));
  assert.ok(ghost.name.includes("GT16 · nuvola 2015"));
  assert.equal(ghost.data.identity_strength, "verifiable");
  // …e la FRASE viene dalla libreria, non composta qui
  assert.equal(ghost.data.identity_claim, "«verifiable»");
  const link = scene.edges.find((e) => e.target === "missing:res:nuvola");
  assert.ok(link?.data?.unresolved, "il legame porta il marcatore del tratteggio");
});

prova("un'identità `comparable` NON diventa «verificata»", () => {
  const chain = { root: { stamp: 1, self: { resource_id: "a" }, from: [] },
                  rootPath: "/p/a", resolved: new Map(),
                  missing: [{ resource_id: "b", digest: "emstruct1:0f1e" }],
                  links: [], hashed: 0 };
  chain.root.from = chain.missing;
  chain.root.how = { process_id: "p" };
  const words = new Map([["emstruct1:0f1e", {
    scheme: "emstruct1", value: "0f1e", strength: "comparable",
    verifiable: false, claim: "this tells you if it changed, not that it is the same one",
  }]]);
  const scene = V.adaptChain(chain, words);
  const ghost = scene.nodes.find((n) => n.id === "missing:b");
  assert.equal(ghost.data.identity_strength, "comparable");
  assert.ok(!/verified|verificato/i.test(ghost.data.identity_claim));
});

prova("senza il bridge non si INDOVINA la forza dell'identità", () => {
  const chain = { root: { stamp: 1, self: { resource_id: "a" },
                          from: [{ resource_id: "b", digest: "sha256:ff" }],
                          how: { process_id: "p" } },
                  rootPath: "/p/a", resolved: new Map(),
                  missing: [{ resource_id: "b", digest: "sha256:ff" }],
                  links: [], hashed: 0 };
  const scene = V.adaptChain(chain, new Map());   // nessuna risposta
  const ghost = scene.nodes.find((n) => n.id === "missing:b");
  assert.equal(ghost.data.identity_strength, null,
    "`sha256:` in testa NON basta: la regola sta in s3Dgraphy e va chiesta");
  assert.match(ghost.data.identity_claim, /cannot say/);
});

// ── E6 · la riservatezza ────────────────────────────────────────────────────

console.log("\n· E6 — una pista private non esce");

const PERSONA = "mrossi";
const ENTE = "Fondazione Ansaldo";
const PERCORSO = `/Users/${PERSONA}/lavori/${ENTE}/2015/nuvola.ply`;

prova("nessuna delle TRE stringhe compare in ciò che esce", () => {
  const h = H.newHints("sha256:aa");
  H.noteSeen(h, "s3://em-assets/res_91c2/nuvola.ply", { when: "2026-09-14T09:12:00Z" });
  H.noteSeen(h, PERCORSO, { machine: "mbp-ed", when: "2026-09-14T18:40:11Z" });
  // SUL TESTO INTERO e non sulle chiavi: un percorso può nascondersi in un campo
  // che nessuno ha pensato di filtrare, e un'asserzione sulle chiavi non lo vede
  const testo = JSON.stringify(H.forExport(h));
  assert.ok(!testo.includes(PERCORSO), "il percorso");
  assert.ok(!testo.includes(PERSONA), "il nome della persona");
  assert.ok(!testo.includes(ENTE), "il nome dell'ente");
  assert.ok(!testo.includes("mbp-ed"), "e nemmeno il nome della macchina");
  assert.ok(testo.includes("s3://em-assets/res_91c2/nuvola.ply"),
            "…mentre la pista pubblica viaggia");
  assert.deepEqual(H.privateLocators(h), [PERCORSO],
    "e il registro DI CASA le tiene tutte: esce una copia");
});

prova("la porta verso l'esterno NON ha un interruttore", () => {
  assert.equal(H.forExport.length, 1,
    "`forExport(hints)` prende un argomento solo: nessun `{keepPrivate}` da " +
    "passare, perché una porta che si può aprire a metà un giorno si apre a metà");
  const src = codice("stamp-hints.ts");
  assert.ok(!/forExport\s*\([^)]*,/.test(src),
    "nessuna chiamata a forExport con un secondo argomento");
});

prova("il dubbio va sempre verso `private`", () => {
  assert.equal(H.scopeFor("s3://b/x"), "public");
  assert.equal(H.scopeFor("https://h/x"), "public");
  assert.equal(H.scopeFor("/Users/x/y"), "private");
  assert.equal(H.scopeFor("blend://Scene/US01"), "private");
  assert.equal(H.scopeFor("qualcosa-che-non-riconosco"), "private",
    "sconosciuto ⇒ privato: sbagliare di là costa il nome utente di qualcuno");
});

prova("le piste non si cancellano, invecchiano", () => {
  const modulo = Object.keys(H);
  for (const proibito of ["forget", "prune", "fix", "repair", "removeHint",
                          "cleanup", "validateLocators"]) {
    assert.ok(!modulo.includes(proibito),
      `\`${proibito}\` non deve esistere: un file spostato non è un errore da ` +
      `correggere, è un fatto da riosservare`);
  }
  const h = H.newHints("sha256:aa");
  H.noteSeen(h, PERCORSO, { machine: "m", when: "2026-09-14T09:00:00Z" });
  H.noteSeen(h, PERCORSO, { machine: "m", when: "2026-09-20T09:00:00Z" });
  assert.equal(h.seen.length, 1, "riosservare AGGIORNA");
  assert.equal(h.seen[0].when, "2026-09-20T09:00:00Z");
  H.noteSeen(h, PERCORSO, { machine: "fisso", when: "2026-09-20T10:00:00Z" });
  assert.equal(h.seen.length, 2, "…ma un'altra macchina è un'altra pista");
});

// ── E5/E8 · nessun percorso scrive dentro un .stamp.json ────────────────────

console.log("\n· la guardia strutturale, e il suo controesempio");

function codice(file) {
  return readFileSync(`${SRC}${file}`);
}
import { readFileSync as _rfs } from "node:fs";
function readFileSync(p) { return _rfs(p, "utf8"); }

/**
 * LA REGOLA, resa una proprietà che una macchina può vedere.
 *
 * Scrivere, da questo programma, vuol dire una cosa sola: una `fetch` con un
 * metodo che non è GET. Il bridge non ha nessun'altra porta verso il disco — non
 * esiste un `/fs/write` — quindi l'insieme delle scritture possibili è
 * l'insieme delle fetch non-GET, ed è finito e ispezionabile.
 *
 * La guardia chiede che ognuna di quelle vada a una rotta dell'elenco bianco, e
 * che l'elenco non contenga niente che possa comporre un percorso di timbro.
 * `stampPathFor` — l'unica funzione che sa scrivere `.stamp.json` — non deve
 * comparire in nessuna di quelle chiamate.
 */
function scrittureDi(src) {
  const out = [];
  // `fetch(` seguito, entro la stessa chiamata, da un `method:` che non è GET.
  for (const m of src.matchAll(/fetch\(([\s\S]{0,600}?)\n\s*\}\);/g)) {
    const blocco = m[1];
    const metodo = blocco.match(/method:\s*"([A-Z]+)"/);
    if (!metodo || metodo[1] === "GET") continue;
    const rotta = blocco.match(/\$\{await bridge\(\)\}(\/[\w/-]+)/);
    out.push({ rotta: rotta ? rotta[1] : "(rotta non letterale)", blocco });
  }
  return out;
}

const ROTTE_DI_SCRITTURA = new Set(["/stamp/hints", "/stamp/identity"]);

function nessunaScritturaDiTimbri(src, dove) {
  const errori = [];
  for (const w of scrittureDi(src)) {
    if (!ROTTE_DI_SCRITTURA.has(w.rotta))
      errori.push(`${dove}: scrittura verso una rotta non consentita (${w.rotta})`);
    if (/stampPathFor|STAMP_SUFFIX|\.stamp\.json/.test(w.blocco))
      errori.push(`${dove}: una scrittura compone un percorso di TIMBRO`);
  }
  return errori;
}

prova("nessun modulo del timbro scrive verso un .stamp.json", () => {
  const errori = [];
  for (const f of ["stamp.ts", "stamp-hints.ts", "views/stamps.ts"])
    errori.push(...nessunaScritturaDiTimbri(codice(f), f));
  assert.deepEqual(errori, [], errori.join("\n"));
});

prova("IL CONTROESEMPIO: la stessa guardia FALLISCE su codice che lo farebbe", () => {
  // Deliberato, e scritto come lo scriverebbe qualcuno in buona fede fra sei
  // mesi: «tanto il timbro ce l'ho, gli aggiungo il percorso che ho appena
  // trovato». È la riga che tutta la notte esiste per rendere impossibile.
  const cattivo = `
    async function patchStamp(path, stamp) {
      const res = await fetch(\`\${await bridge()}/stamp/hints\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: stampPathFor(path), hints: stamp }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.length > 0,
    "una guardia che non vede QUESTO non sta guardando niente");
  assert.match(errori[0], /percorso di TIMBRO/);
});

prova("IL CONTROESEMPIO 2: una rotta di scrittura nuova non passa in silenzio", () => {
  const cattivo = `
    async function salva(path, body) {
      const res = await fetch(\`\${await bridge()}/fs/write\`, {
        method: "POST",
        body: JSON.stringify({ path, body }),
      });
      return res.ok;
    }`;
  const errori = nessunaScritturaDiTimbri(cattivo, "controesempio");
  assert.ok(errori.some((e) => /rotta non consentita/.test(e)),
    "una porta nuova verso il disco deve essere una decisione, non una riga");
});

await provaAsync("e in esecuzione: scrivere una pista su un percorso di timbro SOLLEVA",
  async () => {
    const files = new Map();
    fintoDisco(files);
    await assert.rejects(
      () => H.writeHints("/p/mesh.glb.stamp.json", H.newHints("sha256:aa")),
      /immutable record/);
  });

await provaAsync("una ricerca riuscita scrive una PISTA, e solo quella", async () => {
  const files = new Map();
  files.set("/p/mesh.glb", "BYTES-A");
  fintoDisco(files);
  const scritture = fintoDisco(files);
  const esito = await H.recordFound(`sha256:${digestOf("BYTES-A")}`,
                                    "/altrove/nuvola.ply",
                                    { anchor: "/p/mesh.glb" });
  assert.ok(esito.written);
  assert.equal(scritture.length, 1);
  assert.equal(scritture[0].path, "/p/mesh.glb.hints.json");
  assert.ok(!scritture.some((w) => w.path.endsWith(".stamp.json")));
  assert.equal(scritture[0].hints.seen[0].scope, "private",
    "un percorso su disco è privato, e ci resta");
});

// ── E7 · le tre classi ──────────────────────────────────────────────────────

console.log("\n· E7 — le tre classi, e la terza è la normalità");

prova("il referto ha una classe per ognuna delle tre", () => {
  const src = codice("main.ts");
  for (const chiave of ["stamp.classPaired", "stamp.classStampNoBytes",
                        "stamp.classNoStamp"])
    assert.ok(src.includes(chiave), `manca la classe ${chiave}`);
  const css = readFileSync(`${SRC}style.css`);
  // …e la terza NON è rossa: il colore È la specifica
  assert.match(css, /\.stamp-report-row\.plain b \{ color: inherit; \}/,
    "«byte senza timbro» è lo stato normale e non deve avere un colore d'allarme");
  assert.match(css, /\.stamp-report-row\.broken b \{ color: #b3261e; \}/,
    "l'unico rosso è per un .stamp.json che non è un timbro");
});

prova("un timbro senza byte NON indovina la causa", () => {
  const i18n = codice("i18n.ts");
  assert.match(i18n,
    /moved, renamed out of this tree, deleted or modified/,
    "le quattro possibilità sono elencate COME possibilità");
  assert.ok(!/stamp\.classStampNoBytesNote[^\n]*\b(was moved|is missing|deleted\.)/.test(i18n),
    "…e nessuna delle quattro è affermata");
});

console.log(`\n✔ ${fatte} prove\n`);
