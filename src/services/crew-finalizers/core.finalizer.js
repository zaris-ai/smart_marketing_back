import DashboardPage from '../../models/dashboard-page.model.js';
import GmailEmail from '../../models/gmailEmail.model.js';
import StoreCrmAnalysis from '../../models/storeCrmAnalysis.model.js';
import StoreOutreach from '../../models/store-outreach.model.js';

import { publishCrewReport } from '../telegram.service.js';

import {
    extractJsonBlock,
    getCrewContent,
    getTasksOutput,
    marked,
    safeParseJson,
    stripMarkdown,
    truncateText,
    withSavedRecord,
} from './common.js';

function validateMarketingEmailReplyResponse(parsed) {
    if (!parsed || typeof parsed !== 'object') {
        const error = new Error('Crew returned invalid JSON content');
        error.statusCode = 500;
        throw error;
    }

    if (!parsed.contact || typeof parsed.contact !== 'object') {
        const error = new Error('Crew response is missing contact section');
        error.statusCode = 500;
        throw error;
    }

    if (!parsed.analysis || typeof parsed.analysis !== 'object') {
        const error = new Error('Crew response is missing analysis section');
        error.statusCode = 500;
        throw error;
    }

    if (!parsed.reply || typeof parsed.reply !== 'object') {
        const error = new Error('Crew response is missing reply section');
        error.statusCode = 500;
        throw error;
    }

    if (!String(parsed.reply.subject || '').trim()) {
        const error = new Error('Crew response is missing reply.subject');
        error.statusCode = 500;
        throw error;
    }

    if (!String(parsed.reply.body_text || '').trim()) {
        const error = new Error('Crew response is missing reply.body_text');
        error.statusCode = 500;
        throw error;
    }
}

function pickStoreName(parsed, fallback = '') {
    return (
        parsed?.store?.name ||
        parsed?.store_name ||
        parsed?.title ||
        fallback ||
        ''
    );
}

