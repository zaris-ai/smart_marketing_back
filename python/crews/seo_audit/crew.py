import json
import os
import re
import xml.etree.ElementTree as ET
from collections import Counter, deque
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, quote_plus, unquote, urldefrag, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from crewai import Agent, Crew, LLM, Process, Task


TARGET_WEBSITE_URL = "https://web.arkaanalyzer.com/"
TARGET_BRAND_NAME = "Arka Analyzer"

DEFAULT_TONE = "professional and analytical"
DEFAULT_INCLUDE_EXTERNAL_LINKS = False
DEFAULT_INCLUDE_SEARCH_VISIBILITY = False

USER_AGENT = (
    "Mozilla/5.0 (compatible; ArkaSeoAuditBot/1.0; +https://web.arkaanalyzer.com/)"
)

DDG_HTML_SEARCH_URL = "https://html.duckduckgo.com/html/"


def build_llm():
    model = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
    return LLM(model=model, temperature=0.15)


def to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off"}:
            return False
    return default


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    return url


def strip_fragment(url: str) -> str:
    clean, _ = urldefrag(url)
    return clean


def normalize_for_dedupe(url: str) -> str:
    url = strip_fragment(url)
    parsed = urlparse(url)

    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"

    if path != "/" and path.endswith("/"):
        path = path[:-1]

    return f"{scheme}://{netloc}{path}"


def same_domain(a: str, b: str) -> bool:
    return urlparse(a).netloc.lower() == urlparse(b).netloc.lower()


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def fetch_text(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=20, allow_redirects=True)
    response.raise_for_status()
    return response.text


def extract_sitemap_urls_from_robots(
    session: requests.Session, website_url: str
) -> List[str]:
    robots_url = urljoin(website_url, "/robots.txt")
    sitemap_urls: List[str] = []

    try:
        text = fetch_text(session, robots_url)
        for line in text.splitlines():
            if line.lower().startswith("sitemap:"):
                sitemap_url = line.split(":", 1)[1].strip()
                if sitemap_url:
                    sitemap_urls.append(sitemap_url)
    except Exception:
        pass

    default_sitemap = urljoin(website_url, "/sitemap.xml")
    if default_sitemap not in sitemap_urls:
        sitemap_urls.append(default_sitemap)

    return sitemap_urls


def parse_sitemap(
    session: requests.Session,
    sitemap_url: str,
    seen_sitemaps: Optional[set] = None,
) -> set:
    if seen_sitemaps is None:
        seen_sitemaps = set()

    sitemap_url = strip_fragment(sitemap_url)
    if sitemap_url in seen_sitemaps:
        return set()

    seen_sitemaps.add(sitemap_url)
    urls = set()

    try:
        xml_text = fetch_text(session, sitemap_url)
        root = ET.fromstring(xml_text)

        ns_match = re.match(r"\{.*\}", root.tag)
        ns = ns_match.group(0) if ns_match else ""

        if root.tag.endswith("sitemapindex"):
            for sitemap_tag in root.findall(f"{ns}sitemap"):
                loc = sitemap_tag.find(f"{ns}loc")
                if loc is not None and loc.text:
                    urls.update(parse_sitemap(session, loc.text.strip(), seen_sitemaps))

        elif root.tag.endswith("urlset"):
            for url_tag in root.findall(f"{ns}url"):
                loc = url_tag.find(f"{ns}loc")
                if loc is not None and loc.text:
                    urls.add(normalize_for_dedupe(loc.text.strip()))
    except Exception:
        pass

    return urls


def discover_site_urls_from_sitemaps(website_url: str) -> List[str]:
    session = get_session()
    sitemap_urls = extract_sitemap_urls_from_robots(session, website_url)

    discovered = set()
    for sitemap_url in sitemap_urls:
        discovered.update(parse_sitemap(session, sitemap_url))

    return sorted(discovered)


