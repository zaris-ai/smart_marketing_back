import CompetitorAnalysis from '../../models/competitor-analysis.model.js';
import ManageCompetitorAnalysis from '../../models/manage-competitor-analysis.model.js';
import ShopifyTrends from '../../models/shopify-trends.model.js';
import ProblemDiscoveryRun from '../../models/problem-discovery-run.model.js';
import SeoAudit from '../../models/seo-audit.model.js';
import SeoKeywordOpportunity from '../../models/seo-keyword-opportunity.model.js';

import { publishCrewReport } from '../telegram.service.js';

import {
    extractJsonBlock,
    getCrewContent,
    getTasksOutput,
    normalizeHtml,
    withSavedRecord,
} from './common.js';

const SEO_AUDIT_WEBSITE_URL = 'https://web.arkaanalyzer.com/';
const SEO_AUDIT_REPORT_TITLE = 'Arka Analyzer SEO Audit';

function buildCompetitorTelegramReport(doc) {
    return [
        `Competitive Analysis: ${doc.title}`,
        `App: ${doc.appName}`,
        `URL: ${doc.appUrl}`,
        '',
        'Summary',
        'A new competitor analysis report was generated successfully and published for internal review.',
        '',
        'Notes',
        'The full report contains competitor comparisons, strengths, weaknesses, catch-up priorities, differentiation opportunities, and strategic recommendations.',
    ].join('\n');
}

function buildManageCompetitorAnalysisTelegramReport(doc) {
    const competitorLines = Array.isArray(doc.selectedCompetitors)
        ? doc.selectedCompetitors
            .slice(0, 8)
            .map((item) => `• ${item.name}`)
            .join('\n')
        : '';

    return [
        `Managed Competitor Analysis: ${doc.title}`,
        `App: ${doc.appName}`,
        `URL: ${doc.appUrl}`,
        '',
        'Goal',
        doc.analysisGoal || '-',
        '',
        'Selected Competitors',
        competitorLines || 'No competitors listed.',
        '',
        'Summary',
        'A new managed competitor analysis was generated and saved successfully.',
    ]
        .filter(Boolean)
        .join('\n');
}

function buildShopifyTrendsTelegramReport(doc) {
    return [
        `Shopify Trends Report: ${doc.title}`,
        `Topic: ${doc.topic}`,
        `Target App: ${doc.targetAppName}`,
        `Target URL: ${doc.targetAppUrl}`,
        '',
        'Summary',
        'A new Shopify trends report was generated successfully and published for internal review.',
        '',
        'Notes',
        'The full report contains market trends, app analysis, store patterns, traffic opportunity, risks, and recommended actions.',
    ].join('\n');
}

