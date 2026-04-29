import { marked } from 'marked';
import { randomUUID } from 'node:crypto';
import asyncHandler from '../../utils/asyncHandler.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import InstagramStoryIdeaRun from '../../models/instagram-story-idea.model.js';
import { requireFields } from './instagram-agent.validators.js';

const FIXED_APP_CONTEXT = {
    brand_name: 'Arka Smart Analyzer',
    product_or_service:
        'Arka Smart Analyzer is a Shopify analytics app that helps merchants analyze products, pricing, inventory, and store performance to find hidden business problems and improve decisions.',
    app_website_url: 'http://web.arkaanalyzer.com/',
    shopify_app_store_url: 'https://apps.shopify.com/arka-smart-analyzer',
};

function safeParseJson(value) {
    if (!value) return null;

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function normalizeString(value, fallback = '') {
    return String(value || fallback).trim();
}

function normalizeArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function extractJsonObjectsFromText(text) {
    const objects = [];

    if (!text || typeof text !== 'string') {
        return objects;
    }

    for (let start = 0; start < text.length; start += 1) {
        if (text[start] !== '{') continue;

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < text.length; i += 1) {
            const ch = text[i];

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                } else if (ch === '"') {
                    inString = false;
                }

                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === '{') depth += 1;
            if (ch === '}') depth -= 1;

            if (depth === 0) {
                const candidate = text.slice(start, i + 1);
                const parsed = safeParseJson(candidate);

                if (parsed && typeof parsed === 'object') {
                    objects.push(parsed);
                }

                break;
            }
        }
    }

    return objects;
}

function extractJsonFromMarkdownFence(text) {
    if (!text || typeof text !== 'string') return null;

    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);

    if (jsonBlockMatch?.[1]) {
        return safeParseJson(jsonBlockMatch[1].trim());
    }

    const genericBlockMatch = text.match(/```\s*([\s\S]*?)```/i);

    if (genericBlockMatch?.[1]) {
        return safeParseJson(genericBlockMatch[1].trim());
    }

    return null;
}

function isValidInstagramStoryJson(value) {
    return Boolean(
        value &&
            typeof value === 'object' &&
            Array.isArray(value.ideas) &&
            value.ideas.length > 0
    );
}

function unwrapPossibleCrewValues(value) {
    const values = [];
    const seen = new Set();

    function visit(current) {
        if (current === undefined || current === null) return;

        if (typeof current === 'object') {
            if (seen.has(current)) return;
            seen.add(current);
        }

        values.push(current);

        if (typeof current !== 'object') return;

        const keysToCheck = [
            'result',
            'raw',
            'output',
            'content',
            'data',
            'json',
            'json_dict',
            'final_output',
            'tasks_output',
        ];

        for (const key of keysToCheck) {
            if (current[key] !== undefined) {
                visit(current[key]);
            }
        }

        if (Array.isArray(current)) {
            for (const item of current) {
                visit(item);
            }
        }
    }

    visit(value);
    return values;
}

function extractInstagramStoryJson(value) {
    const candidates = unwrapPossibleCrewValues(value);

    for (const candidate of candidates) {
        if (isValidInstagramStoryJson(candidate)) {
            return candidate;
        }
    }

    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;

        const trimmed = candidate.trim();

        const direct = safeParseJson(trimmed);
        if (isValidInstagramStoryJson(direct)) {
            return direct;
        }

        const fenced = extractJsonFromMarkdownFence(trimmed);
        if (isValidInstagramStoryJson(fenced)) {
            return fenced;
        }

        const extractedObjects = extractJsonObjectsFromText(trimmed);
        const validObject = extractedObjects
            .reverse()
            .find((item) => isValidInstagramStoryJson(item));

        if (validObject) {
            return validObject;
        }
    }

    return null;
}

