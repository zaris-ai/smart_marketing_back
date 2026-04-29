import ManageCompetitor from '../../models/manage-competitor.model.js';
import ManageCompetitorAnalysis from '../../models/manage-competitor-analysis.model.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import {
    createManageCompetitorAnalysisSchema,
    getManageCompetitorAnalysesSchema,
    manageCompetitorAnalysisIdSchema,
} from './manage-competitor-analysis.validators.js';

function buildValidationError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function validateOrThrow(schema, data) {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        throw buildValidationError(
            error.details.map((item) => item.message).join(', ')
        );
    }

    return value;
}

export async function createManageCompetitorAnalysis(req, res, next) {
    try {
        const validatedBody = validateOrThrow(
            createManageCompetitorAnalysisSchema,
            req.body
        );

        const selectedIds = validatedBody.selectedCompetitorIds.map(String);

        const competitors = await ManageCompetitor.find({
            _id: { $in: selectedIds },
            status: 'active',
        }).lean();

        if (!competitors.length) {
            return res.status(404).json({
                ok: false,
                message: 'No active competitors found for the selected ids.',
            });
        }

        const foundIds = competitors.map((item) => String(item._id));
        const missingIds = selectedIds.filter((id) => !foundIds.includes(id));

        if (missingIds.length > 0) {
            return res.status(400).json({
                ok: false,
                message: 'Some selected competitors were not found or are inactive.',
                data: {
                    missingIds,
                },
            });
        }

        const excludedCompetitorIds = [];

        const payload = {
            app_name: validatedBody.appName,
            app_store_url: 'https://apps.shopify.com/arka-smart-analyzer',
            landing_page_url: 'https://web.arkaanalyzer.com/',
            analysis_goal:
                validatedBody.analysisGoal ||
                'Analyze selected competitors and identify strengths, weaknesses, and catch-up priorities.',
            competitors: competitors.map((item) => ({
                id: String(item._id),
                name: item.name,
                description: item.description || '',
                status: item.status,
                links: Array.isArray(item.links) ? item.links : [],
            })),
            selected_competitor_ids: foundIds,
            excluded_competitor_ids: excludedCompetitorIds,
            max_selected_competitors: validatedBody.maxSelectedCompetitors,
        };

        const result = await runPythonCrew({
            crewName: 'manage_competitor_analysis',
            payload,
        });

        const html = result?.result?.content;

        if (!html || typeof html !== 'string') {
            return res.status(500).json({
                ok: false,
                message: 'Crew returned invalid HTML content.',
                raw: result?.result?.content || null,
            });
        }

        const doc = await ManageCompetitorAnalysis.create({
            title: `${validatedBody.appName} Competitor Analysis`,
            appName: validatedBody.appName,
            appUrl: 'https://apps.shopify.com/arka-smart-analyzer',
            crewName: 'manage_competitor_analysis',
            analysisGoal: validatedBody.analysisGoal,
            selectedCompetitorIds: foundIds,
            excludedCompetitorIds,
            maxSelectedCompetitors: validatedBody.maxSelectedCompetitors,
            selectedCompetitors: competitors.map((item) => ({
                competitorId: String(item._id),
                name: item.name,
                description: item.description || '',
                status: item.status,
                links: Array.isArray(item.links) ? item.links : [],
            })),
            html,
            rawResult: result,
            status: 'success',
            generatedAt: new Date(),
        });

        let telegram = {
            ok: false,
            skipped: true,
            reason: 'Not attempted',
        };

        try {
            const telegramReport = buildManageCompetitorAnalysisTelegramReport(doc);

            telegram = await publishCrewReport({
                crewName: 'manage_competitor_analysis',
                executedBy: req.user || null,
                createdAt: doc.createdAt || new Date(),
                savedId: doc._id.toString(),
                sourceFile: 'manage_competitor_analysis',
                html: doc.html || '',
                telegramReport,
            });
        } catch (telegramError) {
            console.error(
                'manage competitor analysis telegram publish failed:',
                telegramError
            );

            telegram = {
                ok: false,
                skipped: false,
                error: telegramError.message || 'Telegram publish failed',
            };
        }

        return res.status(201).json({
            ok: true,
            message: 'Competitor analysis generated and saved successfully',
            data: doc,
            telegram,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}


export async function getManageCompetitorAnalyses(req, res, next) {
    try {
        const validatedQuery = validateOrThrow(
            getManageCompetitorAnalysesSchema,
            req.query
        );

        const { limit, page } = validatedQuery;
        const skip = (page - 1) * limit;

        const [items, total] = await Promise.all([
            ManageCompetitorAnalysis.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ManageCompetitorAnalysis.countDocuments({}),
        ]);

        return res.status(200).json({
            ok: true,
            message: 'Competitor analyses fetched successfully',
            data: {
                items,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

export async function getManageCompetitorAnalysisById(req, res, next) {
    try {
        const validatedParams = validateOrThrow(
            manageCompetitorAnalysisIdSchema,
            req.params
        );

        const doc = await ManageCompetitorAnalysis.findById(
            validatedParams.id
        ).lean();

        if (!doc) {
            return res.status(404).json({
                ok: false,
                message: 'Competitor analysis not found',
            });
        }

        return res.status(200).json({
            ok: true,
            message: 'Competitor analysis fetched successfully',
            data: doc,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}

export async function deleteManageCompetitorAnalysis(req, res, next) {
    try {
        const validatedParams = validateOrThrow(
            manageCompetitorAnalysisIdSchema,
            req.params
        );

        const doc = await ManageCompetitorAnalysis.findByIdAndDelete(
            validatedParams.id
        );

        if (!doc) {
            return res.status(404).json({
                ok: false,
                message: 'Competitor analysis not found',
            });
        }

        return res.status(200).json({
            ok: true,
            message: 'Competitor analysis deleted successfully',
            data: doc,
        });
    } catch (error) {
        console.error(error);
        next(error);
    }
}