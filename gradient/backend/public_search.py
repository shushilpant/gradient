"""Public educational discovery when the general web search endpoint is unavailable.

Only the caller's public topic query is sent to Wikipedia and Crossref. Fetches
use the caller's bounded, DNS-pinned HTTPS transport; no separate HTTP client,
credentials, browser cookies, or ambient proxy is introduced here.
"""

from __future__ import annotations

import ipaddress
import http.client
import json
import re
import string
from html import unescape
from typing import Callable
from urllib.parse import quote, urlencode, urlsplit


JSON_TYPES = ("application/json",)
MAX_RESPONSE_CHARS = 500_000
_GENERIC_WORDS = set(
    "intro introduction tutorial tutorials help resource resources homework assignment "
    "assignments study guide guides explain explanation learning learn lecture lectures "
    "course courses answer answers example examples notes educational how to the a an "
    "of for and or with on in about".split()
)


def topic_query(query: str) -> str:
    """Remove generic request words that make encyclopedia search less relevant."""
    return " ".join(
        word for word in query[:250].split()
        if word.strip(string.punctuation).casefold() not in _GENERIC_WORDS
    ).strip()


def _text(value: object, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    value = re.sub(r"<(script|style)\b[^>]*>[\s\S]*?</\1\s*>", " ", value, flags=re.I)
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", value))).strip()[:maximum]


def _safe_source_url(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 3000:
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        host = parsed.hostname.rstrip(".").casefold()
        if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass  # Public hostnames are DNS-validated by the transport before reading.
        return value
    except ValueError:
        return None


def _json_response(fetch: Callable, url: str) -> dict:
    raw, _ = fetch(url, accepted_types=JSON_TYPES)
    if not isinstance(raw, str) or len(raw) > MAX_RESPONSE_CHARS:
        raise ValueError("The public search response exceeds the reading limit.")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("The public search provider returned an unexpected response.")
    return value


def _relevant(result: dict, query: str) -> bool:
    words = set(re.findall(r"[^\W_]+", query.casefold(), flags=re.UNICODE))
    if not words:
        return False
    text_words = set(re.findall(r"[^\W_]+", (result["title"] + " " + result["snippet"]).casefold(), flags=re.UNICODE))
    # Require more than one topic word for multiword topics, so a result about
    # an "Interval" vacation company cannot stand in for interval scheduling.
    matches = sum(1 for word in words if word in text_words or (len(word) >= 5 and any(item.startswith(word) for item in text_words)))
    return matches >= min(2, len(words))


def _wikipedia(query: str, count: int, fetch: Callable) -> list[dict]:
    url = "https://en.wikipedia.org/w/api.php?" + urlencode({
        "action": "query", "list": "search", "srsearch": query, "format": "json",
        "formatversion": "2", "srlimit": min(20, max(3, count * 2)), "srnamespace": "0", "srprop": "snippet",
    })
    data = _json_response(fetch, url)
    records = data.get("query", {}).get("search", []) if isinstance(data.get("query"), dict) else []
    if not isinstance(records, list):
        raise ValueError("Wikipedia returned an unexpected search result.")
    results = []
    for record in records:
        if not isinstance(record, dict) or record.get("ns", 0) != 0:
            continue
        title = _text(record.get("title"), 500)
        if not title:
            continue
        source_url = "https://en.wikipedia.org/wiki/" + quote(str(record["title"]).replace(" ", "_"), safe="()_-")
        result = {"title": title, "url": source_url, "snippet": _text(record.get("snippet"), 1800), "_provider": "Wikipedia"}
        if _relevant(result, query):
            results.append(result)
    return results


def _crossref(query: str, count: int, fetch: Callable) -> list[dict]:
    url = "https://api.crossref.org/works?" + urlencode({
        "query": query, "rows": min(20, max(3, count * 2)), "select": "title,URL,abstract,DOI",
    })
    data = _json_response(fetch, url)
    records = data.get("message", {}).get("items", []) if isinstance(data.get("message"), dict) else []
    if not isinstance(records, list):
        raise ValueError("Crossref returned an unexpected search result.")
    results = []
    for record in records:
        if not isinstance(record, dict):
            continue
        titles = record.get("title")
        title = _text(titles[0], 500) if isinstance(titles, list) and titles else ""
        source_url = _safe_source_url(record.get("URL"))
        if not title or not source_url:
            continue
        result = {"title": title, "url": source_url, "snippet": _text(record.get("abstract"), 2400), "_provider": "Crossref"}
        if _relevant(result, query):
            results.append(result)
    return results


def fallback(query: str, limit: int, fetch: Callable) -> list[dict]:
    """Discover actual encyclopedia pages and scholarly works, never invented URLs.

    Coverage is intentionally narrower than a general search engine. Provider
    failures are isolated; an empty result lets the caller disclose unavailable
    research. ``_provider`` tells the caller to disclose the fallback's coverage.
    """
    count = min(12, max(0, limit))
    topic = topic_query(query)
    if not count or not topic:
        return []
    encyclopedia, papers = [], []
    try:
        encyclopedia = _wikipedia(topic, count, fetch)
    except (ValueError, OSError, http.client.HTTPException):
        pass
    try:
        papers = _crossref(topic, count, fetch)
    except (ValueError, OSError, http.client.HTTPException):
        pass
    # Alternate sources so a three-result packet can include primary research
    # alongside a readable topic overview. Preserve provider relevance order.
    results, seen = [], set()
    for index in range(max(len(encyclopedia), len(papers))):
        for group in (encyclopedia, papers):
            if index >= len(group):
                continue
            result = group[index]
            if result["url"] in seen:
                continue
            seen.add(result["url"])
            results.append(result)
            if len(results) >= count:
                return results
    return results
