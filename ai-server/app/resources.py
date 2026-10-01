"""개념별 공부 자료 링크 (퀴즈에서 틀렸을 때 보여준다).

LLM이 링크 주소를 직접 쓰면 없는 페이지를 지어낼 수 있다. 그래서 주소는 실제 목록·검색 결과에서만 나온다.

1) LLM이 개념마다 영어 검색어(위키백과용)와 한국어 표현·동의어(블로그 제목 찾기용)를 만든다
2) 위키백과: API로 실제 문서를 후보로 모으고, LLM이 첫 문장을 보고 강의 개념과 같은 문서를 고른다
3) 신뢰 블로그: 사이트마다 강의 처리 때 바로 조회한다 (목록을 DB에 저장하지 않는다)
   - gyoogle: GitHub 저장소(tech-interview-for-developer)의 Computer Science 문서 목록
   - inpa: 사이트맵의 글 주소(주소에 제목이 들어 있다). 자체 검색 페이지는 robots.txt가 막아 쓰지 않는다
   - TCP School: 카카오 웹문서 검색 + site: (KAKAO_REST_API_KEY 필요)
   제목에 한국어 표현이 들어간 글을 후보로 모으고, LLM이 맞는 글을 고른다
   (네이버 검색 API는 2026-07-31 종료, 구글 Custom Search JSON API는 신규 가입 불가)
목록은 하루 동안 메모리에만 들고 있는다. 어느 단계가 실패해도 강의 처리는 계속되고, 찾은 만큼만 저장한다.
"""
import html
import json
import logging
import os
import re
import time
import urllib.parse
import urllib.request
from collections.abc import Callable

from app.config import BASE_DIR
from app.summarize.providers import call

log = logging.getLogger(__name__)

_UA = {"User-Agent": "StudyHelperHackathon/0.1 (https://github.com/haneul2001/2026-Konkuk-Hackerthon-5Gen)"}
_EN_API = "https://en.wikipedia.org/w/api.php"
_TIMEOUT = 15
TRUSTED_SITES_FILE = BASE_DIR / "trusted_sites.txt"
MAX_BLOGS_PER_CONCEPT = 2
CANDIDATES_PER_CONCEPT = 6
# 위키백과 문서를 고를 때 한 번에 보여줄 개념 수. 많이 몰아 주면 작은 모델이 개념과 후보를 섞어 고른다
WIKI_PICK_BATCH = 5
CACHE_SECONDS = 24 * 3600


def _get(url: str, headers: dict | None = None) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={**_UA, **(headers or {})}), timeout=_TIMEOUT) as r:
        return r.read()


def _get_json(url: str, headers: dict | None = None) -> dict:
    return json.loads(_get(url, headers))


