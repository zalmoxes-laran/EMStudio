// SORGENTI — one reader for every fence that has to look inside a source.
//
//   import * as S from "./sorgenti.mjs";
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
//
// A fence that searches for a WORD inside a source read as text measures the
// file, not the program. In `stratigraph-server` that defect bit nine times in
// a month before it was named; here it is measured rather than assumed, and
// these are the honest lines that made a fence fail — each one constructed and
// run, not imagined:
//
//   check-shelf          `const unsubscribe = …`        → “the value
//                        "subscribe" is never mentioned”
//   check-mapping-editor `const ACCENT = "#00A8FF"`     → “the code never names
//                        the CIDOC class A8”
//   check-mapping-editor `const WARM = "#E19B4C"`       → “…E19”
//   check-mapping-editor `const LOCALE = "en-US"`       → “the code never names
//                        US” — and that fence already used `\bUS\b`
//   check-focus-parity   `#shelf-barcode { … }`         → “#shelf-bar still has
//                        rules”
//   check-focus-parity   `--display-muted`              → “.hdr-passive changes
//                        a box metric”
//   check-narrative      `padding` on `.nv-picker`      → “#narrative-view
//                        redeclares the page padding”
//   check-members        a COMMENT saying “deliberately NOT
//                        https://em.example.org”        → “no address is
//                        written into the code”
//
// The last one is the whole lesson in one line: the fence's own message warns
// that a spelled URL goes wrong on somebody else's node, and a developer who
// writes that warning down as a comment makes the fence fail.
//
// And the discovery that keeps the rule from being superficial: **`1.d3.0`, a
// version number, satisfies `\bd3\.`** — `\b` sits between a dot and a letter.
// A word boundary is a MINIMUM, not a solution.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE THREE FORCES
//
//   1 · THE PROGRAM   — `typescript`, already a devDependency, parses the real
//                       thing. An identifier is an identifier, a string literal
//                       is a whole literal, a function body has real bounds.
//                       Measured: 67 ms to parse the 726 KB `main.ts` and 3 ms
//                       to walk it — against a 7 s fence suite.
//   2 · THE DOCUMENT  — `linkedom` for HTML (already a devDependency), and
//                       brace counting for CSS. A cascade is queried, not
//                       sliced with `indexOf`.
//   3 · THE WORD      — `parola()`, where nothing better is possible, WITH the
//     BOUNDARY          reason it stopped there. A declared minimum is worth
//                       more than an undeclared maximum.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE TWIN, AND HOW THE TWO ARE KEPT TOGETHER
//
// `stratigraph-server/tests/sorgenti.py` is the same idea in Python, written on
// 4 October. They CANNOT be one implementation — two languages, two parsers —
// so what holds them together is declared here and there, and nowhere else:
//
//   · the same FILE NAME (`sorgenti`), so one leads to the other;
//   · the same three forces, in the same order, with the same names;
//   · the same corpus of constructed false positives, listed above and in the
//     Python module's docstring — a new one goes in BOTH lists;
//   · this correspondence table, which is the only place a primitive on one
//     side can be matched to its twin on the other:
//
//     this file                       tests/sorgenti.py         the force
//     ─────────────────────────────────────────────────────────────────────
//     parola(termine)                 parola(termine)           the boundary
//     blocchiCss(css, selettore)      blocco_css(source, ap.)   the document
//     dichiara(css, sel, prop)        dichiara(source, p, v)    the document
//     indirizzi(source)               indirizzi(source)         the document
//     nomina(src, nome)               chiama_python / parola    the program
//     chiama(src, "a.b")              chiama_python(src, nomi)  the program
//     importaDa(src, modulo)          importa_python(src, mod)  the program
//     corpoDi(src, funzione)          —  (Python has no twin)   the program
//     elementi(html, sel)             —  (Python has no DOM)    the document
//     senzaProsa(src)                 senza_prosa(source)       hygiene, DEMOTED
//     prosa(frase, termine)           —  (this repo only)       the SUBJECT is prose
//
// Divergence in silence is the only outcome nobody wants; divergence that is
// written down is just two languages.
// ═══════════════════════════════════════════════════════════════════════════

import ts from "typescript";
import { parseHTML } from "linkedom";

// ── 3 · the word boundary, declared as a minimum ─────────────────────────────

