import json
import http.client
from urllib.parse import parse_qs, urlsplit

import pytest

from public_search import fallback, topic_query


def wikipedia(items):
    return {"query": {"search": items}}


def crossref(items):
    return {"message": {"items": items}}


def fake_fetch(wiki=None, papers=None):
    calls = []

    def fetch(url, *, accepted_types):
        calls.append((url, accepted_types))
        data = wiki if urlsplit(url).hostname == "en.wikipedia.org" else papers
        if isinstance(data, Exception):
            raise data
        if isinstance(data, str):
            return data, url
        return json.dumps(data), url

    fetch.calls = calls
    return fetch


def test_public_topic_removes_generic_request_words_without_changing_subject():
    assert topic_query("interval scheduling greedy algorithm tutorial") == "interval scheduling greedy algorithm"
    assert topic_query("An introduction to C++ memory management examples") == "C++ memory management"
    assert topic_query("homework help resources") == ""


def test_discovers_real_provider_records_and_preserves_title_url_and_plain_abstract():
    fetch = fake_fetch(
        wikipedia([{"title": "Interval scheduling", "snippet": 'A <span class="searchmatch">greedy algorithm</span> for intervals.', "ns": 0},
                   {"title": "Interval graph", "snippet": "Greedy algorithms for interval graphs.", "ns": 0}]),
        crossref([{"title": ["A Greedy Based Algorithm For The Interval Scheduling Problem"], "URL": "https://doi.org/10.26634/jcom.4.3.8286", "abstract": "<jats:p>Scheduling interval jobs with a greedy algorithm.</jats:p>"}]),
    )
    results = fallback("interval scheduling greedy algorithm tutorial", 3, fetch)
    assert [result["_provider"] for result in results] == ["Wikipedia", "Crossref", "Wikipedia"]
    assert results[0]["url"] == "https://en.wikipedia.org/wiki/Interval_scheduling"
    assert results[1]["url"] == "https://doi.org/10.26634/jcom.4.3.8286"
    assert results[1]["snippet"] == "Scheduling interval jobs with a greedy algorithm."
    assert "<span" not in results[0]["snippet"]
    assert all(types == ("application/json",) for _, types in fetch.calls)
    assert all("tutorial" not in parse_qs(urlsplit(url).query).get("srsearch", [""])[0] for url, _ in fetch.calls)


def test_filters_irrelevant_results_instead_of_treating_one_matching_word_as_evidence():
    fetch = fake_fetch(wikipedia([{"title": "Interval International vacation resorts", "snippet": "Enjoy a vacation with Interval."}]), crossref([]))
    assert fallback("interval scheduling greedy algorithm tutorial", 3, fetch) == []


@pytest.mark.parametrize("failure", [ValueError("challenge"), OSError("network unavailable"), http.client.HTTPException("invalid response"), "not json", "[1,2,3]"])
def test_provider_failure_still_allows_other_provider_results(failure):
    fetch = fake_fetch(failure, crossref([{"title": ["Greedy interval scheduling"], "URL": "https://doi.org/10.1/example"}]))
    results = fallback("interval scheduling greedy algorithm", 3, fetch)
    assert len(results) == 1
    assert results[0]["_provider"] == "Crossref"


def test_total_provider_failure_returns_no_invented_sources():
    fetch = fake_fetch(OSError("offline"), ValueError("malformed response"))
    assert fallback("interval scheduling", 3, fetch) == []


@pytest.mark.parametrize("url", ["http://doi.org/10.1/test", "javascript:alert(1)", "https://user:secret@doi.org/a", "https://127.0.0.1/private", "https://library.internal/private", "https://doi.org:9443/a"])
def test_unsafe_scholarly_source_urls_are_never_returned(url):
    fetch = fake_fetch(wikipedia([]), crossref([{"title": ["Interval scheduling algorithm"], "URL": url}]))
    assert fallback("interval scheduling", 3, fetch) == []


def test_deduplicates_sources_and_caps_the_result_count():
    record = {"title": "Interval scheduling", "snippet": "A greedy scheduling algorithm."}
    paper = {"title": ["Interval scheduling"], "URL": "https://en.wikipedia.org/wiki/Interval_scheduling"}
    fetch = fake_fetch(wikipedia([record, record]), crossref([paper, paper]))
    assert len(fallback("interval scheduling", 6, fetch)) == 1
    fetch = fake_fetch(wikipedia([record]), crossref([{"title": ["Interval scheduling"], "URL": "https://doi.org/10.1/test"}]))
    assert len(fallback("interval scheduling", 1, fetch)) == 1


def test_metadata_cannot_change_search_hosts_or_inject_additional_query_parameters():
    fetch = fake_fetch(wikipedia([]), crossref([]))
    fallback("graph algorithms & url=https://127.0.0.1/private", 3, fetch)
    for url, _ in fetch.calls:
        parsed = urlsplit(url)
        assert parsed.hostname in ("en.wikipedia.org", "api.crossref.org")
        assert "url" not in parse_qs(parsed.query)


def test_namespace_and_missing_metadata_are_ignored_and_snippet_markup_is_plain_text():
    fetch = fake_fetch(wikipedia([
        {"title": "User:Interval scheduling", "ns": 2, "snippet": "Interval scheduling"},
        {"title": "", "snippet": "Interval scheduling"},
        {"title": "Interval scheduling", "snippet": "<script>dangerous()</script><b>Greedy</b> &amp; interval scheduling"},
    ]), crossref([None, {"URL": "https://doi.org/10.1/test"}]))
    results = fallback("interval scheduling", 3, fetch)
    assert len(results) == 1
    assert results[0]["snippet"] == "Greedy & interval scheduling"


def test_empty_topics_and_zero_limits_make_no_network_calls():
    fetch = fake_fetch(wikipedia([]), crossref([]))
    assert fallback("homework help", 3, fetch) == []
    assert fallback("interval scheduling", 0, fetch) == []
    assert fetch.calls == []


def test_oversized_search_payload_is_rejected_without_creating_sources():
    fetch = fake_fetch(" " * 500_001, crossref([]))
    assert fallback("interval scheduling", 3, fetch) == []