def _clean(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def _norm(text: str) -> str:
    return re.sub(r"[\s\-_()\[\]·,./&]+", "", text).lower()


_cache: dict[str, tuple[float, list]] = {}


def _cached(key: str, load: Callable[[], list]) -> list:
    """사이트 글 목록을 하루 동안 메모리에 둔다 (같은 날 여러 강의를 처리해도 한 번만 받는다)"""
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    data = load()
    _cache[key] = (time.time(), data)
    return data


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


# ---------- 1) 검색어 ----------

_QUERY_SYSTEM = """너는 대학 강의 개념을 위키백과와 블로그에서 찾기 위한 검색어를 만든다.
- queries: 영어 위키백과 문서 제목이 될 만한 표준 영어 용어 1~3개. 과목 맥락에 맞는 전문 용어를 쓴다 (예: 컴퓨터구조의 "히트율" → "Cache hit ratio", "Hit rate").
- keywords: 한국어 블로그 글 제목에 나올 만한 표현 2~5개. 강의에서 쓴 말뿐 아니라 교과서·블로그에서 흔히 쓰는 다른 표현과 영어 약어도 넣는다 (예: "다이렉트 매핑" → "직접 사상", "Direct Mapping", "캐시 매핑").
설명 문장이 아니라 용어만 쓴다."""

_QUERY_FIELDS = {
    "queries": {"type": "array", "items": {"type": "string"}},
    "keywords": {"type": "array", "items": {"type": "string"}},
}


def _search_terms(concepts: list[dict], course: str, provider: str) -> dict[str, dict]:
    listing = "\n".join(f"- {c['id']}: {c['term']} — {c['summary'][:120]}" for c in concepts)
    items = call(provider, _QUERY_SYSTEM, f"과목: {course or '미정'}\n\n{listing}", _items_schema(_QUERY_FIELDS)).data["items"]
    ids = {c["id"] for c in concepts}
    terms = {}
    for item in items:
        if item["conceptId"] in ids:
            terms[item["conceptId"]] = {
                "queries": [q.strip() for q in item["queries"] if q.strip()],
                "keywords": [k.strip() for k in item["keywords"] if k.strip()],
            }
    return terms


# ---------- 2) 위키백과 ----------

_WIKI_PICK_SYSTEM = """너는 대학 강의 개념과 위키백과 문서가 같은 내용인지 판단한다.
각 개념마다 후보 문서 중에서 그 개념을 직접 설명하는 문서 하나를 번호로 고른다.
- 이름이 같아도 다른 분야의 문서(예: 컴퓨터구조 개념인데 웹 분석, 스포츠 문서)는 고르지 않는다.
- 맞는 문서가 없거나 애매하면 0을 쓴다."""

_WIKI_VERIFY_SYSTEM = """너는 위키백과 문서가 대학 강의 개념을 공부하는 데 맞는지 확인한다.
먼저 문서가 다루는 주제를 한 줄로 쓴다.
- 문서 주제가 강의 개념과 같거나, 강의 개념을 직접 포함해 설명하는 상위 주제면 match를 true로 한다 (예: INNER JOIN → Join (SQL)).
- 강의 개념과 나란한 다른 주제(예: 히트율 → 캐시 교체 정책), 다른 분야(예: 블록 → 장난감 블록), 용어 모음·목록 문서면 false로 한다."""

_WIKI_VERIFY_SCHEMA = {
    "type": "object",
    "properties": {"page_topic": {"type": "string"}, "match": {"type": "boolean"}},
    "required": ["page_topic", "match"],
    "additionalProperties": False,
}


def _verify_wiki(concept: dict, title: str, extract: str, course: str, provider: str) -> bool:
    """여러 개념을 묶어 고르면 작은 모델이 엉뚱한 문서를 고르는 일이 있어, 고른 문서를 하나씩 다시 확인한다"""
    user = (
        f"강의 과목: {course or '미정'}\n강의 개념: {concept['term']} — {concept['summary'][:200]}\n\n"
        f"문서 제목: {title.replace('#', ' › ')}\n문서 첫 문장: {extract[:250]}"
    )
    try:
        return bool(call(provider, _WIKI_VERIFY_SYSTEM, user, _WIKI_VERIFY_SCHEMA).data.get("match"))
    except Exception as e:
        log.warning("wikipedia verify failed: %s", e)
        return False


def _wiki(params: dict) -> dict:
    return _get_json(f"{_EN_API}?{urllib.parse.urlencode({**params, 'format': 'json', 'formatversion': 2})}")


def _wiki_url(lang: str, title: str) -> str:
    page, _, fragment = title.partition("#")
    url = f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(page.replace(' ', '_'))}"
    return url + (f"#{urllib.parse.quote(fragment.replace(' ', '_'))}" if fragment else "")


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


def _find_wikipedia(concepts: list[dict], terms: dict[str, dict], course: str, provider: str) -> dict[str, list[dict]]:
    candidates = {cid: _wiki_candidates(t["queries"]) for cid, t in terms.items() if t["queries"]}
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

    picks = []
    for i in range(0, len(blocks), WIKI_PICK_BATCH):
        user = f"과목: {course or '미정'}\n\n" + "\n\n".join(blocks[i : i + WIKI_PICK_BATCH])
        picks += call(provider, _WIKI_PICK_SYSTEM, user, _items_schema({"pick": {"type": "integer"}})).data["items"]
    by_id = {c["id"]: c for c in concepts}
    found: dict[str, list[dict]] = {}
    for pick in picks:
        cid = pick.get("conceptId")
        options = candidates.get(cid, [])
        n = pick.get("pick", 0)
        if cid not in by_id or not isinstance(n, int) or not 1 <= n <= len(options):
            continue  # 후보 밖은 받지 않는다
        title = options[n - 1]
        page = pages[title.split("#")[0]]
        if not _verify_wiki(by_id[cid], title, page["extract"], course, provider):
            continue
        links = []
        if page["ko"]:
            links.append({"kind": "wikipedia", "source": "wikipedia-ko", "title": f"위키백과: {page['ko']}", "url": _wiki_url("ko", page["ko"]), "snippet": None})
        links.append(
            {"kind": "wikipedia", "source": "wikipedia-en", "title": f"Wikipedia: {title.replace('#', ' › ')}", "url": _wiki_url("en", title), "snippet": page["extract"]}
        )
        found[pick["conceptId"]] = links
    return found


# ---------- 3) 신뢰 블로그 (사이트별 실시간 조회) ----------

_GYOOGLE_REPO = "gyoogle/tech-interview-for-developer"