def discover_site_urls_by_crawl(website_url: str, max_depth: int = 4) -> List[str]:
    start_url = normalize_url(website_url)
    base_domain = urlparse(start_url).netloc.lower()

    session = get_session()
    queue = deque([(start_url, 0)])
    visited = set()
    discovered = set()

    while queue:
        current_url, depth = queue.popleft()
        current_url = normalize_for_dedupe(current_url)

        if current_url in visited:
            continue

        visited.add(current_url)
        discovered.add(current_url)

        try:
            response = session.get(current_url, timeout=20, allow_redirects=True)
            content_type = response.headers.get("Content-Type", "")

            if "text/html" not in content_type.lower():
                continue

            soup = BeautifulSoup(response.text, "html.parser")

            if depth < max_depth:
                for anchor in soup.find_all("a", href=True):
                    href = anchor.get("href", "").strip()
                    if not href:
                        continue

                    absolute = normalize_for_dedupe(urljoin(current_url, href))
                    parsed = urlparse(absolute)

                    if parsed.scheme not in ("http", "https"):
                        continue

                    if parsed.netloc.lower() != base_domain:
                        continue

                    if absolute not in visited:
                        queue.append((absolute, depth + 1))
        except Exception:
            continue

    return sorted(discovered)


def discover_all_site_urls(website_url: str, crawl_depth: int = 4) -> List[str]:
    sitemap_urls = set(discover_site_urls_from_sitemaps(website_url))
    crawl_urls = set(discover_site_urls_by_crawl(website_url, max_depth=crawl_depth))

    all_urls = sitemap_urls.union(crawl_urls)

    if not all_urls:
        all_urls.add(normalize_for_dedupe(website_url))

    return sorted(all_urls)


def extract_page_data(
    url: str,
    html: str,
    status_code: int,
    content_type: str,
) -> Dict[str, Any]:
    soup = BeautifulSoup(html or "", "html.parser")

    title_tag = soup.find("title")
    title = clean_text(title_tag.get_text(" ", strip=True)) if title_tag else ""

    meta_desc_tag = soup.find("meta", attrs={"name": re.compile("^description$", re.I)})
    meta_description = (
        clean_text(meta_desc_tag.get("content", "")) if meta_desc_tag else ""
    )

    canonical_tag = soup.find(
        "link",
        attrs={
            "rel": lambda value: value
            and "canonical" in [x.lower() for x in (value if isinstance(value, list) else [value])]
        },
    )
    canonical = canonical_tag.get("href", "").strip() if canonical_tag else ""

    robots_tag = soup.find("meta", attrs={"name": re.compile("^robots$", re.I)})
    robots = clean_text(robots_tag.get("content", "")) if robots_tag else ""

    viewport_tag = soup.find("meta", attrs={"name": re.compile("^viewport$", re.I)})
    has_viewport = viewport_tag is not None

    h1_tags = soup.find_all("h1")
    h2_tags = soup.find_all("h2")

    images = soup.find_all("img")
    images_missing_alt = 0
    for img in images:
        alt = img.get("alt")
        if alt is None or not str(alt).strip():
            images_missing_alt += 1

    json_ld_scripts = soup.find_all(
        "script", attrs={"type": re.compile(r"ld\+json", re.I)}
    )

    body_text = clean_text(soup.get_text(" ", strip=True))
    word_count = len(body_text.split()) if body_text else 0

    links: List[Dict[str, str]] = []
    internal_links: List[Dict[str, str]] = []
    external_links: List[Dict[str, str]] = []

    for anchor in soup.find_all("a", href=True):
        href = anchor.get("href", "").strip()
        if not href:
            continue

        absolute = strip_fragment(urljoin(url, href))
        parsed = urlparse(absolute)

        if parsed.scheme not in ("http", "https"):
            continue

        anchor_text = clean_text(anchor.get_text(" ", strip=True))
        item = {
            "href": absolute,
            "anchor_text": anchor_text,
        }

        links.append(item)

        if same_domain(url, absolute):
            internal_links.append(item)
        else:
            external_links.append(item)

    return {
        "url": url,
        "status_code": status_code,
        "content_type": content_type,
        "title": title,
        "title_length": len(title),
        "meta_description": meta_description,
        "meta_description_length": len(meta_description),
        "canonical": canonical,
        "robots": robots,
        "is_noindex": "noindex" in robots.lower(),
        "has_viewport": has_viewport,
        "h1_count": len(h1_tags),
        "h2_count": len(h2_tags),
        "word_count": word_count,
        "image_count": len(images),
        "images_missing_alt": images_missing_alt,
        "schema_count": len(json_ld_scripts),
        "internal_links": internal_links,
        "external_links": external_links,
        "links_count": len(links),
        "internal_links_count": len(internal_links),
        "external_links_count": len(external_links),
    }


