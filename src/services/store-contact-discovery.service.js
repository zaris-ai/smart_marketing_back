import dns from 'node:dns/promises';
import net from 'node:net';
import * as cheerio from 'cheerio';

const DEFAULT_MAX_PAGES = Number(process.env.STORE_CONTACT_CRAWL_MAX_PAGES || 30);
const DEFAULT_TIMEOUT_MS = Number(process.env.STORE_CONTACT_CRAWL_TIMEOUT_MS || 12000);
const MAX_HTML_CHARS = Number(process.env.STORE_CONTACT_CRAWL_MAX_HTML_CHARS || 1_500_000);
const MAX_REDIRECTS = Number(process.env.STORE_CONTACT_CRAWL_MAX_REDIRECTS || 5);

const USER_AGENT =
    process.env.STORE_CONTACT_CRAWL_USER_AGENT ||
    'ArkaAnalyzerContactDiscovery/1.0 (+https://arkaanalyzer.com)';

function normalizeDomain(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '');
}

function normalizeUrl(value = '') {
    const raw = String(value || '').trim();

    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) return raw;

    return `https://${raw}`;
}

function isPrivateIp(ip) {
    const version = net.isIP(ip);

    if (version === 4) {
        const parts = ip.split('.').map(Number);
        const [a, b] = parts;

        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a === 169 && b === 254 ||
            a === 172 && b >= 16 && b <= 31 ||
            a === 192 && b === 168 ||
            a === 100 && b >= 64 && b <= 127 ||
            a === 192 && b === 0 ||
            a === 198 && (b === 18 || b === 19) ||
            a >= 224
        );
    }

    if (version === 6) {
        const lower = ip.toLowerCase();

        return (
            lower === '::1' ||
            lower.startsWith('fc') ||
            lower.startsWith('fd') ||
            lower.startsWith('fe80') ||
            lower.startsWith('::ffff:127.') ||
            lower.startsWith('::ffff:10.') ||
            lower.startsWith('::ffff:192.168.')
        );
    }

    return true;
}

async function assertPublicHttpUrl(url) {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }

    const hostname = parsed.hostname.toLowerCase();

    if (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local')
    ) {
        throw new Error('Localhost/private hostnames are not allowed.');
    }

    const literalIpVersion = net.isIP(hostname);

    if (literalIpVersion) {
        if (isPrivateIp(hostname)) {
            throw new Error('Private IP addresses are not allowed.');
        }

        return;
    }

    const records = await dns.lookup(hostname, { all: true });

    if (!records.length) {
        throw new Error(`DNS lookup failed for ${hostname}`);
    }

    for (const record of records) {
        if (isPrivateIp(record.address)) {
            throw new Error(`Private DNS target is not allowed: ${hostname}`);
        }
    }
}