def _gyoogle_posts() -> list[dict]:
    """GitHub 저장소의 Computer Science 문서 목록 (키 없이 시간당 60회, GITHUB_TOKEN 있으면 더)"""
    headers = {"Accept": "application/vnd.github+json"}
    if os.getenv("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.getenv('GITHUB_TOKEN')}"
    repo = _get_json(f"https://api.github.com/repos/{_GYOOGLE_REPO}", headers)
    branch = repo["default_branch"]
    tree = _get_json(f"https://api.github.com/repos/{_GYOOGLE_REPO}/git/trees/{urllib.parse.quote(branch)}?recursive=1", headers)
    posts = []
    for item in tree.get("tree", []):
        path = item["path"]
        if item["type"] == "blob" and path.startswith("Computer Science/") and path.endswith(".md"):
            category, name = path.split("/")[1], path.rsplit("/", 1)[-1][:-3]
            url = f"https://github.com/{_GYOOGLE_REPO}/blob/{urllib.parse.quote(branch)}/{urllib.parse.quote(path)}"
            posts.append({"site": "gyoogle", "title": f"{name} ({category})", "url": url, "snippet": f"기술 면접 정리 · {category}"})
    return posts


def _inpa_posts() -> list[dict]:
    """inpa 사이트맵의 글 주소. 티스토리 글 주소(/entry/…)에 제목이 들어 있어 글을 따로 열지 않는다"""
    xml = _get("https://inpa.tistory.com/sitemap.xml").decode("utf-8", "replace")
    posts = []
    for loc in re.findall(r"<loc>\s*(.*?)\s*</loc>", xml):
        path = urllib.parse.urlparse(loc).path
        if not path.startswith("/entry/"):
            continue
        slug = urllib.parse.unquote(path[len("/entry/") :])
        title = re.sub(r"[-_]+", " ", slug).strip()
        if title:
            posts.append({"site": "inpa", "title": title, "url": loc, "snippet": "Inpa Dev 블로그"})
    return posts


def _match_titles(posts: list[dict], keywords: list[str]) -> list[dict]:
    """제목에 키워드가 들어간 글을, 많이 맞는 순으로"""
    keys = [_norm(k) for k in keywords if len(_norm(k)) >= 2]
    scored = []
    for post in posts:
        title = _norm(post["title"])
        hits = sum(1 for k in keys if k in title)
        if hits:
            scored.append((hits, post))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored]


def _tcpschool_search(keyword: str) -> list[dict]:
    key = os.getenv("KAKAO_REST_API_KEY")
    if not key:
        return []
    url = "https://dapi.kakao.com/v2/search/web?" + urllib.parse.urlencode({"query": f"{keyword} site:tcpschool.com", "size": 10})
    docs = _get_json(url, {"Authorization": f"KakaoAK {key}"}).get("documents", [])
    return [
        {"site": "tcpschool", "title": _clean(d["title"]), "url": d["url"], "snippet": _clean(d.get("contents", ""))[:200]}
        for d in docs
        # 제목 없이 "rel" 같은 조각만 오는 결과는 버린다
        if urllib.parse.urlparse(d["url"]).netloc.lower().endswith("tcpschool.com") and len(_clean(d["title"])) >= 4
    ]


def trusted_sites() -> list[str]:
    """trusted_sites.txt 에서 켜 둔 사이트 (줄 맨 앞 # 은 꺼짐)"""
    if not TRUSTED_SITES_FILE.exists():
        return []
    lines = TRUSTED_SITES_FILE.read_text(encoding="utf-8-sig").splitlines()
    return [line.strip().lower() for line in lines if line.strip() and not line.strip().startswith("#")]


# 지원하는 사이트: 도메인 → (이름, 개념 키워드로 후보 찾기)
def _site_finders() -> dict[str, Callable[[list[str]], list[dict]]]:
    return {
        "gyoogle.dev": lambda kws: _match_titles(_cached("gyoogle", _gyoogle_posts), kws),
        "inpa.tistory.com": lambda kws: _match_titles(_cached("inpa", _inpa_posts), kws),
        "tcpschool.com": lambda kws: [p for k in kws[:2] for p in _tcpschool_search(k)],
    }


_BLOG_PICK_SYSTEM = f"""너는 대학 강의 개념을 공부하기 좋은 글을 고른다.
각 개념마다 후보 글 중에서 그 개념을 직접 설명하는 글을 최대 {MAX_BLOGS_PER_CONCEPT}개 번호로 고른다.
- 제목, 주소 경로, 요약을 보고 과목과 같은 분야에서 그 개념 자체를 설명하는 글만 고른다.
- 이름만 겹치는 다른 분야의 글은 고르지 않는다. 예: 컴퓨터구조의 캐시인데 웹 브라우저 HTTP 캐시 글, 컴퓨터구조의 블록인데 CSS 블록·인라인 글(주소에 /css/, /html/).
- 맞는 글이 없거나 애매하면 빈 배열을 쓴다."""


