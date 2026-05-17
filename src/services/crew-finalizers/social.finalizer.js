import { randomUUID } from 'node:crypto';

import InstagramStoryIdeaRun from '../../models/instagram-story-idea.model.js';
import InstagramPostIdeaRun from '../../models/instagram-post-idea.model.js';

import { publishCrewReport } from '../telegram.service.js';

import {
    extractJsonFromMarkdownFence,
    extractJsonObjectsFromText,
    getCrewContent,
    marked,
    normalizeStringArray,
    safeParseJson,
    unwrapPossibleCrewValues,
    withSavedRecord,
} from './common.js';

function normalizeSocialString(value, fallback = '') {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
}

function extractIdeasJson(value) {
    const candidates = unwrapPossibleCrewValues(value);

    for (const candidate of candidates) {
        if (
            candidate &&
            typeof candidate === 'object' &&
            Array.isArray(candidate.ideas) &&
            candidate.ideas.length > 0
        ) {
            return candidate;
        }
    }

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;

        const trimmed = candidate.trim();

        const direct = safeParseJson(trimmed);
        if (direct?.ideas?.length) return direct;

        const fenced = extractJsonFromMarkdownFence(trimmed);
        if (fenced?.ideas?.length) return fenced;

        const objects = extractJsonObjectsFromText(trimmed);
        const valid = objects.reverse().find((item) => item?.ideas?.length);

        if (valid) return valid;
    }

    return null;
}

function normalizeStoryResult({ crewResult, payload, run }) {
    const parsed = extractIdeasJson(crewResult);

    if (!parsed) {
        const error = new Error('Instagram story crew returned invalid JSON.');
        error.statusCode = 502;
        error.details = {
            crewName: run?.crewName || '',
            runId: run?._id ? String(run._id) : '',
            hasContent: Boolean(getCrewContent(crewResult)),
        };
        throw error;
    }

    const campaignTitle = normalizeSocialString(
        parsed.campaign_title,
        payload.campaign_name ||
        `${payload.brand_name || 'Arka Smart Analyzer'} Instagram Story Campaign`
    );

    const strategySummary = normalizeSocialString(parsed.strategy_summary);

    const ideas = parsed.ideas.map((idea, index) => ({
        id: normalizeSocialString(idea.id, `idea_${index + 1}`),
        title: normalizeSocialString(idea.title, `Story Idea ${index + 1}`),
        angle: normalizeSocialString(idea.angle),
        objective: normalizeSocialString(idea.objective),
        hook: normalizeSocialString(idea.hook),
        story_sequence: Array.isArray(idea.story_sequence)
            ? idea.story_sequence.map((step, stepIndex) => ({
                frame: Number(step.frame || stepIndex + 1),
                visual: normalizeSocialString(step.visual),
                on_screen_text: normalizeSocialString(step.on_screen_text),
                voiceover: normalizeSocialString(step.voiceover),
                motion_direction: normalizeSocialString(step.motion_direction),
                duration_seconds: Number(step.duration_seconds || 3),
            }))
            : [],
        video_prompt: normalizeSocialString(idea.video_prompt),
        caption: normalizeSocialString(idea.caption),
        cta: normalizeSocialString(idea.cta),
        hashtags: normalizeStringArray(idea.hashtags),
        production_notes: normalizeStringArray(idea.production_notes),
    }));

    return {
        runId: run?._id ? String(run._id) : randomUUID(),
        campaign_title: campaignTitle,
        platform: 'instagram_story',
        format: 'vertical_9_16',
        strategy_summary: strategySummary,

        brand_name: normalizeSocialString(payload.brand_name, 'Arka Smart Analyzer'),
        product_or_service: normalizeSocialString(payload.product_or_service),
        app_website_url: normalizeSocialString(payload.app_website_url),
        shopify_app_store_url: normalizeSocialString(payload.shopify_app_store_url),

        target_audience: normalizeSocialString(payload.target_audience),
        campaign_goal: normalizeSocialString(payload.campaign_goal),

        campaign_name: normalizeSocialString(payload.campaign_name),
        brand_voice: normalizeSocialString(payload.brand_voice),
        offer: normalizeSocialString(payload.offer),
        key_message: normalizeSocialString(payload.key_message),
        visual_style: normalizeSocialString(payload.visual_style),
        language: normalizeSocialString(payload.language, 'English'),
        number_of_ideas: Number(payload.number_of_ideas || ideas.length || 5),
        story_length_seconds: Number(payload.story_length_seconds || 15),
        notes: normalizeSocialString(payload.notes),

        ideas,

        markdown: marked.parse(
            [
                `# ${campaignTitle}`,
                '',
                strategySummary ? `## Strategy Summary\n\n${strategySummary}` : '',
                '',
                '## Story Ideas',
                '',
                ...ideas.map((idea, index) =>
                    [
                        `### ${index + 1}. ${idea.title}`,
                        '',
                        `**Angle:** ${idea.angle}`,
                        '',
                        `**Objective:** ${idea.objective}`,
                        '',
                        `**Hook:** ${idea.hook}`,
                        '',
                        `**CTA:** ${idea.cta}`,
                        '',
                        `**Video Prompt:**`,
                        '',
                        idea.video_prompt,
                    ].join('\n')
                ),
            ]
                .filter(Boolean)
                .join('\n')
        ),

        raw: parsed,
    };
}