async function fetchHtml(url) {
    let currentUrl = url;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        await assertPublicHttpUrl(currentUrl);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

        try {
            const response = await fetch(currentUrl, {
                method: 'GET',
                redirect: 'manual',
                signal: controller.signal,
                headers: {
                    'user-agent': USER_AGENT,
                    accept: 'text/html,application/xhtml+xml',
                },
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');

                if (!location) {
                    throw new Error(`Redirect without Location header: ${response.status}`);
                }

                currentUrl = new URL(location, currentUrl).toString();
                continue;
            }

            const contentType = response.headers.get('content-type') || '';

            if (!contentType.toLowerCase().includes('text/html')) {
                return {
                    ok: false,
                    status: response.status,
                    finalUrl: currentUrl,
                    html: '',
                    reason: `Non-HTML content-type: ${contentType}`,
                };
            }

            const rawHtml = await response.text();

            return {
                ok: response.ok,
                status: response.status,
                finalUrl: currentUrl,
                html: rawHtml.slice(0, MAX_HTML_CHARS),
                reason: response.ok ? '' : `HTTP ${response.status}`,
            };
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Too many redirects for ${url}`);
}

function sameDomain(url, rootDomain) {
    try {
        const parsed = new URL(url);
        const host = normalizeDomain(parsed.hostname);
        const root = normalizeDomain(rootDomain);

        return host === root || host.endsWith(`.${root}`);
    } catch {
        return false;
    }
}

function isAssetUrl(url) {
    return /\.(jpg|jpeg|png|gif|webp|svg|ico|css|js|pdf|zip|rar|7z|mp4|mp3|avi|mov|woff|woff2|ttf|eot)$/i.test(
        new URL(url).pathname
    );
}

function canonicalPageUrl(url) {
    const parsed = new URL(url);
    parsed.hash = '';

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
}

function scoreInternalLink(url) {
    const value = url.toLowerCase();

    if (/contact|contact-us|support|customer-service|get-in-touch/.test(value)) return 100;
    if (/about|about-us|our-story|company/.test(value)) return 80;
    if (/help|faq|shipping|returns|refund/.test(value)) return 60;
    if (/privacy|terms|imprint|legal/.test(value)) return 40;

    return 10;
}

function deobfuscateText(value = '') {
    return String(value)
        .replace(/\s*\[at\]\s*/gi, '@')
        .replace(/\s*\(at\)\s*/gi, '@')
        .replace(/\s+at\s+/gi, '@')
        .replace(/\s*\[dot\]\s*/gi, '.')
        .replace(/\s*\(dot\)\s*/gi, '.')
        .replace(/\s+dot\s+/gi, '.');
}

function cleanEmail(value = '') {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/^mailto:/i, '')
        .replace(/\?.*$/, '')
        .replace(/[),.;:'"<>]+$/g, '');
}

function isUsefulEmail(email) {
    if (!email || !email.includes('@')) return false;
    if (email.length > 254) return false;
    if (email.includes('example.com')) return false;
    if (email.includes('@email.com')) return false;
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(email)) return false;

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function classifySocialUrl(url) {
    try {
        const parsed = new URL(url);
        const host = normalizeDomain(parsed.hostname);
        const pathname = parsed.pathname.toLowerCase();

        if (host === 'instagram.com') return 'instagram';
        if (host === 't.me' || host === 'telegram.me') return 'telegram';
        if (host === 'linkedin.com' && /^\/(company|in|showcase)\//.test(pathname)) return 'linkedin';
        if (host === 'facebook.com' || host === 'fb.com') return 'facebook';
        if (host === 'x.com' || host === 'twitter.com') return 'twitter';
        if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
        if (host === 'tiktok.com') return 'tiktok';
        if (host === 'pinterest.com') return 'pinterest';
        if (host === 'wa.me' || host === 'api.whatsapp.com') return 'whatsapp';

        return '';
    } catch {
        return '';
    }
}

function pickPrimaryEmail(emails = [], domain = '') {
    const root = normalizeDomain(domain);

    const scored = emails.map((entry) => {
        const email = entry.value;
        const [local, emailDomain] = email.split('@');

        let score = 0;

        if (emailDomain === root || emailDomain.endsWith(`.${root}`)) score += 50;

        if (/^(contact|hello|info|support|sales|team|admin|marketing|partnerships)$/i.test(local)) {
            score += 40;
        }

        if (/^(no-reply|noreply|donotreply|do-not-reply)$/i.test(local)) {
            score -= 100;
        }

        return { email, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.email || '';
}

function extractPageData(html, pageUrl, rootDomain) {
    const $ = cheerio.load(html);

    const emails = [];
    const phones = [];
    const socialProfiles = [];
    const contactForms = [];
    const internalLinks = [];

    const rootText = deobfuscateText(`${$.root().text()} ${html}`);

    const emailMatches = rootText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];

    for (const rawEmail of emailMatches) {
        const email = cleanEmail(rawEmail);

        if (isUsefulEmail(email)) {
            emails.push({
                value: email,
                sourceUrl: pageUrl,
                kind: 'text',
            });
        }
    }

    const phoneMatches =
        rootText.match(/(?:\+|00)\d[\d\s().-]{7,}\d/g) || [];

    for (const rawPhone of phoneMatches) {
        const phone = rawPhone.replace(/\s+/g, ' ').trim();

        if (phone.length <= 30) {
            phones.push({
                value: phone,
                sourceUrl: pageUrl,
            });
        }
    }

    $('a[href]').each((_, element) => {
        const href = String($(element).attr('href') || '').trim();

        if (!href) return;

        if (href.toLowerCase().startsWith('mailto:')) {
            const email = cleanEmail(href);

            if (isUsefulEmail(email)) {
                emails.push({
                    value: email,
                    sourceUrl: pageUrl,
                    kind: 'mailto',
                });
            }

            return;
        }

        if (href.toLowerCase().startsWith('tel:')) {
            const phone = href.replace(/^tel:/i, '').trim();

            if (phone) {
                phones.push({
                    value: phone,
                    sourceUrl: pageUrl,
                });
            }

            return;
        }

        let absoluteUrl = '';

        try {
            absoluteUrl = new URL(href, pageUrl).toString();
        } catch {
            return;
        }

        const platform = classifySocialUrl(absoluteUrl);

        if (platform) {
            socialProfiles.push({
                platform,
                url: canonicalPageUrl(absoluteUrl),
                sourceUrl: pageUrl,
            });

            return;
        }

        if (!sameDomain(absoluteUrl, rootDomain)) return;
        if (isAssetUrl(absoluteUrl)) return;

        internalLinks.push(canonicalPageUrl(absoluteUrl));
    });

    $('form').each((_, element) => {
        const form = $(element);
        const formHtml = String($.html(element) || '').toLowerCase();
        const action = String(form.attr('action') || '').trim();
        const method = String(form.attr('method') || 'GET').toUpperCase();

        const isLikelyContactForm =
            /contact|support|message|inquiry|help|customer/.test(formHtml) ||
            form.find('input[type="email"]').length > 0 ||
            form.find('textarea').length > 0;

        if (!isLikelyContactForm) return;

        contactForms.push({
            url: pageUrl,
            action: action ? new URL(action, pageUrl).toString() : pageUrl,
            method,
        });
    });

    return {
        emails,
        phones,
        socialProfiles,
        contactForms,
        internalLinks,
    };
}

function dedupeByKey(items, keyFn) {
    const map = new Map();

    for (const item of items) {
        const key = keyFn(item);

        if (!key || map.has(key)) continue;

        map.set(key, item);
    }

    return [...map.values()];
}

export async function discoverStoreContactPoints(inputUrlOrDomain, options = {}) {
    const rootDomain = normalizeDomain(inputUrlOrDomain);
    const maxPages = Math.min(
        Math.max(Number(options.maxPages || DEFAULT_MAX_PAGES), 1),
        100
    );

    const startedAt = new Date();

    const queue = [
        normalizeUrl(rootDomain),
        `https://www.${rootDomain}`,
        `http://${rootDomain}`,
    ];

    const visited = new Set();
    const errors = [];
    const pages = [];

    const allEmails = [];
    const allPhones = [];
    const allSocialProfiles = [];
    const allContactForms = [];

    while (queue.length && visited.size < maxPages) {
        const nextUrl = queue.shift();

        if (!nextUrl) continue;

        let pageUrl;

        try {
            pageUrl = canonicalPageUrl(nextUrl);
        } catch {
            continue;
        }

        if (visited.has(pageUrl)) continue;

        visited.add(pageUrl);

        try {
            const fetched = await fetchHtml(pageUrl);

            pages.push({
                url: fetched.finalUrl,
                status: fetched.status,
                ok: fetched.ok,
                reason: fetched.reason,
            });

            if (!fetched.ok || !fetched.html) continue;

            const extracted = extractPageData(fetched.html, fetched.finalUrl, rootDomain);

            allEmails.push(...extracted.emails);
            allPhones.push(...extracted.phones);
            allSocialProfiles.push(...extracted.socialProfiles);
            allContactForms.push(...extracted.contactForms);

            const sortedLinks = dedupeByKey(
                extracted.internalLinks,
                (item) => item
            ).sort((a, b) => scoreInternalLink(b) - scoreInternalLink(a));

            for (const link of sortedLinks) {
                if (visited.size + queue.length >= maxPages * 3) break;
                if (!visited.has(link) && sameDomain(link, rootDomain)) {
                    queue.push(link);
                }
            }
        } catch (error) {
            errors.push({
                url: pageUrl,
                message: error?.message || 'Unknown crawl error',
            });
        }
    }

    const emails = dedupeByKey(allEmails, (item) => item.value);
    const phones = dedupeByKey(allPhones, (item) => item.value);
    const socialProfiles = dedupeByKey(
        allSocialProfiles,
        (item) => `${item.platform}:${item.url}`
    );
    const contactForms = dedupeByKey(
        allContactForms,
        (item) => `${item.method}:${item.action}`
    );

    const primaryEmail = pickPrimaryEmail(emails, rootDomain);

    const status =
        pages.some((page) => page.ok) && (emails.length || socialProfiles.length || contactForms.length)
            ? 'success'
            : pages.some((page) => page.ok)
                ? 'partial'
                : 'failed';

    return {
        status,
        inputDomain: rootDomain,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        maxPages,
        pageCount: pages.length,
        primaryEmail,
        emails,
        phones,
        socialProfiles,
        contactForms,
        pages,
        crawlErrors: errors.slice(0, 30),
        summary: {
            emailCount: emails.length,
            phoneCount: phones.length,
            socialProfileCount: socialProfiles.length,
            contactFormCount: contactForms.length,
            pagesVisited: pages.length,
            errorCount: errors.length,
        },
    };
}