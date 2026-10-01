"""개념별 공부 자료 링크 (퀴즈에서 틀렸을 때 보여준다).

LLM이 링크 주소를 직접 쓰면 없는 페이지를 지어낼 수 있다. 그래서 주소는 검색 결과에서만 나온다.
- 위키백과: LLM이 영어 검색어를 만들고 → 위키백과 API로 실제 문서를 후보로 모으고 →
  LLM이 첫 문장을 보고 강의 개념과 같은 문서를 고른다. 고른 문서의 한국어판이 있으면 같이 준다.
- 블로그: 네이버 검색 API(블로그·웹문서)로 찾은 글 중 trusted_sites.txt 에 있는 도메인만 후보로 두고,
  LLM이 제목·요약을 보고 맞는 글을 고른다. NAVER_CLIENT_ID/SECRET 이 없으면 건너뛴다.
어느 단계가 실패해도 강의 처리는 계속되고, 찾은 만큼만 저장한다.
"""
import html
import json
import logging
import os
import re
import urllib.parse
import urllib.request

from app.config import BASE_DIR
from app.summarize.providers import call

log = logging.getLogger(__name__)

# 위키백과 API 정책상 연락 가능한 User-Agent를 붙인다
_UA = {"User-Agent": "StudyHelperHackathon/0.1 (https://github.com/haneul2001/2026-Konkuk-Hackerthon-5Gen)"}
_EN_API = "https://en.wikipedia.org/w/api.php"
_NAVER_API = "https://openapi.naver.com/v1/search"
_TIMEOUT = 10
TRUSTED_SITES_FILE = BASE_DIR / "trusted_sites.txt"
MAX_BLOGS_PER_CONCEPT = 2


def _get_json(url: str, headers: dict | None = None) -> dict:
    with urllib.request.urlopen(urllib.request.Request(url, headers={**_UA, **(headers or {})}), timeout=_TIMEOUT) as r:
        return json.loads(r.read())


def _wiki(params: dict) -> dict:
    return _get_json(f"{_EN_API}?{urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})}")


def _wiki_url(lang: str, title: str) -> str:
    page, _, fragment = title.partition("#")
    url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(page.replace(' ', '_'))}"
    return url + (f"#{urllib.parse.quote(fragment.replace(' ', '_'))}" if fragment else "")


def _clean(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


# ---------- 공통 스키마 ----------

def _items_schema(fields: dict) -> dict:
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"conceptId": {"type": "string"}, **fields},
                    "required": ["conceptId", *fields],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["items"],
        "additionalProperties": False,
    }


# ---------- 위키백과 ----------

_QUERY_SYSTEM = """너는 대학 강의 개념을 위키백과(영어)에서 찾기 위한 검색어를 만든다.
각 개념마다 영어 위키백과 문서 제목이 될 만한 표준 영어 용어를 1~3개 쓴다. 과목 맥락에 맞는 전문 용어를 쓴다 (예: 컴퓨터구조의 "히트율" → "Cache hit ratio", "Hit rate").
설명 문장이 아니라 용어만 쓴다."""

_WIKI_PICK_SYSTEM = """너는 대학 강의 개념과 위키백과 문서가 같은 내용인지 판단한다.
각 개념마다 후보 문서 중에서 그 개념을 직접 설명하는 문서 하나를 번호로 고른다.
- 이름이 같아도 다른 분야의 문서(예: 컴퓨터구조 개념인데 웹 분석, 스포츠 문서)는 고르지 않는다.
- 맞는 문서가 없거나 애매하면 0을 쓴다."""


def _wiki_candidates(queries: list[str]) -> list[str]:
    """실제로 있는 영어 위키백과 문서 제목 (넘겨주기를 따라간 최종 제목, #단락 포함)"""
    titles: list[str] = []
    exact = _wiki({"action": "query", "titles": "|".join(queries[:3]), "redirects": 1})["query"]
    norm = {n["from"]: n["to"] for n in exact.get("normalized", [])}
    redirects = {r["from"]: r["to"] + (f"#{r['tofragment']}" if r.get("tofragment") else "") for r in exact.get("redirects", [])}
    existing = {p["title"] for p in exact.get("pages", []) if not p.get("missing") and not p.get("invalid")}
    for q in queries[:3]:
        t = redirects.get(norm.get(q, q), norm.get(q, q))
        if t.split("#")[0] in existing:
            titles.append(t)
    if queries:
        titles += [s["title"] for s in _wiki({"action": "query", "list": "search", "srsearch": queries[0], "srlimit": 3})["query"]["search"]]
    return list(dict.fromkeys(titles))[:5]