/**
 * A word-boundary regexp for `termine`. **This is the weakest of the three
 * forces and it is here so that a fence which uses it says so.**
 *
 * What it does NOT solve, measured: `\b` sits between a punctuation mark and a
 * letter, so `\bd3\b` matches inside the version number `1.d3.0`, and `\bUS\b`
 * matches inside the locale tag `"en-US"`. Reach for `nomina()` or
 * `stringheLetterali()` whenever the haystack is a program.
 */
export const parola = (termine) =>
  new RegExp(`\\b${termine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

/**
 * Comments blanked. **Hygiene, not a force** — it is here because five fences
 * had written their own copy, and one copy that everybody can see is better
 * than five nobody compares. It answers nothing about a program: in
 * `stratigraph-server`, eight of the nine recorded bites were on real code.
 */
export const senzaProsa = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

/**
 * A SENTENCE MEANT FOR A PERSON, searched for a word — and that is correct.
 *
 * The fourth thing, which the Python twin does not have: a fence whose subject
 * really is the prose. «Does this refusal still say "sign in"?» is a question
 * about a sentence somebody reads, and there is no program to parse. Such a
 * check is not repaired — it is NAMED, so nobody later rewrites it as a code
 * fence and nobody mistakes it for one of the eight false positives above.
 *
 *     ok(!prosa(refusal, "sign in"), "…")
 *
 * `termine` is matched case-insensitively, anywhere in the sentence, because
 * that is what reading a sentence means.
 */
export const prosa = (frase, termine) =>
  new RegExp(termine.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(frase ?? "");

// ── 1 · the program ──────────────────────────────────────────────────────────

const albero = (source, nome = "x.ts") =>
  ts.createSourceFile(nome, source, ts.ScriptTarget.Latest, true,
                      nome.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const cammina = (nodo, visita) => {
  visita(nodo);
  ts.forEachChild(nodo, (figlio) => cammina(figlio, visita));
};

/**
 * Every string the program spells out: string literals, plain templates, and
 * the FIXED pieces of a template with substitutions.
 *
 * The last kind is not a detail — `` `${node}/work/?room=${id}` `` spells
 * `/work/?room=` and a reader that only sees whole literals would say it does
 * not. Found by running it: check-members went red on a rule that was true.
 */
export function stringheLetterali(source) {
  const fuori = [];
  cammina(albero(source), (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      fuori.push(n.text);
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n))
      fuori.push(n.text);
  });
  return fuori;
}

/** Every identifier and property name the program writes down. */
export function identificatori(source) {
  const fuori = new Set();
  cammina(albero(source), (n) => {
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) fuori.add(n.text);
  });
  return fuori;
}

/**
 * Does the program NAME `nome` — as an identifier, a property, or a string
 * literal that IS that value?
 *
 * The question a fence like «this module knows nothing about the EM language»
 * actually wants. A whole literal, so `"en-US"` is not `"US"`; an identifier,
 * so `unsubscribe` is not `subscribe`; and `"#00A8FF"` is not the CIDOC class
 * `A8`, because a colour is one literal and a class name is another.
 */
export function nomina(source, nome) {
  if (identificatori(source).has(nome)) return true;
  return stringheLetterali(source).includes(nome);
}

/** Does the program CALL `a.b(…)` (or `b(…)` for a bare name)? */
export function chiama(source, percorso) {
  const pezzi = percorso.split(".");
  let trovato = false;
  cammina(albero(source), (n) => {
    if (!ts.isCallExpression(n)) return;
    let e = n.expression;
    const catena = [];
    while (ts.isPropertyAccessExpression(e)) {
      catena.unshift(e.name.text);
      e = e.expression;
    }
    if (ts.isIdentifier(e)) catena.unshift(e.text);
    else if (e.kind === ts.SyntaxKind.ThisKeyword) catena.unshift("this");
    if (catena.length >= pezzi.length &&
        catena.slice(-pezzi.length).join(".") === percorso) trovato = true;
  });
  return trovato;
}

/** Does the program IMPORT from `modulo` (exact specifier)? */
export function importaDa(source, modulo) {
  let trovato = false;
  cammina(albero(source), (n) => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) &&
        n.moduleSpecifier.text === modulo) trovato = true;
  });
  return trovato;
}

/**
 * The real text of a function's body, with real bounds.
 *
 * Replaces `src.slice(src.indexOf("function f"), src.indexOf("\\n}\\n"))`,
 * which ends at the first line that happens to start with a brace — a nested
 * object literal at column 0, or a template string, and the fence has been
 * reading somebody else's function ever since. `""` when there is no such
 * function, so a renamed function makes an assertion FAIL rather than pass on
 * an empty string.
 */
export function corpoDi(source, nome) {
  const sf = albero(source);
  let testo = "";
  cammina(sf, (n) => {
    if (testo) return;
    const suo =
      (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name?.getText(sf) === nome;
    const assegnato =
      ts.isVariableDeclaration(n) && n.name?.getText(sf) === nome &&
      n.initializer && (ts.isArrowFunction(n.initializer) ||
                        ts.isFunctionExpression(n.initializer));
    if (suo && n.body) testo = n.body.getText(sf);
    else if (assegnato && n.initializer.body) testo = n.initializer.body.getText(sf);
  });
  return testo;
}

/**
 * A function's body as a snippet every other primitive here can read.
 *
 * One composition instead of five variants: `chiama(dentro(main, "f"), "fetch")`
 * asks whether THAT function fetches, and `indirizziNelCodice(dentro(main, "f"))`
 * asks whether it spells an address — both without a second parser and without
 * a fence slicing the file by hand.
 */
export function dentro(source, nome) {
  const corpo = corpoDi(source, nome);
  return corpo ? `function __(){${corpo.replace(/^\{/, "").replace(/\}$/, "")}}` : "";
}

// ── 2 · the document ─────────────────────────────────────────────────────────

/** The HTML, as a document. `linkedom` is already a devDependency. */
export const documento = (html) => parseHTML(html).document;

/** Elements matching a CSS selector — a query, not a regexp over the markup. */
export const elementi = (html, selettore) =>
  [...documento(html).querySelectorAll(selettore)];

/**
 * EVERY rule body whose selector list contains `selettore`, in source order,
 * found by counting braces — so a nested block or an `@media` does not end one
 * early, and a rule shorter than a window does not leak the next one in.
 *
 * All of them, because that is what a cascade is. Measured on this stylesheet:
 * `.nv-chapter-tools` is declared twice, once in a group and once alone with
 * the height it reserves. A reader that returns the first rule answers "no
 * height" and is wrong about the page; the fence this replaced happened to find
 * the second because it searched for the literal `".nv-chapter-tools {"`, which
 * is the same accident wearing the other face.
 *
 * `selettore` is matched against the whole selector list, split on commas and
 * trimmed: `#shelf-bar` does not match `#shelf-barcode`.
 */
export function blocchiCss(css, selettore) {
  const netto = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const fuori = [];
  for (let i = 0; i < netto.length; i++) {
    if (netto[i] !== "{") continue;
    // walk back to the start of this rule's selector list
    let inizio = i - 1;
    while (inizio >= 0 && netto[inizio] !== "}" && netto[inizio] !== "{") inizio--;
    const lista = netto.slice(inizio + 1, i).trim();
    let livello = 1, j = i + 1;
    while (j < netto.length && livello > 0) {
      if (netto[j] === "{") livello++;
      else if (netto[j] === "}") livello--;
      j++;
    }
    if (lista.split(",").map((s) => s.trim()).includes(selettore))
      fuori.push(netto.slice(i + 1, j - 1));
  }
  return fuori;
}

/** The FIRST such body, or `""`. Use `blocchiCss` unless you mean the first. */
export const bloccoCss = (css, selettore) => blocchiCss(css, selettore)[0] ?? "";

/**
 * Does any selector in the stylesheet TARGET this simple selector?
 *
 * Asked of the selectors alone, never of the file: `#shelf-bar` is not found in
 * `#shelf-barcode` (a constructed false positive above) and is found in
 * `.x > #shelf-bar:hover`. Within a selector the boundary is CSS's own — an
 * identifier may carry `-` and `_` — which is the word-boundary force applied
 * to a much smaller haystack, and it is declared as such.
 */
export function miraA(css, token) {
  const bordo = new RegExp(
    `(^|[\\s>+~,(])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  return [...selettori(css)].some((s) => bordo.test(s));
}

/** Every selector list the stylesheet declares, one entry per selector. */
export function selettori(css) {
  const netto = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const fuori = new Set();
  for (let i = 0; i < netto.length; i++) {
    if (netto[i] !== "{") continue;
    let inizio = i - 1;
    while (inizio >= 0 && netto[inizio] !== "}" && netto[inizio] !== "{") inizio--;
    const lista = netto.slice(inizio + 1, i).trim();
    if (!lista || lista.startsWith("@")) continue;
    for (const s of lista.split(",")) if (s.trim()) fuori.add(s.trim());
  }
  return fuori;
}

/**
 * The PROPERTIES a rule declares — names only, values dropped.
 *
 * The distinction that matters: `color: var(--display-muted)` declares `color`,
 * not `display`. Searching the block's text for the word `display` reads the
 * custom property's NAME and calls it a box metric.
 */
export function proprieta(css, selettore) {
  const fuori = new Set();
  for (const corpo of blocchiCss(css, selettore))
    for (const pezzo of corpo.split(";")) {
      const punto = pezzo.indexOf(":");
      if (punto < 0) continue;
      const nome = pezzo.slice(0, punto).trim();
      if (/^[-A-Za-z][-\w]*$/.test(nome)) fuori.add(nome);
    }
  return fuori;
}

/** Does `selettore` declare `prop`, and (optionally) with that value? */
export function dichiara(css, selettore, prop, val = null) {
  if (!proprieta(css, selettore).has(prop)) return false;
  if (val === null) return true;
  return blocchiCss(css, selettore).some((corpo) =>
    corpo.split(";").some((p) => {
      const punto = p.indexOf(":");
      return punto >= 0 && p.slice(0, punto).trim() === prop &&
             p.slice(punto + 1).trim() === val;
    }));
}

/**
 * Every address a source points at: `href` / `src` in markup, `@import` and
 * `url()` in a stylesheet, and whole URL-shaped string literals in a program.
 * The Python twin's `indirizzi` answers the same question for the same reason.
 */
export function indirizzi(source) {
  const fuori = new Set();
  for (const m of source.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/g))
    fuori.add(m[1]);
  for (const m of source.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g))
    fuori.add(m[1]);
  for (const m of source.matchAll(/\burl\(\s*["']?([^"')]+)["']?\s*\)/g))
    fuori.add(m[1].trim());
  return fuori;
}

/** The URL-shaped string literals a PROGRAM contains — a subset of the above. */
export const indirizziNelCodice = (source) =>
  stringheLetterali(source).filter((s) => /^[a-z][\w+.-]*:\/\/|^\/\/|localhost/i.test(s));

/**
 * Every call to `nome()` that can observe state which MOVED while the program
 * was waiting — the reads whose answer is «now», asked after a «now» went by.
 *
 * Why the compiler and not a search: the whole question is the FUNCTION
 * BOUNDARY. A read inside `addEventListener` is not «after» the `await` three
 * lines above it in the file — the handler is a fresh entry on a later event,
 * and there the environment is the honest answer. A text search cannot tell
 * those two apart, and would report the one case where ambient is CORRECT as
 * the defect. Measured on `main.ts`: the file spells `activeWin()` 57 times and
 * the program calls it 54 — three of them sit inside comments, one of which is
 * a comment WARNING against the pattern.
 *
 * How a body's entry is classified, because «a callback that runs later» is
 * not one thing:
 *
 *   · `await` / `yield` before the read, in THIS body        → exposed
 *   · the body is an argument to `then` `catch` `finally`
 *     `setTimeout` `setInterval` `requestAnimationFrame`
 *     `requestIdleCallback` `queueMicrotask`                  → exposed at entry
 *   · the body is an argument to `addEventListener`           → NOT exposed:
 *     a fresh event, where «now» is the question being asked
 *   · the body is an argument to `map` `forEach` `filter`
 *     `find` `some` `every` `reduce` `sort` `flatMap`         → it runs inside
 *     its caller, so it inherits the caller's state AT THE CALL
 *   · anything else (declared, assigned, handed to an unknown
 *     function that may store it)                             → timing unknown:
 *     reported separately by `raggiunteDopoUnaSospensione`, never silently
 *
 * Returns `[{ riga, funzione, motivo, dove }]`, sorted by line.
 */
export function dopoUnaSospensione(source, nome, nomeFile = "x.ts") {
  const sf = albero(source, nomeFile);
  const riga = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
  const sospese = [];
  for (const { chiamata, corpo } of chiamateDi(sf, nome)) {
    const e = espostaAllaPosizione(sf, chiamata.getStart(sf), corpo, new Set());
    if (e) sospese.push({ riga: riga(chiamata.getStart(sf)),
                          funzione: nomeFunzione(sf, corpo), ...e });
  }
  return sospese.sort((a, b) => a.riga - b.riga);
}

const FUNZIONE = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n) ||
  ts.isConstructorDeclaration(n);

const DIFFERISCONO = new Set(["then", "catch", "finally", "setTimeout", "setInterval",
  "requestAnimationFrame", "requestIdleCallback", "queueMicrotask"]);
const ASCOLTANO = new Set(["addEventListener"]);
const SCORRONO = new Set(["map", "forEach", "filter", "find", "findIndex", "findLast",
  "some", "every", "reduce", "reduceRight", "sort", "flatMap"]);

const contenitore = (n) => { let p = n.parent; while (p && !FUNZIONE(p)) p = p.parent; return p; };

function chiamateDi(sf, nome) {
  const fuori = [];
  cammina(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === nome)
      fuori.push({ chiamata: n, corpo: contenitore(n) ?? sf });
  });
  return fuori;
}

function nomeFunzione(sf, fn) {
  if (!fn || fn === sf) return "(modulo)";
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p)) return p.name.getText(sf);
  const su = contenitore(fn);
  return su ? `(dentro ${nomeFunzione(sf, su)})` : "(anonima)";
}

/** The call this function is an ARGUMENT of, with the name being called. */
function passataA(fn) {
  const p = fn.parent;
  if (!p || !ts.isCallExpression(p) || !p.arguments.includes(fn)) return null;
  let e = p.expression; const catena = [];
  while (ts.isPropertyAccessExpression(e)) { catena.unshift(e.name.text); e = e.expression; }
  if (ts.isIdentifier(e)) catena.unshift(e.text);
  return { chiamata: p, nome: catena.join("."), verbo: catena[catena.length - 1] };
}

/** `await` / `yield` written DIRECTLY in this body — a nested body is its own. */
function sospensioniDirette(sf, fn) {
  const corpo = fn.body ?? fn;
  const fuori = [];
  const giu = (n) => {
    if (n !== corpo && FUNZIONE(n)) return;
    if (ts.isAwaitExpression(n) || n.kind === ts.SyntaxKind.YieldExpression)
      fuori.push(n.getStart(sf));
    ts.forEachChild(n, giu);
  };
  ts.forEachChild(corpo, giu);
  return fuori.sort((a, b) => a - b);
}

function espostaAllaPosizione(sf, pos, fn, visti) {
  const riga = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
  if (!fn || fn === sf || visti.has(fn)) return null;
  visti.add(fn);
  const prima = sospensioniDirette(sf, fn).filter((p) => p < pos);
  if (prima.length)
    return { motivo: "await", dove: riga(prima[prima.length - 1]) };
  const via = passataA(fn);
  if (!via) return null;
  if (DIFFERISCONO.has(via.verbo))
    return { motivo: `richiamata di ${via.nome}`, dove: riga(via.chiamata.getStart(sf)) };
  if (ASCOLTANO.has(via.verbo)) return null;
  if (SCORRONO.has(via.verbo)) {
    // it runs INSIDE its caller, now: inherit the caller's state at the call
    const su = espostaAllaPosizione(sf, via.chiamata.getStart(sf),
                                   contenitore(via.chiamata), visti);
    return su ? { ...su, tramite: via.nome } : null;
  }
  // handed to something this reader cannot classify: it may run now, it may be
  // stored and run later. Not decided here and NOT swallowed — `tempoIgnoto`
  // reports it so a fence can require it to be named.
  return null;
}

/**
 * The reads whose body is handed to a function this reader cannot classify —
 * neither a known deferrer, nor a listener, nor a scan. Such a body may run
 * inside its caller or be stored and run an hour later, and the difference is
 * in the callee's source, not at this call.
 *
 * It exists so that `dopoUnaSospensione` can be OPTIMISTIC without being quiet:
 * measured on `main.ts`, exactly one read is of this shape — the listener given
 * to `onShelfChange`, which `shelf.ts` pushes onto a list and calls from
 * `changed()`. A fence that had simply assumed «runs now» would have been right
 * by luck and silent about it.
 */
export function tempoIgnoto(source, nome, nomeFile = "x.ts") {
  const sf = albero(source, nomeFile);
  const riga = (p) => sf.getLineAndCharacterOfPosition(p).line + 1;
  const fuori = [];
  for (const { chiamata, corpo } of chiamateDi(sf, nome)) {
    const via = corpo && corpo !== sf ? passataA(corpo) : null;
    if (via && !DIFFERISCONO.has(via.verbo) && !ASCOLTANO.has(via.verbo) &&
        !SCORRONO.has(via.verbo))
      fuori.push({ riga: riga(chiamata.getStart(sf)), passataA: via.nome });
  }
  return fuori.sort((a, b) => a.riga - b.riga);
}
