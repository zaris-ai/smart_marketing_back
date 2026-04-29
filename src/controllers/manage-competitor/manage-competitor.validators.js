import Joi from 'joi';

const objectIdSchema = Joi.string().trim().length(24).hex();

const urlSchema = Joi.string().trim().uri({
  scheme: ['http', 'https'],
});

export const createManageCompetitorSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().allow('').max(2000).default(''),
  links: Joi.array().items(urlSchema).min(1).required(),
  status: Joi.string().valid('active', 'inactive').default('active'),
});

export const getManageCompetitorsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().allow('').default(''),
  status: Joi.string().valid('active', 'inactive').optional(),
});

export const manageCompetitorIdSchema = Joi.object({
  id: objectIdSchema.required(),
});

export const updateManageCompetitorSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().allow('').max(2000),
  links: Joi.array().items(urlSchema).min(1),
  status: Joi.string().valid('active', 'inactive'),
}).min(1);