function normalizePostResult({ crewResult, payload, run }) {
    const parsed = extractIdeasJson(crewResult);

    if (!parsed) {
        const error = new Error('Instagram post crew returned invalid JSON.');
        error.statusCode = 502;
        error.details = {
            crewName: run?.crewName || '',
            runId: run?._id ? String(run._id) : '',
            hasContent: Boolean(getCrewContent(crewResult)),
        };
        throw error;
    }

    const campaignTitle = normalizeSocialString(
        parsed.campaign_title,
        payload.campaign_name ||
        `${payload.brand_name || 'Arka Smart Analyzer'} Instagram Post Campaign`
    );

    const strategySummary = normalizeSocialString(parsed.strategy_summary);

    const ideas = parsed.ideas.map((idea, index) => ({
        id: normalizeSocialString(idea.id, `idea_${index + 1}`),
        title: normalizeSocialString(idea.title, `Post Idea ${index + 1}`),
        post_type: normalizeSocialString(
            idea.post_type,
            payload.post_format || 'carousel'
        ),
        angle: normalizeSocialString(idea.angle),
        objective: normalizeSocialString(idea.objective),
        hook: normalizeSocialString(idea.hook),
        slides: Array.isArray(idea.slides)
            ? idea.slides.map((slide, slideIndex) => ({
                slide: Number(slide.slide || slideIndex + 1),
                visual: normalizeSocialString(slide.visual),
                headline: normalizeSocialString(slide.headline),
                body_text: normalizeSocialString(slide.body_text),
                design_direction: normalizeSocialString(slide.design_direction),
            }))
            : [],
        creative_prompt: normalizeSocialString(idea.creative_prompt),
        caption: normalizeSocialString(idea.caption),
        cta: normalizeSocialString(idea.cta),
        hashtags: normalizeStringArray(idea.hashtags),
        production_notes: normalizeStringArray(idea.production_notes),
    }));

    return {
        runId: run?._id ? String(run._id) : randomUUID(),
        campaign_title: campaignTitle,
        platform: 'instagram_post',
        format: normalizeSocialString(payload.post_format, 'carousel'),
        strategy_summary: strategySummary,

        brand_name: normalizeSocialString(payload.brand_name, 'Arka Smart Analyzer'),
        product_or_service: normalizeSocialString(payload.product_or_service),
        app_website_url: normalizeSocialString(payload.app_website_url),
        shopify_app_store_url: normalizeSocialString(payload.shopify_app_store_url),

        target_audience: normalizeSocialString(payload.target_audience),
        campaign_goal: normalizeSocialString(payload.campaign_goal),

        campaign_name: normalizeSocialString(payload.campaign_name),
        brand_voice: normalizeSocialString(payload.brand_voice),
        offer: normalizeSocialString(payload.offer),
        key_message: normalizeSocialString(payload.key_message),
        visual_style: normalizeSocialString(payload.visual_style),
        language: normalizeSocialString(payload.language, 'English'),
        number_of_ideas: Number(payload.number_of_ideas || ideas.length || 5),
        post_format: normalizeSocialString(payload.post_format, 'carousel'),
        notes: normalizeSocialString(payload.notes),

        ideas,

        markdown: marked.parse(
            [
                `# ${campaignTitle}`,
                '',
                strategySummary ? `## Strategy Summary\n\n${strategySummary}` : '',
                '',
                '## Post Ideas',
                '',
                ...ideas.map((idea, index) =>
                    [
                        `### ${index + 1}. ${idea.title}`,
                        '',
                        `**Post Type:** ${idea.post_type}`,
                        '',
                        `**Angle:** ${idea.angle}`,
                        '',
                        `**Objective:** ${idea.objective}`,
                        '',
                        `**Hook:** ${idea.hook}`,
                        '',
                        `**CTA:** ${idea.cta}`,
                        '',
                        `**Creative Prompt:**`,
                        '',
                        idea.creative_prompt,
                    ].join('\n')
                ),
            ]
                .filter(Boolean)
                .join('\n')
        ),

        raw: parsed,
    };
}