def crawl_site(website_url: str) -> Dict[str, Any]:
    start_url = normalize_url(website_url)
    base_domain = urlparse(start_url).netloc.lower()

    session = get_session()
    urls = discover_all_site_urls(start_url, crawl_depth=4)

    pages: List[Dict[str, Any]] = []
    failed_urls: List[Dict[str, str]] = []

    for current_url in urls:
        try:
            response = session.get(current_url, timeout=20, allow_redirects=True)
            final_url = normalize_for_dedupe(response.url)
            content_type = response.headers.get("Content-Type", "")

            if "text/html" not in content_type.lower():
                pages.append(
                    {
                        "url": final_url,
                        "status_code": response.status_code,
                        "content_type": content_type,
                        "non_html": True,
                    }
                )
                continue

            page = extract_page_data(
                url=final_url,
                html=response.text,
                status_code=response.status_code,
                content_type=content_type,
            )
            page["non_html"] = False
            pages.append(page)

        except Exception as exc:
            failed_urls.append({"url": current_url, "error": str(exc)})
            pages.append(
                {
                    "url": current_url,
                    "status_code": 0,
                    "content_type": "",
                    "non_html": True,
                    "error": str(exc),
                }
            )

    return {
        "start_url": start_url,
        "base_domain": base_domain,
        "pages": pages,
        "failed_urls": failed_urls,
        "discovered_internal_count": len(urls),
        "discovered_urls": urls,
    }


def validate_link_status(
    crawl_data: Dict[str, Any],
    include_external_links: bool = False,
    max_checks: int = 1000,
) -> Dict[str, Any]:
    session = get_session()
    checked: Dict[str, int] = {}
    broken_links: List[Dict[str, Any]] = []

    urls_to_check: List[Tuple[str, str, str]] = []

    for page in crawl_data["pages"]:
        if page.get("non_html"):
            continue

        for item in page.get("internal_links", []):
            href = strip_fragment(item["href"])
            if href not in checked:
                urls_to_check.append(("internal", page["url"], href))

        if include_external_links:
            for item in page.get("external_links", []):
                href = strip_fragment(item["href"])
                if href not in checked:
                    urls_to_check.append(("external", page["url"], href))

    for link_type, source_url, target_url in urls_to_check[:max_checks]:
        if target_url in checked:
            continue

        try:
            response = session.head(target_url, timeout=12, allow_redirects=True)
            status_code = response.status_code

            if status_code >= 400 or status_code == 0:
                try:
                    response = session.get(target_url, timeout=12, allow_redirects=True)
                    status_code = response.status_code
                except Exception:
                    pass

            checked[target_url] = status_code

            if status_code >= 400 or status_code == 0:
                broken_links.append(
                    {
                        "type": link_type,
                        "source_url": source_url,
                        "target_url": target_url,
                        "status_code": status_code,
                    }
                )
        except Exception as exc:
            checked[target_url] = 0
            broken_links.append(
                {
                    "type": link_type,
                    "source_url": source_url,
                    "target_url": target_url,
                    "status_code": 0,
                    "error": str(exc),
                }
            )

    return {
        "checked_links_count": len(checked),
        "broken_links_count": len(broken_links),
        "broken_links": broken_links[:200],
        "checked_link_status_map": checked,
    }


def build_page_issues(page_row: Dict[str, Any]) -> List[str]:
    issues: List[str] = []

    status_code = int(page_row.get("status_code", 0) or 0)

    if status_code >= 400 or status_code == 0:
        issues.append("Page returned an error status")

    if not page_row.get("title"):
        issues.append("Missing title tag")
    elif page_row.get("title_length", 0) < 20:
        issues.append("Title is too short")
    elif page_row.get("title_length", 0) > 65:
        issues.append("Title may be too long")

    meta_len = page_row.get("meta_description_length", 0)
    if meta_len == 0:
        issues.append("Missing meta description")
    elif meta_len < 70:
        issues.append("Meta description is too short")
    elif meta_len > 160:
        issues.append("Meta description may be too long")

    h1_count = page_row.get("h1_count", 0)
    if h1_count == 0:
        issues.append("Missing H1")
    elif h1_count > 1:
        issues.append("Multiple H1 tags")

    if not page_row.get("canonical_present"):
        issues.append("Missing canonical tag")

    if page_row.get("word_count", 0) < 250:
        issues.append("Thin content")

    if page_row.get("images_missing_alt", 0) > 0:
        issues.append("Images missing alt text")

    if page_row.get("broken_outgoing_links_count", 0) > 0:
        issues.append("Contains broken outgoing links")

    if page_row.get("is_noindex"):
        issues.append("Page is marked noindex")

    return issues