def _wiki_pages(titles: list[str]) -> dict[str, dict]:
    """문서 제목 → {extract(첫 문장), ko(한국어 문서 제목), disambiguation}"""
    pages = list({t.split("#")[0] for t in titles})
    if not pages:
        return {}
    data = _wiki(
        {
            "action": "query",
            "titles": "|".join(pages),
            "prop": "extracts|langlinks|pageprops",
            "exintro": 1,
            "explaintext": 1,
            "exsentences": 2,
            "lllang": "ko",
            "ppprop": "disambiguation",
            "redirects": 1,
        }
    )["query"]
    return {
        p["title"]: {
            "extract": (p.get("extract") or "")[:300],
            "ko": (p.get("langlinks") or [{}])[0].get("title"),
            "disambiguation": "disambiguation" in (p.get("pageprops") or {}),
        }
        for p in data.get("pages", [])
        if not p.get("missing")
    }


def _find_wikipedia(concepts: list[dict], course: str, provider: str) -> dict[str, list[dict]]:
    listing = "\n".join(f"- {c['id']}: {c['term']} — {c['summary'][:120]}" for c in concepts)
    queries = call(
        provider, _QUERY_SYSTEM, f"과목: {course or '미정'}\n\n{listing}", _items_schema({"queries": {"type": "array", "items": {"type": "string"}}})
    ).data["items"]
    ids = {c["id"] for c in concepts}
    candidates = {q["conceptId"]: _wiki_candidates([s.strip() for s in q["queries"] if s.strip()]) for q in queries if q["conceptId"] in ids and q["queries"]}
    pages = _wiki_pages([t for ts in candidates.values() for t in ts])

    blocks = []
    for c in concepts:
        options = [t for t in candidates.get(c["id"], []) if t.split("#")[0] in pages and not pages[t.split("#")[0]]["disambiguation"]]
        candidates[c["id"]] = options
        if options:
            lines = "\n".join(f"  {i}. {t}: {pages[t.split('#')[0]]['extract']}" for i, t in enumerate(options, 1))
            blocks.append(f"### {c['id']}: {c['term']}\n개념 설명: {c['summary'][:200]}\n후보:\n{lines}")
    if not blocks:
        return {}

    picks = call(provider, _WIKI_PICK_SYSTEM, f"과목: {course or '미정'}\n\n" + "\n\n".join(blocks), _items_schema({"pick": {"type": "integer"}})).data["items"]
    found: dict[str, list[dict]] = {}
    for pick in picks:
        options = candidates.get(pick.get("conceptId"), [])
        n = pick.get("pick", 0)
        if not isinstance(n, int) or not 1 <= n <= len(options):
            continue  # 후보 밖은 받지 않는다
        title = options[n - 1]
        page = pages[title.split("#")[0]]
        links = []
        if page["ko"]:
            links.append({"kind": "wikipedia", "source": "wikipedia-ko", "title": f"위키백과: {page['ko']}", "url": _wiki_url("ko", page["ko"]), "snippet": None})
        links.append(
            {"kind": "wikipedia", "source": "wikipedia-en", "title": f"Wikipedia: {title.replace('#', ' › ')}", "url": _wiki_url("en", title), "snippet": page["extract"]}
        )
        found[pick["conceptId"]] = links
    return found


# ---------- 블로그 (네이버 검색) ----------

_BLOG_PICK_SYSTEM = f"""너는 대학 강의 개념을 공부하기 좋은 블로그 글을 고른다.
각 개념마다 후보 글 중에서 그 개념을 직접 설명하는 글을 최대 {MAX_BLOGS_PER_CONCEPT}개 번호로 고른다.
- 제목과 요약을 보고 그 개념 자체를 설명하는 글만 고른다. 이름만 겹치는 다른 주제의 글은 고르지 않는다.
- 맞는 글이 없으면 빈 배열을 쓴다."""


