import Joi from 'joi';

const objectIdSchema = Joi.string().trim().length(24).hex();

export const createManageCompetitorAnalysisSchema = Joi.object({
    appName: Joi.string()
        .trim()
        .allow('')
        .default('Arka: Smart Analyzer'),
    appUrl: Joi.string()
        .trim()
        .uri({ scheme: ['http', 'https'] })
        .default('https://apps.shopify.com/arka-smart-analyzer'),
    analysisGoal: Joi.string().trim().allow('').default(''),
    selectedCompetitorIds: Joi.array().items(objectIdSchema).min(1).required(),
    maxSelectedCompetitors: Joi.number().integer().min(0).default(0),
});

export const getManageCompetitorAnalysesSchema = Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1),
});

export const manageCompetitorAnalysisIdSchema = Joi.object({
    id: objectIdSchema.required(),
});