def calculate_page_score(page_row: Dict[str, Any]) -> int:
    score = 100

    status_code = int(page_row.get("status_code", 0) or 0)
    if status_code >= 400 or status_code == 0:
        score -= 30

    if not page_row.get("title"):
        score -= 12

    meta_len = page_row.get("meta_description_length", 0)
    if meta_len == 0:
        score -= 10

    h1_count = page_row.get("h1_count", 0)
    if h1_count == 0:
        score -= 10
    elif h1_count > 1:
        score -= 6

    if not page_row.get("canonical_present"):
        score -= 8

    if page_row.get("word_count", 0) < 250:
        score -= 8

    score -= min(page_row.get("images_missing_alt", 0), 10) * 2
    score -= min(page_row.get("broken_outgoing_links_count", 0), 10) * 3

    if page_row.get("is_noindex"):
        score -= 5

    return max(0, min(100, score))


def build_page_table(
    crawl_data: Dict[str, Any],
    link_validation: Dict[str, Any],
) -> List[Dict[str, Any]]:
    checked_status = link_validation.get("checked_link_status_map", {})
    rows: List[Dict[str, Any]] = []

    for page in crawl_data["pages"]:
        if page.get("non_html"):
            row = {
                "url": page.get("url"),
                "status_code": page.get("status_code", 0),
                "title": "",
                "title_length": 0,
                "meta_description_length": 0,
                "h1_count": 0,
                "word_count": 0,
                "image_count": 0,
                "images_missing_alt": 0,
                "internal_links_count": 0,
                "external_links_count": 0,
                "canonical_present": False,
                "schema_count": 0,
                "is_noindex": False,
                "broken_outgoing_links_count": 0,
            }
            row["issues"] = build_page_issues(row)
            row["page_score"] = calculate_page_score(row)
            rows.append(row)
            continue

        internal_targets = [
            strip_fragment(item["href"]) for item in page.get("internal_links", [])
        ]
        external_targets = [
            strip_fragment(item["href"]) for item in page.get("external_links", [])
        ]

        broken_outgoing_links_count = 0
        for target in internal_targets + external_targets:
            status_code = checked_status.get(target)
            if status_code is not None and (status_code >= 400 or status_code == 0):
                broken_outgoing_links_count += 1

        row = {
            "url": page.get("url"),
            "status_code": page.get("status_code", 0),
            "title": page.get("title", ""),
            "title_length": page.get("title_length", 0),
            "meta_description_length": page.get("meta_description_length", 0),
            "h1_count": page.get("h1_count", 0),
            "word_count": page.get("word_count", 0),
            "image_count": page.get("image_count", 0),
            "images_missing_alt": page.get("images_missing_alt", 0),
            "internal_links_count": page.get("internal_links_count", 0),
            "external_links_count": page.get("external_links_count", 0),
            "canonical_present": bool(page.get("canonical")),
            "schema_count": page.get("schema_count", 0),
            "is_noindex": page.get("is_noindex", False),
            "broken_outgoing_links_count": broken_outgoing_links_count,
        }
        row["issues"] = build_page_issues(row)
        row["page_score"] = calculate_page_score(row)
        rows.append(row)

    return rows