def trusted_sites() -> list[str]:
    if not TRUSTED_SITES_FILE.exists():
        return []
    lines = TRUSTED_SITES_FILE.read_text(encoding="utf-8-sig").splitlines()
    return [line.strip().lower() for line in lines if line.strip() and not line.strip().startswith("#")]


def _naver_keys() -> dict | None:
    cid, secret = os.getenv("NAVER_CLIENT_ID"), os.getenv("NAVER_CLIENT_SECRET")
    return {"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": secret} if cid and secret else None


def _site_of(url: str, sites: list[str]) -> str | None:
    host = urllib.parse.urlparse(url).netloc.lower()
    return next((s for s in sites if host == s or host.endswith("." + s)), None)


def _naver_search(query: str, headers: dict, sites: list[str]) -> list[dict]:
    """블로그 검색(네이버 블로그 위주) + 웹문서 검색(티스토리 등)에서 신뢰 사이트 글만"""
    posts = []
    for kind in ("blog", "webkr"):
        url = f"{_NAVER_API}/{kind}.json?" + urllib.parse.urlencode({"query": query, "display": 30})
        for item in _get_json(url, headers).get("items", []):
            site = _site_of(item.get("link", ""), sites)
            if site:
                posts.append({"site": site, "title": _clean(item["title"]), "url": item["link"], "snippet": _clean(item.get("description", ""))[:200]})
    return posts


def _find_blogs(concepts: list[dict], course: str, provider: str) -> dict[str, list[dict]]:
    headers, sites = _naver_keys(), trusted_sites()
    if not headers or not sites:
        return {}
    candidates: dict[str, list[dict]] = {}
    for c in concepts:
        seen, posts = set(), []
        for query in (c["term"], f"{course} {c['term']}" if course else None):
            if not query:
                continue
            for post in _naver_search(query, headers, sites):
                if post["url"] not in seen:
                    seen.add(post["url"])
                    posts.append(post)
        if posts:
            candidates[c["id"]] = posts[:6]
    if not candidates:
        return {}

    blocks = []
    for c in concepts:
        if c["id"] in candidates:
            lines = "\n".join(f"  {i}. [{p['site']}] {p['title']} — {p['snippet']}" for i, p in enumerate(candidates[c["id"]], 1))
            blocks.append(f"### {c['id']}: {c['term']}\n개념 설명: {c['summary'][:200]}\n후보:\n{lines}")
    picks = call(
        provider, _BLOG_PICK_SYSTEM, f"과목: {course or '미정'}\n\n" + "\n\n".join(blocks), _items_schema({"picks": {"type": "array", "items": {"type": "integer"}}})
    ).data["items"]
    found: dict[str, list[dict]] = {}
    for pick in picks:
        options = candidates.get(pick.get("conceptId"), [])
        chosen = [n for n in dict.fromkeys(pick.get("picks", [])) if isinstance(n, int) and 1 <= n <= len(options)]
        found[pick["conceptId"]] = [
            {"kind": "blog", "source": options[n - 1]["site"], "title": options[n - 1]["title"], "url": options[n - 1]["url"], "snippet": options[n - 1]["snippet"]}
            for n in chosen[:MAX_BLOGS_PER_CONCEPT]
        ]
    return found


# ---------- 합치기 ----------

def find_resources(concepts: list[dict], course: str, provider: str) -> dict[str, list[dict]]:
    """concepts: [{id, term, summary}] → {conceptId: [{kind, source, title, url, snippet}]} (위키백과 → 블로그 순)"""
    result: dict[str, list[dict]] = {c["id"]: [] for c in concepts}
    if not concepts:
        return result
    for name, finder in (("wikipedia", _find_wikipedia), ("blog", _find_blogs)):
        try:
            for cid, links in finder(concepts, course, provider).items():
                if cid in result:
                    result[cid] += links
        except Exception as e:  # 자료 링크는 부가 기능이라 실패해도 강의 처리는 계속한다
            log.warning("%s resource lookup failed: %s", name, e)
    return result
