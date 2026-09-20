"""Provider registry / factory — the single place that knows about providers.

Adding a real provider later (spec §21):
  1. implement AIProvider in a new module (e.g. openai_provider.py)
  2. register it in PROVIDERS below
  3. set AI_PROVIDER=<key> (+ its API key) in .env
No route or service changes required.
"""
from __future__ import annotations

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.stub_provider import StubProvider
from app.services.ai.gemini_provider import GeminiProvider

PROVIDERS: dict[str, type[AIProvider]] = {
    StubProvider.name: StubProvider,
    GeminiProvider.name: GeminiProvider,
}


def get_provider() -> AIProvider:
    key = settings.AI_PROVIDER.lower()
    if key == "stub":
        return StubProvider()
    cls = PROVIDERS.get(key)
    if cls is None:
        raise ValueError(
            f"AI_PROVIDER={key!r} is not registered. Available: {sorted(PROVIDERS)}. "
            "Implement and register the provider in app/services/ai/provider.py."
        )
    return cls()
