// SORGENTI · the shared reader, proved on the eight false positives it exists
// to kill — and on their true twins.
//
//   node scripts/check-sorgenti.mjs
//
// The house rule is that a guard is demonstrated on a case that MAKES IT FIRE.
// A repaired guard needs the case twice: it must still bite on the real thing,
// and it must stop biting on the honest line. Both halves live here, next to
// each other, one pair per line — because a repair whose only evidence is a
// green suite is a repair nobody can check later.
//
// Every FALSO line below was written into the real source, run against the real
// fence, and seen to fail BEFORE the repair. They are not imagined.
import assert from "node:assert/strict";
import * as S from "./sorgenti.mjs";

let checks = 0;
const ok = (cond, what) => { assert.ok(cond, what); checks++; };

// ── the eight, each with its twin ────────────────────────────────────────────
//
// [ what the fence asks, the HONEST line that used to trip it, the REAL case ]

// 1 · check-shelf — «the module never names the badge value `subscribe`»
ok(!S.nomina("const unsubscribe = () => {};", "subscribe"),
   "shelf · `unsubscribe` is not the value `subscribe`");
ok(S.nomina('const BADGE = "subscribe";', "subscribe"),
   "shelf · …and the value itself still is");

// 2 · check-mapping-editor — «the code never names the CIDOC class A8»
ok(!S.nomina('const ACCENT = "#00A8FF";', "A8"),
   "mapping-editor · a colour is not a CIDOC class");
ok(!S.nomina('const WARM = "#E19B4C";', "E19"), "mapping-editor · …nor is E19");
ok(S.nomina('const CLASSE = "E31 Document";', "E31 Document"),
   "mapping-editor · …and a class written down still is");

// 3 · check-mapping-editor — «the code never names US»
//     the fence that broke here already used `\bUS\b`, with a comment saying so
ok(!S.nomina('const FALLBACK_LOCALE = "en-US";', "US"),
   "mapping-editor · `en-US` is a locale tag, not the EM type US");
ok(S.nomina('const t = "US";', "US"), "mapping-editor · …and the type still is");
ok(S.nomina("function EpochNode() {}", "EpochNode"),
   "mapping-editor · an identifier counts too, not only a literal");
//     and the boundary itself, shown failing where the parser does not
ok(S.parola("US").test("en-US"),
   "…and this is WHY: `\\bUS\\b` matches inside `en-US`. The word boundary is a "
   + "minimum. `1.d3.0` satisfies `\\bd3\\.` for the same reason.");

// 4 · check-focus-parity — «`#shelf-bar` keeps no rules»
ok(!S.miraA("#shelf-barcode { color: red; }", "#shelf-bar"),
   "focus-parity · a new element is not the removed one");
ok(S.miraA(".x > #shelf-bar:hover { color: red; }", "#shelf-bar"),
   "focus-parity · …and a rule that really targets it is found, in any position");

// 5 · check-focus-parity — «`.hdr-passive` changes no box metric»
{
  const METRICHE = ["padding", "margin", "font-size", "display", "height"];
  const cambia = (css) =>
    [...S.proprieta(css, ".hdr-passive")].filter((p) => METRICHE.includes(p));
  ok(cambia(".hdr-passive { color: var(--display-muted); }").length === 0,
     "focus-parity · a custom property NAMED --display-muted declares `color`");
  ok(cambia(".hdr-passive { padding: 4px; }").length === 1,
     "focus-parity · …and a real padding is still a box metric");
}

// 6 · check-narrative — «the id does not redeclare the page padding»
{
  const css = "#narrative-view {\n  position: absolute;\n}\n" +
              ".nv-picker {\n  padding: 2px;\n}\n";
  ok(!S.dichiara(css, "#narrative-view", "padding"),
     "narrative · the next rule's padding is the next rule's");
  ok(S.dichiara(css + "#narrative-view { padding: 3px; }",
                "#narrative-view", "padding"),
     "narrative · …and its own is its own");
}

// 7 · check-narrative — a cascade is read WHOLE, not at its first rule
{
  const css = ".a,\n.b { display: flex; }\n.a { min-height: 4px; }";
  ok(S.blocchiCss(css, ".a").length === 2,
     "narrative · `.a` is declared twice and both are read");
  ok(S.dichiara(css, ".a", "min-height", "4px"),
     "narrative · …so the height it reserves is found in the second");
}

// 8 · check-members — «no address is written into the code»
{
  const onesto = 'function f(){ /* NOT https://em.example.org */ open(u); }';
  const vero = 'function f(){ const F = "https://em.example.org"; }';
  ok(S.indirizziNelCodice(onesto).length === 0,
     "members · a comment that names an address is not an address");
  ok(S.indirizziNelCodice(vero).length === 1,
     "members · …and a spelled one is");
  //   the template's fixed pieces count too — found by running it
  ok(S.stringheLetterali("const u = `${n}/work/?room=${r}`;")
      .some((v) => v.includes("/work/?room=")),
     "members · a template with substitutions still spells what it spells");
}

// ── the function body, with real bounds ──────────────────────────────────────
{
  //  a nested object at column 0 — what `indexOf("\n}\n")` ends on
  const src = "function f() {\n  const o = {\n}\n;\n  void fetch(\"/v1\");\n}\n";
  ok(S.chiama(S.dentro(src, "f"), "fetch"),
     "the body reaches past a brace at column 0: the hand-cut version stopped there");
  ok(S.corpoDi(src, "nonEsiste") === "",
     "…and a function that is not there gives \"\", so a rename FAILS an assertion "
     + "instead of passing on an empty string");
}

// ── and the one that is NOT repaired, because its subject IS the prose ───────
ok(S.prosa("Sign in and open it again", "sign in"),
   "prosa · a sentence a person reads is searched for a word, and that is right");
ok(!S.prosa("This study is restricted.", "sign in"),
   "prosa · …and says so when the instruction is gone");

console.log(`sorgenti: ${checks} checks passed`);