function normalizeStoryIdeasResult(crewResult, payload) {
    const parsed = extractInstagramStoryJson(crewResult);

    if (!parsed) {
        const error = new Error('Instagram story crew returned invalid JSON.');
        error.statusCode = 502;
        error.details = {
            crewResult,
        };
        throw error;
    }

    const campaignTitle = normalizeString(
        parsed.campaign_title,
        payload.campaign_name || `${payload.brand_name} Instagram Story Campaign`
    );

    const strategySummary = normalizeString(parsed.strategy_summary);

    const ideas = parsed.ideas.map((idea, index) => ({
        id: normalizeString(idea.id, `idea_${index + 1}`),
        title: normalizeString(idea.title, `Story Idea ${index + 1}`),
        angle: normalizeString(idea.angle),
        objective: normalizeString(idea.objective),
        hook: normalizeString(idea.hook),
        story_sequence: Array.isArray(idea.story_sequence)
            ? idea.story_sequence.map((step, stepIndex) => ({
                  frame: Number(step.frame || stepIndex + 1),
                  visual: normalizeString(step.visual),
                  on_screen_text: normalizeString(step.on_screen_text),
                  voiceover: normalizeString(step.voiceover),
                  motion_direction: normalizeString(step.motion_direction),
                  duration_seconds: Number(step.duration_seconds || 3),
              }))
            : [],
        video_prompt: normalizeString(idea.video_prompt),
        caption: normalizeString(idea.caption),
        cta: normalizeString(idea.cta),
        hashtags: normalizeArray(idea.hashtags),
        production_notes: normalizeArray(idea.production_notes),
    }));

    return {
        runId: randomUUID(),
        campaign_title: campaignTitle,
        platform: 'instagram_story',
        format: 'vertical_9_16',
        strategy_summary: strategySummary,

        brand_name: normalizeString(payload.brand_name),
        product_or_service: normalizeString(payload.product_or_service),
        app_website_url: normalizeString(payload.app_website_url),
        shopify_app_store_url: normalizeString(payload.shopify_app_store_url),

        target_audience: normalizeString(payload.target_audience),
        campaign_goal: normalizeString(payload.campaign_goal),

        campaign_name: normalizeString(payload.campaign_name),
        brand_voice: normalizeString(payload.brand_voice),
        offer: normalizeString(payload.offer),
        key_message: normalizeString(payload.key_message),
        visual_style: normalizeString(payload.visual_style),
        language: normalizeString(payload.language, 'English'),
        number_of_ideas: Number(payload.number_of_ideas || 5),
        story_length_seconds: Number(payload.story_length_seconds || 15),
        notes: normalizeString(payload.notes),

        ideas,

        markdown: marked(
            [
                `# ${campaignTitle}`,
                '',
                strategySummary ? `## Strategy Summary\n\n${strategySummary}` : '',
                '',
                '## Fixed App Context',
                '',
                `**Brand:** ${payload.brand_name}`,
                '',
                `**Website:** ${payload.app_website_url}`,
                '',
                `**Shopify App Store:** ${payload.shopify_app_store_url}`,
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
            ].join('\n')
        ),

        raw: parsed,
    };
}

function normalizePayload(body) {
    return {
        ...FIXED_APP_CONTEXT,

        target_audience: String(body.target_audience).trim(),
        campaign_goal: String(body.campaign_goal).trim(),

        campaign_name: body.campaign_name
            ? String(body.campaign_name).trim()
            : 'Instagram Story Campaign',

        brand_voice: body.brand_voice
            ? String(body.brand_voice).trim()
            : 'direct, expert, practical, conversion-focused',

        offer: body.offer
            ? String(body.offer).trim()
            : 'Install Arka Smart Analyzer from the Shopify App Store',

        key_message: body.key_message
            ? String(body.key_message).trim()
            : 'Your Shopify store data already shows what needs fixing. Arka helps you find it faster.',

        visual_style: body.visual_style
            ? String(body.visual_style).trim()
            : 'clean SaaS dashboard visuals, Shopify store analytics, fast cuts, premium tech style, vertical mobile video',

        language: body.language ? String(body.language).trim() : 'English',

        number_of_ideas: Number(body.number_of_ideas || 5),

        story_length_seconds: Number(body.story_length_seconds || 15),

        notes: body.notes ? String(body.notes).trim() : '',
    };
}

function validatePayload(payload) {
    if (!Number.isFinite(payload.number_of_ideas)) {
        const error = new Error('number_of_ideas must be a valid number.');
        error.statusCode = 400;
        throw error;
    }

    if (!Number.isFinite(payload.story_length_seconds)) {
        const error = new Error('story_length_seconds must be a valid number.');
        error.statusCode = 400;
        throw error;
    }

    if (payload.number_of_ideas < 1 || payload.number_of_ideas > 10) {
        const error = new Error('number_of_ideas must be between 1 and 10.');
        error.statusCode = 400;
        throw error;
    }

    if (payload.story_length_seconds < 5 || payload.story_length_seconds > 60) {
        const error = new Error('story_length_seconds must be between 5 and 60.');
        error.statusCode = 400;
        throw error;
    }
}

export const createInstagramStoryIdeas = asyncHandler(async (req, res) => {
    requireFields(req.body, ['target_audience', 'campaign_goal']);

    const payload = normalizePayload(req.body);
    validatePayload(payload);

    const crewResult = await runPythonCrew({
        crewName: 'instagram_story_idea',
        payload,
    });

    const normalizedResult = normalizeStoryIdeasResult(crewResult, payload);

    const savedRun = await InstagramStoryIdeaRun.create(normalizedResult);

    res.status(201).json({
        success: true,
        message: 'Instagram story ideas generated and saved successfully.',
        data: savedRun,
    });
});

export const getInstagramStoryIdeaRuns = asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
        InstagramStoryIdeaRun.find({})
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        InstagramStoryIdeaRun.countDocuments({}),
    ]);

    res.json({
        success: true,
        data: {
            items,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
            },
        },
    });
});

export const getInstagramStoryIdeaRunById = asyncHandler(async (req, res) => {
    const run = await InstagramStoryIdeaRun.findById(req.params.id).lean();

    if (!run) {
        const error = new Error('Instagram story idea run not found.');
        error.statusCode = 404;
        throw error;
    }

    res.json({
        success: true,
        data: run,
    });
});

export const deleteInstagramStoryIdeaRun = asyncHandler(async (req, res) => {
    const deletedRun = await InstagramStoryIdeaRun.findByIdAndDelete(req.params.id);

    if (!deletedRun) {
        const error = new Error('Instagram story idea run not found.');
        error.statusCode = 404;
        throw error;
    }

    res.json({
        success: true,
        message: 'Instagram story idea run deleted successfully.',
    });
});