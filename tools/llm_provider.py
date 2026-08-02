#!/usr/bin/env python3
"""Provider-neutral seam for calling a language model, for em-bridge (N5).

**Why this lives here and not in s3Dgraphy.** s3Dgraphy is pure: no web
framework, no network, no optional heavy SDKs. That is what makes it embeddable
in Blender, in a notebook and in this bridge without dragging anything along.
A model call is network, so it lives in the bridge — which is already the local
access layer and already bundles s3Dgraphy.

**Provider-neutral.** :class:`LLMProvider` is the whole contract: one method.
Claude is the first adapter, not the interface — adding OpenAI, a local
llama.cpp, or a stub for tests means registering another adapter, never editing
a caller.

**The key.** Read from the environment at call time, never persisted, never
logged, never returned in a response, and never sent to the frontend. If it is
missing the provider says so with a clear error instead of failing somewhere
deeper.

**What is sent.** Only the briefing built by
``s3dgraphy.api.build_narrative_generation_context`` — one activity, its units,
their epochs and the evidence already recorded for them. Not the whole graph,
not the file, not the user's paths. Documented in :func:`describe_payload`.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

DEFAULT_TIMEOUT = 120


class LLMError(RuntimeError):
    """The provider could not produce a completion. Carries an HTTP-ish status
    so the bridge can answer 501 (not configured) apart from 502 (upstream
    failed) — the two mean very different things to whoever pressed the button.
    """

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class LLMProvider:
    """One call: turn a system instruction, a prompt and a context into text.

    Implementations must not mutate the context, must not log the key, and must
    raise :class:`LLMError` rather than leaking a transport exception.
    """

    #: shown in responses and logs so a reader knows what wrote a draft
    name = "abstract"
    model = ""

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        raise NotImplementedError


# ── registry ──────────────────────────────────────────────────────────────────

_PROVIDERS: Dict[str, Callable[..., LLMProvider]] = {}


def register_provider(name: str):
    def _wrap(factory: Callable[..., LLMProvider]):
        _PROVIDERS[name] = factory
        return factory
    return _wrap


def available_providers() -> List[str]:
    return sorted(_PROVIDERS)


def get_provider(name: Optional[str] = None, **opts) -> LLMProvider:
    """Build the requested provider, or the one the environment selects.

    Selection order: the explicit argument, then ``EM_LLM_PROVIDER``, then
    ``claude``. Nothing is hard-wired at a call site.
    """
    key = (name or os.environ.get("EM_LLM_PROVIDER") or "claude").strip()
    factory = _PROVIDERS.get(key)
    if factory is None:
        raise LLMError(
            f"unknown LLM provider '{key}'; available: "
            f"{', '.join(available_providers()) or 'none'}", status=400)
    return factory(**opts)


# ── where the key comes from ──────────────────────────────────────────────────
#
# Two sources, and they exist because the two ways of running EMStudio have
# different places to keep a secret:
#
#   * **desktop** — the OS keychain, injected into this process's environment
#     when the Tauri shell spawns it. Persistent, and this process only ever
#     sees it as `$ANTHROPIC_API_KEY`.
#   * **browser dev** — no keychain to write to, so the user pastes the key and
#     it lives HERE, in a module variable, for as long as this process does.
#     Nothing writes it to disk, to a log, or back down the wire.
#
# The session key wins when both are set: it is the one the user just typed, so
# it is the one they meant. Neither is ever readable from outside — there is no
# endpoint that returns a key, only one that says whether there is one.

_SESSION_KEY: str = ""


def set_session_key(key: str) -> None:
    """Hold a key in memory for this process's lifetime. Not persisted."""
    global _SESSION_KEY
    _SESSION_KEY = (key or "").strip()


def clear_session_key() -> None:
    global _SESSION_KEY
    _SESSION_KEY = ""


def api_key_source() -> str:
    """`session` | `env` | `none` — never the key."""
    if _SESSION_KEY:
        return "session"
    if os.environ.get("ANTHROPIC_API_KEY", "").strip():
        return "env"
    return "none"


def resolve_api_key() -> str:
    """The key to use, session first. Returns "" when there is none.

    Read at CALL time, not at construction: in dev the user can paste a key
    into a bridge that is already running, and a provider built a moment
    earlier must still see it.
    """
    return _SESSION_KEY or os.environ.get("ANTHROPIC_API_KEY", "").strip()


# ── Claude (Anthropic) — the first adapter ────────────────────────────────────

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
#: The default is a **Sonnet**, not an Opus (E.D., 2026-08-02). The task is
#: rule-simple — the template supplies the structure, the model supplies the
#: prose, and a named human is the final gate before anything counts as
#: endorsed. Paying Opus rates for a draft somebody must read anyway is not a
#: quality decision, it is a habit. Opus stays selectable per request via
#: `EM_LLM_MODEL` or the `model` argument, and this is the ONLY place the name
#: is written.
DEFAULT_CLAUDE_MODEL = "claude-sonnet-5"