function buildProblemDiscoveryTelegramReport(doc, parsed) {
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const summary = parsed?.summary || {};

    const acceptedCount =
        typeof summary.accepted_count === 'number'
            ? summary.accepted_count
            : items.length;

    const totalCandidates =
        typeof summary.total_candidates === 'number'
            ? summary.total_candidates
            : items.length;

    const topItems = items.slice(0, 5).map((item) => {
        const category = item?.pain_category || 'unknown';
        const solve = item?.can_arka_solve ? 'Arka can solve now' : 'Arka gap';
        return `• [${category}] ${item?.question || 'Untitled question'} — ${solve}`;
    });

    const sources = [...new Set(items.map((item) => item?.source).filter(Boolean))]
        .slice(0, 5)
        .map((source) => `• ${source}`);

    return [
        'Problem Discovery Run',
        `Accepted: ${acceptedCount}`,
        `Total candidates: ${totalCandidates}`,
        '',
        'Summary',
        doc?.sourceUrls?.length
            ? `Analyzed ${doc.sourceUrls.length} submitted source URL(s) and extracted merchant problems/questions.`
            : 'A new problem discovery run was generated successfully.',
        '',
        topItems.length ? `Top Items\n${topItems.join('\n')}` : '',
        sources.length ? `Sources\n${sources.join('\n')}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function buildSeoAuditTelegramReport(doc) {
    return [
        `SEO Audit: ${doc.title}`,
        `Website: ${doc.websiteUrl}`,
        '',
        'Summary',
        'A new SEO audit report was generated successfully and published for internal review.',
        '',
        'Notes',
        'The full report contains technical SEO findings, on-page issues, link health, page-level audit details, and a priority roadmap.',
    ].join('\n');
}

function buildSeoKeywordOpportunityTelegramReport(doc) {
    return [
        'SEO Keyword Opportunity Report',
        `Website: ${doc.websiteUrl}`,
        doc.brandName ? `Brand: ${doc.brandName}` : '',
        `Max keywords: ${doc.maxKeywords}`,
        '',
        'Summary',
        'A new SEO keyword opportunity report was generated successfully and published for internal review.',
        '',
        'Notes',
        'The full report contains keyword opportunities, quick wins, difficulty analysis, competitor signals, page strategy, and an action roadmap.',
    ]
        .filter(Boolean)
        .join('\n');
}

async function publishReportWithTelegram({
    saved,
    run,
    crewName,
    sourceFile,
    html,
    telegramReport,
    tasksOutput,
    fallbackModel,
}) {
    try {
        const telegram = await publishCrewReport({
            crewName,
            executedBy: {
                _id: run.createdBy || null,
                name: run.meta?.executedByName || 'Unknown user',
            },
            createdAt: saved.createdAt || new Date(),
            savedId: saved._id.toString(),
            sourceFile,
            html: html || '',
            telegramReport,
            tasksOutput,
        });

        saved.telegram = {
            published: !telegram?.skipped && !!telegram?.ok,
            channelId: process.env.TELEGRAM_CHANNEL_ID || '',
            messageIds: telegram?.messages?.map((m) => m.messageId) || [],
            publishedAt: telegram?.ok ? new Date() : null,
            reportHtml: telegram?.reportHtml || '',
            error: '',
        };

        await saved.save();

        return withSavedRecord(
            {
                parsed: null,
                telegram,
                telegramReport,
            },
            saved,
            fallbackModel
        );
    } catch (telegramError) {
        console.error(`${crewName} telegram publish failed:`, telegramError);

        saved.telegram = {
            published: false,
            channelId: process.env.TELEGRAM_CHANNEL_ID || '',
            messageIds: [],
            publishedAt: null,
            reportHtml: '',
            error: telegramError.message || 'Telegram publish failed',
        };

        await saved.save();

        return withSavedRecord(
            {
                parsed: null,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message,
                },
                telegramReport: '',
            },
            saved,
            fallbackModel
        );
    }
}

export async function finalizeCompetitorAnalysisRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const html = normalizeHtml(rawContent);

    if (!html) {
        throw new Error('Competitor analysis crew did not return valid HTML content');
    }

    const saved = await CompetitorAnalysis.create({
        title: run.meta?.title || 'Arka Smart Analyzer Competitive Analysis',
        appName: run.meta?.appName || 'Arka: Smart Analyzer',
        appUrl: run.meta?.appUrl || 'https://apps.shopify.com/arka-smart-analyzer',
        crewName: 'competitor_analysis',
        html,
        rawResult: result,
        status: 'success',
        generatedAt: new Date(),
    });

    return publishReportWithTelegram({
        saved,
        run,
        crewName: 'competitor_analysis',
        sourceFile: 'competitor_analysis',
        html: saved.html,
        telegramReport: buildCompetitorTelegramReport(saved),
        fallbackModel: 'CompetitorAnalysis',
    });
}

export async function finalizeManageCompetitorAnalysisRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const html = normalizeHtml(rawContent);

    if (!html) {
        throw new Error('Managed competitor analysis crew returned invalid HTML content');
    }

    const payload = run.payload || {};
    const meta = run.meta || {};

    const selectedCompetitors =
        Array.isArray(meta.selectedCompetitors) && meta.selectedCompetitors.length
            ? meta.selectedCompetitors
            : Array.isArray(payload.competitors)
                ? payload.competitors.map((item) => ({
                    competitorId: item.id,
                    name: item.name,
                    description: item.description || '',
                    status: item.status || 'active',
                    links: Array.isArray(item.links) ? item.links : [],
                }))
                : [];

    const selectedCompetitorIds =
        Array.isArray(meta.selectedCompetitorIds) && meta.selectedCompetitorIds.length
            ? meta.selectedCompetitorIds
            : Array.isArray(payload.selected_competitor_ids)
                ? payload.selected_competitor_ids
                : selectedCompetitors.map((item) => item.competitorId).filter(Boolean);

    const excludedCompetitorIds = Array.isArray(meta.excludedCompetitorIds)
        ? meta.excludedCompetitorIds
        : Array.isArray(payload.excluded_competitor_ids)
            ? payload.excluded_competitor_ids
            : [];

    const saved = await ManageCompetitorAnalysis.create({
        title: `${meta.appName || payload.app_name || 'Arka: Smart Analyzer'
            } Competitor Analysis`,
        appName: meta.appName || payload.app_name || 'Arka: Smart Analyzer',
        appUrl:
            meta.appUrl ||
            payload.app_store_url ||
            'https://apps.shopify.com/arka-smart-analyzer',
        crewName: 'manage_competitor_analysis',
        analysisGoal:
            meta.analysisGoal ||
            payload.analysis_goal ||
            'Analyze selected competitors and identify strengths, weaknesses, and catch-up priorities.',
        selectedCompetitorIds,
        excludedCompetitorIds,
        maxSelectedCompetitors:
            meta.maxSelectedCompetitors ?? payload.max_selected_competitors ?? 0,
        selectedCompetitors,
        html,
        rawResult: result,
        status: 'success',
        generatedAt: new Date(),
    });

    return publishReportWithTelegram({
        saved,
        run,
        crewName: 'manage_competitor_analysis',
        sourceFile: 'manage_competitor_analysis',
        html: saved.html || '',
        telegramReport: buildManageCompetitorAnalysisTelegramReport(saved),
        fallbackModel: 'ManageCompetitorAnalysis',
    });
}

export async function finalizeShopifyTrendsRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const html = normalizeHtml(rawContent);

    if (!html) {
        throw new Error('Shopify trends crew did not return valid HTML content');
    }

    const payload = run.payload || {};
    const meta = run.meta || {};

    const saved = await ShopifyTrends.create({
        title: meta.title || 'Shopify Trends Report',
        topic: meta.topic || payload.topic || '',
        targetAppName:
            meta.targetAppName || payload.target_app_name || 'Arka: Smart Analyzer',
        targetAppUrl:
            meta.targetAppUrl ||
            payload.target_app_url ||
            'https://apps.shopify.com/arka-smart-analyzer',
        crewName: 'shopify_trends',
        html,
        rawResult: result,
        status: 'success',
        generatedAt: new Date(),
    });

    return publishReportWithTelegram({
        saved,
        run,
        crewName: 'shopify_trends',
        sourceFile: 'shopify_trends',
        html: saved.html,
        telegramReport: buildShopifyTrendsTelegramReport(saved),
        fallbackModel: 'ShopifyTrends',
    });
}

export async function finalizeProblemDiscoveryRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = extractJsonBlock(rawContent);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Problem discovery crew returned invalid JSON content');
    }

    if (!Array.isArray(parsed.items)) {
        throw new Error('Problem discovery crew response is missing items array');
    }

    const payload = run.payload || {};
    const meta = run.meta || {};

    const summary = parsed.summary || {
        total_candidates: parsed.items.length,
        accepted_count: parsed.items.length,
    };

    const saved = await ProblemDiscoveryRun.create({
        sourceUrls: Array.isArray(meta.sourceUrls)
            ? meta.sourceUrls
            : Array.isArray(payload.urls)
                ? payload.urls
                : [],
        appReferenceUrl:
            meta.appReferenceUrl ||
            payload.app_reference_url ||
            'https://apps.shopify.com/arka-smart-analyzer',
        maxResults: meta.maxResults || payload.max_results || 20,
        items: parsed.items,
        summary,
        crewName: 'problem_discovery',
        rawResult: result,
        generatedAt: new Date(),
    });

    try {
        const telegramReport = buildProblemDiscoveryTelegramReport(saved, parsed);

        const telegram = await publishCrewReport({
            crewName: 'problem_discovery',
            executedBy: {
                _id: run.createdBy || null,
                name: run.meta?.executedByName || 'Unknown user',
            },
            createdAt: saved.createdAt || new Date(),
            savedId: saved._id.toString(),
            sourceFile: 'problem_discovery',
            html: '',
            telegramReport,
        });

        if (saved.telegram !== undefined || saved.schema?.path?.('telegram')) {
            saved.telegram = {
                published: !telegram?.skipped && !!telegram?.ok,
                channelId: process.env.TELEGRAM_CHANNEL_ID || '',
                messageIds: telegram?.messages?.map((m) => m.messageId) || [],
                publishedAt: telegram?.ok ? new Date() : null,
                reportHtml: telegram?.reportHtml || '',
                error: '',
            };

            await saved.save();
        }

        return withSavedRecord(
            {
                parsed,
                telegram,
                telegramReport,
            },
            saved,
            'ProblemDiscoveryRun'
        );
    } catch (telegramError) {
        console.error('problem discovery telegram publish failed:', telegramError);

        return withSavedRecord(
            {
                parsed,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message,
                },
                telegramReport: '',
            },
            saved,
            'ProblemDiscoveryRun'
        );
    }
}

export async function finalizeSeoAuditRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const html = normalizeHtml(rawContent);

    if (!html) {
        const failed = await SeoAudit.create({
            title: run.meta?.title || SEO_AUDIT_REPORT_TITLE,
            websiteUrl: run.meta?.websiteUrl || SEO_AUDIT_WEBSITE_URL,
            crewName: 'seo_audit',
            html: '',
            rawResult: result,
            status: 'failed',
            error: 'SEO audit crew did not return valid HTML content',
            generatedAt: new Date(),
        });

        throw new Error(
            `SEO audit crew did not return valid HTML content. Failed record: ${failed._id}`
        );
    }

    const saved = await SeoAudit.create({
        title: run.meta?.title || SEO_AUDIT_REPORT_TITLE,
        websiteUrl: run.meta?.websiteUrl || SEO_AUDIT_WEBSITE_URL,
        crewName: 'seo_audit',
        html,
        rawResult: result,
        status: 'success',
        error: '',
        generatedAt: new Date(),
    });

    return publishReportWithTelegram({
        saved,
        run,
        crewName: 'seo_audit',
        sourceFile: 'seo_audit',
        html: saved.html,
        telegramReport: buildSeoAuditTelegramReport(saved),
        fallbackModel: 'SeoAudit',
    });
}

export async function finalizeSeoKeywordOpportunityRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const resultContent = normalizeHtml(rawContent) || String(rawContent || '').trim();

    const payload = run.payload || {};
    const meta = run.meta || {};

    if (!resultContent) {
        const failed = await SeoKeywordOpportunity.create({
            websiteUrl: meta.websiteUrl || payload.website_url || '',
            brandName: meta.brandName || payload.brand_name || '',
            tone: meta.tone || payload.tone || 'professional and analytical',
            maxKeywords: meta.maxKeywords || payload.max_keywords || 12,
            crewName: 'seo_keyword_opportunity',
            resultContent: '',
            tasksOutput: getTasksOutput(result),
            rawResponse: result,
            status: 'failed',
        });

        throw new Error(
            `SEO keyword opportunity crew returned empty content. Failed record: ${failed._id}`
        );
    }

    const saved = await SeoKeywordOpportunity.create({
        websiteUrl: meta.websiteUrl || payload.website_url || '',
        brandName: meta.brandName || payload.brand_name || '',
        tone: meta.tone || payload.tone || 'professional and analytical',
        maxKeywords: meta.maxKeywords || payload.max_keywords || 12,
        crewName: 'seo_keyword_opportunity',
        resultContent,
        tasksOutput: getTasksOutput(result),
        rawResponse: result,
        status: 'success',
    });

    return publishReportWithTelegram({
        saved,
        run,
        crewName: 'seo_keyword_opportunity',
        sourceFile: 'seo_keyword_opportunity',
        html: saved.resultContent || '',
        telegramReport: buildSeoKeywordOpportunityTelegramReport(saved),
        tasksOutput: saved.tasksOutput || [],
        fallbackModel: 'SeoKeywordOpportunity',
    });
}