def compute_summary(
    crawl_data: Dict[str, Any],
    link_validation: Dict[str, Any],
    page_table: List[Dict[str, Any]],
    website_url: str,
    brand_name: str,
) -> Dict[str, Any]:
    html_pages = [page for page in crawl_data["pages"] if not page.get("non_html")]
    all_pages = crawl_data["pages"]

    title_counter = Counter([page["title"] for page in html_pages if page.get("title")])
    desc_counter = Counter(
        [page["meta_description"] for page in html_pages if page.get("meta_description")]
    )

    duplicate_title_count = sum(
        1 for page in html_pages if page.get("title") and title_counter[page["title"]] > 1
    )
    duplicate_desc_count = sum(
        1
        for page in html_pages
        if page.get("meta_description") and desc_counter[page["meta_description"]] > 1
    )

    total_images = sum(page.get("image_count", 0) for page in html_pages)
    total_missing_alt = sum(page.get("images_missing_alt", 0) for page in html_pages)

    pages_missing_title = [page["url"] for page in html_pages if not page.get("title")]
    pages_missing_desc = [page["url"] for page in html_pages if not page.get("meta_description")]
    pages_missing_h1 = [page["url"] for page in html_pages if page.get("h1_count", 0) == 0]
    pages_multiple_h1 = [page["url"] for page in html_pages if page.get("h1_count", 0) > 1]
    pages_missing_canonical = [page["url"] for page in html_pages if not page.get("canonical")]
    thin_pages = [page["url"] for page in html_pages if page.get("word_count", 0) < 250]
    noindex_pages = [page["url"] for page in html_pages if page.get("is_noindex")]

    broken_pages = [
        page["url"]
        for page in all_pages
        if int(page.get("status_code", 0) or 0) >= 400
        or int(page.get("status_code", 0) or 0) == 0
    ]

    avg_title_length = (
        round(sum(page.get("title_length", 0) for page in html_pages) / len(html_pages), 1)
        if html_pages
        else 0
    )
    avg_desc_length = (
        round(
            sum(page.get("meta_description_length", 0) for page in html_pages) / len(html_pages),
            1,
        )
        if html_pages
        else 0
    )
    avg_word_count = (
        round(sum(page.get("word_count", 0) for page in html_pages) / len(html_pages), 1)
        if html_pages
        else 0
    )

    avg_page_score = (
        round(sum(row.get("page_score", 0) for row in page_table) / len(page_table), 1)
        if page_table
        else 0
    )

    alt_coverage = (
        round(((total_images - total_missing_alt) / total_images) * 100, 1)
        if total_images
        else 100.0
    )

    broken_links_count = int(link_validation.get("broken_links_count", 0))

    issue_penalty = 0
    issue_penalty += len(pages_missing_title) * 4
    issue_penalty += len(pages_missing_desc) * 3
    issue_penalty += len(pages_missing_h1) * 3
    issue_penalty += len(pages_multiple_h1) * 2
    issue_penalty += len(pages_missing_canonical) * 2
    issue_penalty += len(thin_pages) * 2
    issue_penalty += len(noindex_pages) * 1
    issue_penalty += len(broken_pages) * 5
    issue_penalty += broken_links_count * 1.5
    issue_penalty += duplicate_title_count * 2
    issue_penalty += duplicate_desc_count * 2
    issue_penalty += total_missing_alt * 0.3

    raw_score = max(0, 100 - round(issue_penalty))
    seo_score = min(100, raw_score)

    worst_pages = sorted(page_table, key=lambda row: row.get("page_score", 100))[:20]

    return {
        "website_url": website_url,
        "brand_name": brand_name,
        "seo_score": seo_score,
        "average_page_score": avg_page_score,
        "pages_crawled": len(html_pages),
        "all_urls_checked": len(all_pages),
        "discovered_internal_count": crawl_data.get("discovered_internal_count", 0),
        "broken_pages_count": len(broken_pages),
        "broken_links_count": broken_links_count,
        "checked_links_count": int(link_validation.get("checked_links_count", 0)),
        "missing_title_count": len(pages_missing_title),
        "missing_meta_description_count": len(pages_missing_desc),
        "missing_h1_count": len(pages_missing_h1),
        "multiple_h1_count": len(pages_multiple_h1),
        "missing_canonical_count": len(pages_missing_canonical),
        "thin_content_count": len(thin_pages),
        "noindex_count": len(noindex_pages),
        "duplicate_title_count": duplicate_title_count,
        "duplicate_description_count": duplicate_desc_count,
        "total_images": total_images,
        "images_missing_alt": total_missing_alt,
        "image_alt_coverage_percent": alt_coverage,
        "average_title_length": avg_title_length,
        "average_meta_description_length": avg_desc_length,
        "average_word_count": avg_word_count,
        "pages_missing_title": pages_missing_title[:20],
        "pages_missing_desc": pages_missing_desc[:20],
        "pages_missing_h1": pages_missing_h1[:20],
        "pages_multiple_h1": pages_multiple_h1[:20],
        "pages_missing_canonical": pages_missing_canonical[:20],
        "thin_pages": thin_pages[:20],
        "broken_pages": broken_pages[:20],
        "worst_pages": worst_pages,
        "broken_link_examples": link_validation.get("broken_links", [])[:20],
    }


def _resolve_ddg_link(href: str) -> str:
    if not href:
        return ""

    parsed = urlparse(href)

    if parsed.netloc.endswith("duckduckgo.com") and parsed.path.startswith("/l/"):
        query = parse_qs(parsed.query)
        uddg = query.get("uddg", [""])[0]
        return unquote(uddg) if uddg else href

    if href.startswith("//"):
        return f"https:{href}"

    return href