@register_provider("claude")
class ClaudeProvider(LLMProvider):
    """Anthropic Messages API over plain urllib.

    No SDK on purpose: one POST with a JSON body does not justify a dependency
    in a bridge that has to stay installable next to Blender's Python.
    """

    name = "claude"

    def __init__(self, model: Optional[str] = None,
                 max_tokens: int = 1200, timeout: int = DEFAULT_TIMEOUT,
                 api_key: Optional[str] = None):
        self.model = model or os.environ.get("EM_LLM_MODEL",
                                             DEFAULT_CLAUDE_MODEL)
        self.max_tokens = max_tokens
        self.timeout = timeout
        # An explicit key wins; otherwise resolved at call time, so a key
        # pasted after this provider was built is still picked up.
        self._api_key = api_key or ""

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        api_key = self._api_key or resolve_api_key()
        if not api_key:
            raise LLMError(
                "no API key: paste one in EMStudio's Settings (AI provider), "
                "or export ANTHROPIC_API_KEY before starting em-bridge. "
                "It is read at call time and never written to disk.",
                status=501)
        body = json.dumps({
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": system,
            "messages": [{
                "role": "user",
                "content": f"{prompt}\n\n<context>\n"
                           f"{json.dumps(context, ensure_ascii=False, indent=2)}"
                           f"\n</context>",
            }],
        }).encode("utf-8")
        request = urllib.request.Request(
            ANTHROPIC_URL, data=body, method="POST",
            headers={
                "content-type": "application/json",
                "anthropic-version": ANTHROPIC_VERSION,
                "x-api-key": api_key,
            })
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = ""
            try:
                detail = exc.read().decode("utf-8")[:400]
            except Exception:  # pragma: no cover - defensive
                pass
            # The key never appears in this message: only the status and the
            # provider's own text, which does not echo credentials.
            raise LLMError(f"Anthropic returned {exc.code}: {detail}",
                           status=502) from None
        except urllib.error.URLError as exc:
            raise LLMError(f"could not reach Anthropic: {exc.reason}",
                           status=502) from None

        parts = [c.get("text", "") for c in payload.get("content", [])
                 if c.get("type") == "text"]
        text = "".join(parts).strip()
        if not text:
            raise LLMError("the model returned no text", status=502)
        return text


@register_provider("echo")
class EchoProvider(LLMProvider):
    """A provider that writes a deterministic paragraph from the context.

    Not a mock hidden in the tests: a real, selectable provider
    (``EM_LLM_PROVIDER=echo``) so the whole endpoint — context building, write
    back, attribution, prompt-as-source, unendorsed state — can be exercised
    end to end with no key, no network and no cost. What it writes is obviously
    machine-made, which is the point.
    """

    name = "echo"
    model = "echo-1"

    def generate(self, system: str, prompt: str,
                 context: Dict[str, Any]) -> str:
        activity = (context.get("activity") or {}).get("name", "questa attività")
        actions = [a.get("name", "?") for a in context.get("actions") or []]
        epochs = [e.get("name", "?") for e in context.get("epochs") or []]
        bits = [f"[bozza generata] {activity}"]
        if actions:
            bits.append("comprende " + ", ".join(actions))
        if epochs:
            bits.append("collocata in " + ", ".join(epochs))
        return "; ".join(bits) + "."


# ── the prompt, and what leaves the machine ───────────────────────────────────

SYSTEM_PROMPT = (
    "You are helping an archaeologist draft one chapter of a site narrative "
    "from an Extended Matrix graph. You are given a briefing: an activity, the "
    "stratigraphic units it comprises in the order they occurred, the epochs "
    "they belong to, and the evidence recorded for each. Write the chapter's "
    "opening prose in the language of the briefing. Obey the constraints "
    "given: say only what the briefing supports, keep uncertainty as "
    "uncertainty, and invent nothing. Your text will be marked as an "
    "unendorsed AI draft until a named human validates it."
)


def build_prompt(context: Dict[str, Any], extra: str = "") -> str:
    """The user-side prompt. Kept as a function so the exact text can be
    recorded as the prompt-source — a reader must be able to see what was
    asked, not merely that something was asked."""
    activity = (context.get("activity") or {}).get("name", "")
    lines = [f"Write the narrative opening for the activity «{activity}»."]
    constraints = context.get("constraints") or []
    if constraints:
        lines.append("Constraints:")
        lines.extend(f"- {c}" for c in constraints)
    if extra.strip():
        lines.append(f"Additional instruction from the author: {extra.strip()}")
    return "\n".join(lines)


def describe_payload(context: Dict[str, Any]) -> Dict[str, Any]:
    """What is about to be sent, in numbers — so it can be shown to the user
    before it leaves, and recorded after. Privacy is not a promise, it is an
    inventory."""
    return {
        "activity": (context.get("activity") or {}).get("id"),
        "actions": len(context.get("actions") or []),
        "epochs": len(context.get("epochs") or []),
        "sources": len(context.get("sources") or []),
        "includes": ["activity", "actions", "epochs", "evidence", "sources"],
        "excludes": ["the rest of the graph", "file paths", "credentials",
                     "anything outside the named activity"],
    }