function buildResearchTelegramReport(parsed, payload) {
    const title = String(parsed?.title || payload.topic || 'Research').trim();
    const reviewerNotes = String(parsed?.reviewer_notes || '').trim();
    const reportMarkdown = String(parsed?.report_markdown || '').trim();
    const sources = Array.isArray(parsed?.sources) ? parsed.sources : [];

    const plainReport = stripMarkdown(reportMarkdown);
    const executiveChunk =
        plainReport.split(/\n\s*\n/).find(Boolean) || plainReport || '';

    const sourceLines = sources
        .slice(0, 5)
        .map((source) => `• ${source.title || source.url || 'Source'}`)
        .join('\n');

    return [
        `Research: ${title}`,
        `Topic: ${payload.topic || ''}`,
        `Audience: ${payload.audience || ''}`,
        payload.market ? `Market: ${payload.market}` : '',
        '',
        'Summary',
        truncateText(executiveChunk, 1800),
        sourceLines ? '\nTop Sources\n' + sourceLines : '',
        reviewerNotes ? `\nReviewer Notes\n${truncateText(reviewerNotes, 500)}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function buildStoreOutreachTelegramReport(doc, parsed) {
    const storeName = doc.storeName || parsed?.store?.name || 'Unknown store';
    const websiteUrl = doc.websiteUrl || parsed?.store?.website_url || '';
    const summary = parsed?.store?.summary || '';
    const overallFit = parsed?.app_fit?.overall_fit || 'unknown';

    const fitScore =
        parsed?.app_fit?.fit_score !== undefined &&
            parsed?.app_fit?.fit_score !== null
            ? String(parsed.app_fit.fit_score)
            : 'N/A';

    const useCases = Array.isArray(parsed?.app_fit?.use_cases)
        ? parsed.app_fit.use_cases
            .slice(0, 4)
            .map((item) => `• ${item}`)
            .join('\n')
        : '';

    const pitchAngles = Array.isArray(parsed?.app_fit?.pitch_angles)
        ? parsed.app_fit.pitch_angles
            .slice(0, 3)
            .map((item) => `• ${item}`)
            .join('\n')
        : '';

    const subject = parsed?.email?.subject || '';
    const previewLine = parsed?.email?.preview_line || '';

    return [
        `Store Outreach: ${doc.title}`,
        `Store: ${storeName}`,
        websiteUrl ? `Website: ${websiteUrl}` : '',
        '',
        'Summary',
        summary ||
        'A new outreach analysis was generated successfully for internal review.',
        '',
        'Fit',
        `Overall fit: ${overallFit}`,
        `Fit score: ${fitScore}`,
        '',
        useCases ? `Top Use Cases\n${useCases}` : '',
        pitchAngles ? `Pitch Angles\n${pitchAngles}` : '',
        subject ? `Email Subject\n${subject}` : '',
        previewLine ? `Preview Line\n${previewLine}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

export async function finalizeDashboardRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = extractJsonBlock(rawContent);

    const html = parsed?.html || '';
    const telegramReport = parsed?.telegram_report || '';

    if (!html) {
        throw new Error('Dashboard HTML was empty or crew output was invalid');
    }

    const saved = await DashboardPage.create({
        html,
        crew: 'dashboard',
        sourceFile: run.meta?.sourceFile || 'dashboard_file.md',
        executedBy: run.createdBy || null,
        executedByName: run.meta?.executedByName || 'Unknown user',
        meta: {
            telegram_report: telegramReport,
            raw_crew_content: rawContent,
            tasks_output: getTasksOutput(result),
            crewRunId: run._id,
        },
    });

    let telegram = {
        ok: false,
        skipped: true,
        reason: 'Not attempted',
    };

    try {
        telegram = await publishCrewReport({
            crewName: saved.crew,
            executedBy: {
                _id: run.createdBy || null,
                name: saved.executedByName,
            },
            createdAt: saved.createdAt,
            savedId: saved._id.toString(),
            sourceFile: saved.sourceFile,
            html: saved.html,
            telegramReport,
            tasksOutput: saved.meta?.tasks_output || [],
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
    } catch (telegramError) {
        saved.telegram = {
            published: false,
            channelId: process.env.TELEGRAM_CHANNEL_ID || '',
            messageIds: [],
            publishedAt: null,
            reportHtml: '',
            error: telegramError.message || 'Telegram publish failed',
        };

        await saved.save();

        telegram = {
            ok: false,
            skipped: false,
            error: telegramError.message,
        };
    }

    return withSavedRecord({ telegram, telegramReport }, saved, 'DashboardPage');
}

export async function finalizeResearchRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = extractJsonBlock(rawContent);

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Research crew returned invalid JSON content');
    }

    let telegram = {
        ok: false,
        skipped: true,
        reason: 'Research was not approved or report_markdown was empty',
    };

    if (parsed?.approved && parsed?.report_markdown) {
        try {
            const telegramReport = buildResearchTelegramReport(parsed, run.payload || {});
            const contentHtml = marked.parse(String(parsed.report_markdown || ''));

            telegram = await publishCrewReport({
                crewName: 'research',
                executedBy: {
                    _id: run.createdBy || null,
                    name: run.meta?.executedByName || 'Unknown user',
                },
                createdAt: new Date(),
                savedId: String(run._id),
                sourceFile: 'research',
                html: contentHtml,
                telegramReport,
            });

            return {
                saved: null,
                savedRecord: null,
                parsed,
                telegram,
                telegramReport,
            };
        } catch (telegramError) {
            console.error('research telegram publish failed:', telegramError);

            return {
                saved: null,
                savedRecord: null,
                parsed,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message,
                },
                telegramReport: '',
            };
        }
    }

    return {
        saved: null,
        savedRecord: null,
        parsed,
        telegram,
        telegramReport: '',
    };
}

export async function finalizeMarketingEmailReplyRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = safeParseJson(rawContent);

    validateMarketingEmailReplyResponse(parsed);

    const query = run.meta?.gmailEmailId
        ? { _id: run.meta.gmailEmailId }
        : { gmailId: run.meta?.gmailId };

    if (!query._id && !query.gmailId) {
        throw new Error('Missing Gmail email identifier for finalizing analysis');
    }

    const saved = await GmailEmail.findOneAndUpdate(
        query,
        {
            $set: {
                latestAnalysis: parsed,
            },
            $push: {
                analysisHistory: {
                    analyzedAt: new Date(),
                    crewName: 'marketing_email_reply',
                    payload: run.payload || {},
                    result: parsed,
                    rawContent,
                    crewRunId: run._id,
                },
            },
        },
        {
            new: true,
        }
    );

    if (!saved) {
        throw new Error('Saved Gmail email not found for analysis finalization');
    }

    return withSavedRecord({ parsed }, saved, 'GmailEmail');
}

export async function finalizeStoreCrmAnalysisRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = extractJsonBlock(rawContent);

    if (!run.meta?.storeId) {
        throw new Error('Missing storeId for CRM analysis finalization');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Store CRM analysis crew returned invalid JSON content');
    }

    const analysis =
        parsed.analysis && typeof parsed.analysis === 'object'
            ? parsed.analysis
            : parsed;

    const title =
        parsed.title ||
        `CRM Analysis: ${run.meta?.storeName || run.meta?.storeDomain || run.meta?.storeId
        }`;

    const saved = await StoreCrmAnalysis.create({
        store: run.meta.storeId,
        storeName: run.meta?.storeName || '',
        storeDomain: run.meta?.storeDomain || '',
        title,
        crewName: 'store_crm_analysis',
        analysis,
        status: 'success',
        error: '',
        rawContent,
        payload: run.payload || {},
        meta: {
            crewRunId: run._id,
            storeName: run.meta?.storeName || '',
            storeDomain: run.meta?.storeDomain || '',
            activitiesCount: run.meta?.activitiesCount || 0,
            tasks_output: getTasksOutput(result),
        },
        generatedAt: new Date(),
        telegram: {
            published: false,
            channelId: process.env.TELEGRAM_CHANNEL_ID || '',
            messageIds: [],
            publishedAt: null,
            error: '',
        },
    });

    return withSavedRecord({ parsed: analysis }, saved, 'StoreCrmAnalysis');
}

export async function finalizeStoreOutreachRun({ run, result }) {
    const rawContent = getCrewContent(result);
    const parsed = extractJsonBlock(rawContent);

    if (!parsed) {
        throw new Error('Store outreach crew did not return valid JSON content');
    }

    if (!parsed?.email?.subject || !parsed?.email?.body) {
        throw new Error('Store outreach crew response is missing email content');
    }

    const normalizedWebsiteUrl =
        run.meta?.normalizedWebsiteUrl || run.payload?.website_url || '';

    if (!normalizedWebsiteUrl) {
        throw new Error('Missing normalizedWebsiteUrl for store outreach finalization');
    }

    const saved = await StoreOutreach.findOneAndUpdate(
        { normalizedWebsiteUrl },
        {
            title: parsed?.title || 'Store Outreach Analysis',
            websiteUrl: run.payload?.website_url || normalizedWebsiteUrl,
            normalizedWebsiteUrl,
            storeName: pickStoreName(parsed, run.payload?.store_name || ''),
            managerName: run.payload?.manager_name || '',
            crewName: 'store_outreach',
            targetAppName: run.payload?.target_app_name || 'Arka: Smart Analyzer',
            targetAppShopifyUrl:
                run.payload?.target_app_shopify_url ||
                'https://apps.shopify.com/arka-smart-analyzer',
            targetAppWebsiteUrl:
                run.payload?.target_app_website_url ||
                'https://web.arkaanalyzer.com/',
            analysis: parsed,
            email: {
                subject: parsed?.email?.subject || '',
                previewLine: parsed?.email?.preview_line || '',
                body: parsed?.email?.body || '',
            },
            rawResult: result,
            status: 'success',
            generatedAt: new Date(),
            meta: {
                crewRunId: run._id,
                rawContent,
                tasks_output: getTasksOutput(result),
            },
        },
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
        }
    );

    try {
        const telegramReport = buildStoreOutreachTelegramReport(saved, parsed);

        const telegram = await publishCrewReport({
            crewName: 'store_outreach',
            executedBy: {
                _id: run.createdBy || null,
                name: run.meta?.executedByName || 'Unknown user',
            },
            createdAt: saved.createdAt || new Date(),
            savedId: saved._id.toString(),
            sourceFile: 'store_outreach',
            html: '',
            telegramReport,
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

        return withSavedRecord({ parsed, telegram, telegramReport }, saved, 'StoreOutreach');
    } catch (telegramError) {
        console.error('store outreach telegram publish failed:', telegramError);

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
                parsed,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message,
                },
                telegramReport: '',
            },
            saved,
            'StoreOutreach'
        );
    }
}