def html_search(query: str, max_results: int = 10) -> Dict[str, Any]:
    session = get_session()

    try:
        response = session.get(
            DDG_HTML_SEARCH_URL,
            params={"q": query},
            timeout=20,
            allow_redirects=True,
        )
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        results: List[Dict[str, str]] = []
        seen = set()

        for anchor in soup.find_all("a", href=True):
            href = anchor.get("href", "").strip()
            classes = " ".join(anchor.get("class", []))
            title = clean_text(anchor.get_text(" ", strip=True))

            if not href or not title:
                continue

            resolved_href = _resolve_ddg_link(href)

            if not resolved_href.startswith("http"):
                continue

            if "result__a" not in classes and "uddg=" not in href:
                continue

            if resolved_href in seen:
                continue

            seen.add(resolved_href)

            snippet = ""
            parent = anchor.find_parent()
            if parent:
                parent_text = clean_text(parent.get_text(" ", strip=True))
                if parent_text and parent_text != title:
                    snippet = parent_text[:300]

            results.append(
                {
                    "title": title,
                    "url": resolved_href,
                    "snippet": snippet,
                }
            )

            if len(results) >= max_results:
                break

        return {
            "query": query,
            "results": results,
        }

    except Exception as exc:
        return {
            "query": query,
            "results": [],
            "error": str(exc),
        }


def search_visibility_notes(website_url: str, brand_name: str) -> Dict[str, Any]:
    domain = urlparse(normalize_url(website_url)).netloc

    queries = [
        f'"{brand_name}"',
        f"site:{domain}",
        f'"{brand_name}" site:{domain}',
    ]

    results = []
    for query in queries:
        search_result = html_search(query, max_results=8)
        results.append(search_result)

    return {
        "enabled": True,
        "provider": "duckduckgo_html_fallback",
        "queries": queries,
        "results": results,
    }