_VERIFY_SYSTEM = """너는 블로그 글이 대학 강의 개념을 공부하는 데 맞는지 확인한다.
먼저 글 제목과 주소 경로를 보고 그 글이 다루는 분야를 쓴다 (예: "웹 프론트엔드 CSS", "컴퓨터구조", "운영체제").
그다음 그 분야가 강의 과목과 같고, 글이 강의 개념을 직접 설명하면 match를 true로 한다. 아니면 false."""

_VERIFY_SCHEMA = {
    "type": "object",
    "properties": {"post_field": {"type": "string"}, "match": {"type": "boolean"}},
    "required": ["post_field", "match"],
    "additionalProperties": False,
}


def _verify(concept: dict, post: dict, course: str, provider: str) -> bool:
    """여러 개념을 한꺼번에 고를 때 작은 모델이 이름만 같은 글을 고르는 일이 있어, 고른 글을 하나씩 다시 확인한다"""
    path = urllib.parse.unquote(urllib.parse.urlparse(post["url"]).path)[:100]
    user = (
        f"강의 과목: {course or '미정'}\n강의 개념: {concept['term']} — {concept['summary'][:200]}\n\n"
        f"글 제목: {post['title']}\n주소 경로: {path}\n요약: {post['snippet'][:150]}"
    )
    try:
        return bool(call(provider, _VERIFY_SYSTEM, user, _VERIFY_SCHEMA).data.get("match"))
    except Exception as e:
        log.warning("blog verify failed: %s", e)
        return False


def _find_blogs(concepts: list[dict], terms: dict[str, dict], course: str, provider: str) -> dict[str, list[dict]]:
    finders = {d: f for d, f in _site_finders().items() if d in trusted_sites()}
    if not finders:
        return {}
    candidates: dict[str, list[dict]] = {}
    for c in concepts:
        keywords = [c["term"], *terms.get(c["id"], {}).get("keywords", [])]
        seen, posts = set(), []
        for domain, find in finders.items():
            try:
                found = find(keywords)
            except Exception as e:  # 한 사이트가 안 열려도 다른 사이트는 계속
                log.warning("%s lookup failed: %s", domain, e)
                continue
            for post in found[:3]:  # 사이트마다 3개까지
                if post["url"] not in seen:
                    seen.add(post["url"])
                    posts.append(post)
        if posts:
            candidates[c["id"]] = posts[:CANDIDATES_PER_CONCEPT]
    if not candidates:
        return {}

    blocks = []
    for c in concepts:
        if c["id"] in candidates:
            # 주소 경로(/css/…, /Computer Architecture/…)와 요약을 같이 보여줘야 분야를 가려낸다
            lines = "\n".join(
                f"  {i}. [{p['site']}] {p['title']} (주소: {urllib.parse.unquote(urllib.parse.urlparse(p['url']).path)[:80]}) — {p['snippet'][:120]}"
                for i, p in enumerate(candidates[c["id"]], 1)
            )
            blocks.append(f"### {c['id']}: {c['term']}\n개념 설명: {c['summary'][:200]}\n후보:\n{lines}")
    picks = call(
        provider, _BLOG_PICK_SYSTEM, f"과목: {course or '미정'}\n\n" + "\n\n".join(blocks), _items_schema({"picks": {"type": "array", "items": {"type": "integer"}}})
    ).data["items"]
    by_id = {c["id"]: c for c in concepts}
    found: dict[str, list[dict]] = {}
    for pick in picks:
        cid = pick.get("conceptId")
        options = candidates.get(cid, [])
        chosen = [n for n in dict.fromkeys(pick.get("picks", [])) if isinstance(n, int) and 1 <= n <= len(options)]
        posts = [options[n - 1] for n in chosen[:MAX_BLOGS_PER_CONCEPT]]
        found[cid] = [
            {"kind": "blog", "source": p["site"], "title": p["title"], "url": p["url"], "snippet": p["snippet"]}
            for p in posts
            if _verify(by_id[cid], p, course, provider)
        ]
    return found


# ---------- 합치기 ----------

def find_resources(concepts: list[dict], course: str, provider: str) -> dict[str, list[dict]]:
    """concepts: [{id, term, summary}] → {conceptId: [{kind, source, title, url, snippet}]} (위키백과 → 블로그 순)"""
    result: dict[str, list[dict]] = {c["id"]: [] for c in concepts}
    if not concepts:
        return result
    try:
        terms = _search_terms(concepts, course, provider)
    except Exception as e:
        log.warning("search term generation failed: %s", e)
        return result
    for name, finder in (("wikipedia", _find_wikipedia), ("blog", _find_blogs)):
        try:
            for cid, links in finder(concepts, terms, course, provider).items():
                if cid in result:
                    result[cid] += links
        except Exception as e:  # 자료 링크는 부가 기능이라 실패해도 강의 처리는 계속한다
            log.warning("%s resource lookup failed: %s", name, e)
    return result
