"""
llm.py

One place where model calls happen.

Every agent that needs a model goes through complete(), so retries, prompt
truncation, logging and cost control live in a single file instead of being
sprinkled through the agents. The client is created lazily so that importing
the package - and running the test suite - never requires an API key.
"""

import logging
import os
from typing import Optional

from dotenv import load_dotenv
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_random_exponential,
)

logger = logging.getLogger(__name__)

load_dotenv()

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_MAX_MESSAGE_LENGTH = 4000

_client = None


class LLMUnavailable(RuntimeError):
    """Raised when no API key is configured or the SDK is not installed."""


def truncate(text: str, limit: int = DEFAULT_MAX_MESSAGE_LENGTH) -> str:
    """Clip a prompt to communication.max_message_length from agents.yaml."""
    if limit and len(text) > limit:
        return text[: limit - 3] + "..."
    return text


def get_client():
    """Return a cached OpenAI client, or raise LLMUnavailable."""
    global _client

    if _client is not None:
        return _client

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise LLMUnavailable(
            "OPENAI_API_KEY is not set - copy .env.example to .env and fill it in"
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise LLMUnavailable("the openai package is not installed") from exc

    _client = OpenAI(api_key=api_key)
    return _client


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_random_exponential(multiplier=1, max=30),
    retry=retry_if_exception_type(Exception),
)
def _call(client, model: str, system: str, user: str) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return response.choices[0].message.content or ""


def complete(
    system: str,
    user: str,
    model: str = DEFAULT_MODEL,
    max_message_length: Optional[int] = DEFAULT_MAX_MESSAGE_LENGTH,
) -> str:
    """
    Run one chat completion with retry and prompt truncation.

    Raises LLMUnavailable when no key is configured, so callers can degrade
    gracefully instead of crashing the whole run.
    """
    client = get_client()
    limit = max_message_length or DEFAULT_MAX_MESSAGE_LENGTH

    logger.debug("llm call model=%s user_chars=%s", model, len(user))
    return _call(client, model, truncate(system, limit), truncate(user, limit))