def create_seo_audit_crew(payload=None):
    payload = payload or {}

    website_url = normalize_url(payload.get("website_url", TARGET_WEBSITE_URL))
    brand_name = clean_text(payload.get("brand_name", TARGET_BRAND_NAME)) or TARGET_BRAND_NAME
    tone = clean_text(payload.get("tone", DEFAULT_TONE)) or DEFAULT_TONE

    include_external_links = to_bool(
        payload.get("include_external_links", DEFAULT_INCLUDE_EXTERNAL_LINKS),
        DEFAULT_INCLUDE_EXTERNAL_LINKS,
    )
    include_search_visibility = to_bool(
        payload.get("include_search_visibility", DEFAULT_INCLUDE_SEARCH_VISIBILITY),
        DEFAULT_INCLUDE_SEARCH_VISIBILITY,
    )

    crawl_data = crawl_site(website_url=website_url)

    link_validation = validate_link_status(
        crawl_data=crawl_data,
        include_external_links=include_external_links,
        max_checks=1000,
    )

    page_table = build_page_table(crawl_data, link_validation)
    summary = compute_summary(
        crawl_data=crawl_data,
        link_validation=link_validation,
        page_table=page_table,
        website_url=website_url,
        brand_name=brand_name,
    )

    visibility = (
        search_visibility_notes(website_url, brand_name)
        if include_search_visibility
        else {"enabled": False, "notes": "Search visibility disabled."}
    )

    llm = build_llm()

    technical_seo_analyst = Agent(
        role="Technical SEO Analyst",
        goal=(
            "Audit technical SEO quality using crawl evidence, link validation data, "
            "and structural page signals. Rank issues honestly and propose concrete fixes."
        ),
        backstory=(
            "You are a rigorous technical SEO specialist. You focus on crawlability, "
            "metadata hygiene, heading structure, canonicalization, broken links, and "
            "page-level implementation quality. You do not invent rankings or traffic."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    onpage_seo_analyst = Agent(
        role="On-Page SEO Analyst",
        goal=(
            "Evaluate content quality, titles, descriptions, headings, image alt coverage, "
            "and page depth using only the provided crawl data."
        ),
        backstory=(
            "You are an on-page SEO analyst. You care about snippet quality, topical clarity, "
            "content sufficiency, and consistent search-ready page structure."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    data_analyst = Agent(
        role="SEO Data Analyst",
        goal=(
            "Turn crawl evidence into a quantified scorecard with numbers, issue counts, "
            "severity labels, and a priority roadmap."
        ),
        backstory=(
            "You are analytical and evidence-first. You lead with numbers, not vague commentary. "
            "You distinguish measurable issues from inference and do not invent business outcomes."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    frontend_developer = Agent(
        role="Frontend SEO Report Developer",
        goal=(
            "Convert the approved SEO audit into polished raw HTML ready for direct frontend rendering."
        ),
        backstory=(
            "You are a frontend developer for internal dashboards. You write semantic raw HTML "
            "using Tailwind utility classes and daisyUI-style sections. You support light and dark mode. "
            "You avoid markdown and code fences."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    supervisor = Agent(
        role="SEO Audit Supervisor",
        goal=(
            "Approve only a professional, analytical, numerically grounded, visually structured SEO audit."
        ),
        backstory=(
            "You supervise all agents. You reject vague conclusions, invented metrics, weak prioritization, "
            "and poor presentation. You approve only an executive-ready raw HTML report."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    finalizer = Agent(
        role="Final SEO Report Finalizer",
        goal="Prepare the final approved SEO report as raw HTML only.",
        backstory=(
            "You preserve the approved content, make only safe final cleanup edits, "
            "and output raw HTML only."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    publisher = Agent(
        role="SEO Report Publisher",
        goal="Publish only the final approved raw HTML.",
        backstory=(
            "You output only the final raw HTML. No commentary. No markdown fences."
        ),
        llm=llm,
        verbose=True,
        allow_delegation=False,
    )

    technical_task = Task(
        description=(
            f"Website URL: {website_url}\n"
            f"Brand name: {brand_name}\n"
            f"Tone: {tone}\n\n"
            "Use the crawl summary, link validation data, and full page table below to perform a technical SEO audit.\n\n"
            f"Crawl summary JSON:\n{json.dumps(summary, ensure_ascii=False, indent=2)}\n\n"
            f"Link validation JSON:\n{json.dumps(link_validation, ensure_ascii=False, indent=2)}\n\n"
            f"Full page table JSON:\n{json.dumps(page_table, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "1. Technical SEO diagnosis\n"
            "2. Highest-priority technical issues\n"
            "3. Severity labels: critical / high / medium / low\n"
            "4. What is structurally healthy\n"
            "5. What is blocking SEO performance\n"
            "6. Concrete fixes\n\n"
            "Rules:\n"
            "- Use only the provided crawl and link evidence.\n"
            "- Do not invent traffic, rankings, or penalties.\n"
            "- Be specific about affected pages where possible.\n"
        ),
        expected_output=(
            "A structured technical SEO audit with severity-ranked findings and concrete fixes."
        ),
        agent=technical_seo_analyst,
    )

    onpage_task = Task(
        description=(
            f"Website URL: {website_url}\n"
            f"Brand name: {brand_name}\n\n"
            "Use the crawl summary and full page table below to perform an on-page SEO analysis.\n\n"
            f"Crawl summary JSON:\n{json.dumps(summary, ensure_ascii=False, indent=2)}\n\n"
            f"Full page table JSON:\n{json.dumps(page_table, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "1. Title quality analysis\n"
            "2. Meta description analysis\n"
            "3. Heading structure observations\n"
            "4. Thin-content observations\n"
            "5. Image alt-text observations\n"
            "6. On-page improvement priorities\n\n"
            "Rules:\n"
            "- Stay strictly evidence-based.\n"
            "- Do not pretend to know keyword rankings from crawl data alone.\n"
        ),
        expected_output=(
            "A structured on-page SEO analysis with page-quality observations and prioritized improvements."
        ),
        agent=onpage_seo_analyst,
        context=[technical_task],
    )

    data_task = Task(
        description=(
            f"Website URL: {website_url}\n"
            f"Brand name: {brand_name}\n"
            f"Search visibility JSON:\n{json.dumps(visibility, ensure_ascii=False, indent=2)}\n\n"
            "Create a quantified SEO scorecard using the crawl summary, full page table, and prior analyses.\n\n"
            f"Crawl summary JSON:\n{json.dumps(summary, ensure_ascii=False, indent=2)}\n\n"
            f"Full page table JSON:\n{json.dumps(page_table, ensure_ascii=False, indent=2)}\n\n"
            "Required output:\n"
            "1. Executive metric summary\n"
            "2. SEO score out of 100\n"
            "3. Top 5 quantified issues\n"
            "4. Positive signals\n"
            "5. Priority roadmap: immediate / next / later\n"
            "6. Honest caveats about what cannot be inferred\n\n"
            "Rules:\n"
            "- Lead with numbers.\n"
            "- No invented business impact.\n"
            "- No invented rank positions.\n"
        ),
        expected_output=(
            "A quantified SEO scorecard with ranked issues, priorities, and evidence limits."
        ),
        agent=data_analyst,
        context=[technical_task, onpage_task],
    )

    html_task = Task(
        description=(
            "Convert the approved SEO analysis into raw HTML only.\n\n"
            "Critical rules:\n"
            "- Output raw HTML only.\n"
            "- No markdown.\n"
            "- No code fences.\n"
            "- Do not include <html>, <head>, or <body>.\n"
            "- Use Tailwind utility classes.\n"
            "- Use daisyUI-style conventions.\n"
            "- Include one small <style> block at the top for minor polish only.\n"
            "- Support light and dark mode.\n"
            "- Keep the output suitable for direct frontend injection.\n\n"
            "Required UI sections:\n"
            "- hero section with website, brand, and SEO score\n"
            "- explanation strip for how to read the audit\n"
            "- KPI cards grid\n"
            "- overall priority issues section\n"
            "- technical SEO section\n"
            "- on-page SEO section\n"
            "- link health section\n"
            "- full page-by-page summary table\n"
            "- separate per-page audit cards section\n"
            "- action roadmap section\n"
            "- limitations section\n\n"
            "Per-page audit card rules:\n"
            "- one separate card or accordion item for every crawled HTML page\n"
            "- each page card must show:\n"
            "  1. URL\n"
            "  2. page score\n"
            "  3. status code\n"
            "  4. title and title length\n"
            "  5. meta description length\n"
            "  6. H1 count\n"
            "  7. word count\n"
            "  8. canonical present or missing\n"
            "  9. images missing alt\n"
            "  10. broken outgoing links count\n"
            "  11. page-specific issue list\n"
            "- do not merge all pages into one generic paragraph\n\n"
            "Data integrity rules:\n"
            "- Use real numbers from the provided summary and full page table.\n"
            "- If a number is unavailable, show N/A.\n"
            "- Never invent traffic or keyword ranking.\n"
            "- Include concrete page examples where useful.\n\n"
            f"Numeric source of truth:\n{json.dumps(summary, ensure_ascii=False, indent=2)}\n\n"
            f"Link validation source:\n{json.dumps(link_validation, ensure_ascii=False, indent=2)}\n\n"
            f"Full page table source:\n{json.dumps(page_table, ensure_ascii=False, indent=2)}\n"
        ),
        expected_output="A polished raw HTML SEO audit page ready for frontend rendering.",
        agent=frontend_developer,
        context=[technical_task, onpage_task, data_task],
    )

    approval_task = Task(
        description=(
            "Review the final SEO audit output and improve it if necessary.\n\n"
            "Approval rules:\n"
            "- Final output must be raw HTML only.\n"
            "- It must be analytical and professional.\n"
            "- It must contain numbers and figures.\n"
            "- It must clearly prioritize issues.\n"
            "- It must not invent metrics, rankings, traffic, or business outcomes.\n"
            "- It must be visually structured for executive review.\n"
            "- It must include separate page-level results.\n"
            "- It must feel like a frontend-ready report page, not markdown.\n"
        ),
        expected_output="Final approved raw HTML only.",
        agent=supervisor,
        context=[technical_task, onpage_task, data_task, html_task],
    )

    finalize_task = Task(
        description=(
            "Prepare the final publishable SEO report.\n\n"
            "Rules:\n"
            "1. Output raw HTML only.\n"
            "2. Keep the approved structure and make only minimal safe fixes if needed.\n"
            "3. Do not add markdown fences.\n"
            "4. Do not add commentary.\n"
            "5. Preserve light and dark mode support.\n"
        ),
        expected_output="A final raw HTML SEO audit report.",
        agent=finalizer,
        context=[approval_task],
    )

    publish_task = Task(
        description=(
            "Publish the final approved SEO audit.\n\n"
            "Rules:\n"
            "1. Output only the final raw HTML.\n"
            "2. No explanations.\n"
            "3. No markdown fences.\n"
        ),
        expected_output="The final released raw HTML SEO audit report.",
        agent=publisher,
        context=[finalize_task],
    )

    return Crew(
        agents=[
            technical_seo_analyst,
            onpage_seo_analyst,
            data_analyst,
            frontend_developer,
            supervisor,
            finalizer,
            publisher,
        ],
        tasks=[
            technical_task,
            onpage_task,
            data_task,
            html_task,
            approval_task,
            finalize_task,
            publish_task,
        ],
        process=Process.sequential,
        verbose=True,
    )