function buildInstagramStoryTelegramReport(doc) {
    const ideaLines = Array.isArray(doc.ideas)
        ? doc.ideas
            .slice(0, 5)
            .map((idea, index) => `• ${index + 1}. ${idea.title}`)
            .join('\n')
        : '';

    return [
        `Instagram Story Ideas: ${doc.campaign_title}`,
        `Brand: ${doc.brand_name}`,
        `Goal: ${doc.campaign_goal}`,
        `Audience: ${doc.target_audience}`,
        '',
        'Summary',
        doc.strategy_summary ||
        'A new Instagram Story idea run was generated and saved for review.',
        '',
        ideaLines ? `Ideas\n${ideaLines}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

function buildInstagramPostTelegramReport(doc) {
    const ideaLines = Array.isArray(doc.ideas)
        ? doc.ideas
            .slice(0, 5)
            .map((idea, index) => `• ${index + 1}. ${idea.title}`)
            .join('\n')
        : '';

    return [
        `Instagram Post Ideas: ${doc.campaign_title}`,
        `Brand: ${doc.brand_name}`,
        `Goal: ${doc.campaign_goal}`,
        `Audience: ${doc.target_audience}`,
        `Format: ${doc.post_format}`,
        '',
        'Summary',
        doc.strategy_summary ||
        'A new Instagram post idea run was generated and saved for review.',
        '',
        ideaLines ? `Ideas\n${ideaLines}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}

async function publishOptionalSocialReport({
    saved,
    run,
    crewName,
    sourceFile,
    telegramReport,
}) {
    const telegram = await publishCrewReport({
        crewName,
        executedBy: {
            _id: run.createdBy || null,
            name: run.meta?.executedByName || 'Unknown user',
        },
        createdAt: saved.createdAt || new Date(),
        savedId: saved._id.toString(),
        sourceFile,
        html: saved.markdown || '',
        telegramReport,
    });

    if (saved.schema?.path?.('telegram')) {
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

    return telegram;
}

export async function finalizeInstagramStoryIdeaRun({ run, result }) {
    const normalizedResult = normalizeStoryResult({
        crewResult: result,
        payload: run.payload || {},
        run,
    });

    const saved = await InstagramStoryIdeaRun.create({
        ...normalizedResult,
        crewName: 'instagram_story_idea',
        rawResult: result,
        crewRunId: run._id,
        generatedAt: new Date(),
    });

    try {
        const telegramReport = buildInstagramStoryTelegramReport(saved);

        const telegram = await publishOptionalSocialReport({
            saved,
            run,
            crewName: 'instagram_story_idea',
            sourceFile: 'instagram_story_idea',
            telegramReport,
        });

        return withSavedRecord(
            {
                parsed: normalizedResult.raw,
                telegram,
                telegramReport,
            },
            saved,
            'InstagramStoryIdeaRun'
        );
    } catch (telegramError) {
        console.error('instagram story telegram publish failed:', telegramError);

        return withSavedRecord(
            {
                parsed: normalizedResult.raw,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message || 'Telegram publish failed',
                },
                telegramReport: '',
            },
            saved,
            'InstagramStoryIdeaRun'
        );
    }
}

export async function finalizeInstagramPostIdeaRun({ run, result }) {
    const normalizedResult = normalizePostResult({
        crewResult: result,
        payload: run.payload || {},
        run,
    });

    const saved = await InstagramPostIdeaRun.create({
        ...normalizedResult,
        crewName: 'instagram_post_idea',
        rawResult: result,
        crewRunId: run._id,
        generatedAt: new Date(),
    });

    try {
        const telegramReport = buildInstagramPostTelegramReport(saved);

        const telegram = await publishOptionalSocialReport({
            saved,
            run,
            crewName: 'instagram_post_idea',
            sourceFile: 'instagram_post_idea',
            telegramReport,
        });

        return withSavedRecord(
            {
                parsed: normalizedResult.raw,
                telegram,
                telegramReport,
            },
            saved,
            'InstagramPostIdeaRun'
        );
    } catch (telegramError) {
        console.error('instagram post telegram publish failed:', telegramError);

        return withSavedRecord(
            {
                parsed: normalizedResult.raw,
                telegram: {
                    ok: false,
                    skipped: false,
                    error: telegramError.message || 'Telegram publish failed',
                },
                telegramReport: '',
            },
            saved,
            'InstagramPostIdeaRun'
        );
    }
}