import ManageCompetitor from '../../models/manage-competitor.model.js';

import {
  createManageCompetitorSchema,
  getManageCompetitorsSchema,
  manageCompetitorIdSchema,
  updateManageCompetitorSchema,
} from './manage-competitor.validators.js';

function buildValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function buildDuplicateNameError() {
  const error = new Error('Competitor with this name already exists');
  error.statusCode = 409;
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

async function ensureUniqueName(name, excludeId = null) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const query = {
    name: { $regex: `^${escapedName}$`, $options: 'i' },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const exists = await ManageCompetitor.exists(query);

  if (exists) {
    throw buildDuplicateNameError();
  }
}

export async function createManageCompetitor(req, res, next) {
  try {
    const validatedBody = validateOrThrow(createManageCompetitorSchema, req.body);

    await ensureUniqueName(validatedBody.name);

    const doc = await ManageCompetitor.create({
      name: validatedBody.name,
      description: validatedBody.description,
      links: validatedBody.links,
      status: validatedBody.status,
    });

    return res.status(201).json({
      ok: true,
      message: 'Competitor created successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function getManageCompetitors(req, res, next) {
  try {
    const validatedQuery = validateOrThrow(
      getManageCompetitorsSchema,
      req.query
    );

    const { status, limit, page, search } = validatedQuery;
    const query = {};

    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { links: { $elemMatch: { $regex: search, $options: 'i' } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      ManageCompetitor.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ManageCompetitor.countDocuments(query),
    ]);

    return res.status(200).json({
      ok: true,
      message: 'Competitors fetched successfully',
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

export async function getManageCompetitorById(req, res, next) {
  try {
    const validatedParams = validateOrThrow(
      manageCompetitorIdSchema,
      req.params
    );

    const doc = await ManageCompetitor.findById(validatedParams.id).lean();

    if (!doc) {
      return res.status(404).json({
        ok: false,
        message: 'Competitor not found',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Competitor fetched successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function updateManageCompetitor(req, res, next) {
  try {
    const validatedParams = validateOrThrow(
      manageCompetitorIdSchema,
      req.params
    );
    const validatedBody = validateOrThrow(
      updateManageCompetitorSchema,
      req.body
    );

    const currentDoc = await ManageCompetitor.findById(validatedParams.id);

    if (!currentDoc) {
      return res.status(404).json({
        ok: false,
        message: 'Competitor not found',
      });
    }

    if (
      typeof validatedBody.name === 'string' &&
      validatedBody.name.trim() &&
      validatedBody.name.trim().toLowerCase() !== currentDoc.name.toLowerCase()
    ) {
      await ensureUniqueName(validatedBody.name, validatedParams.id);
    }

    const doc = await ManageCompetitor.findByIdAndUpdate(
      validatedParams.id,
      validatedBody,
      {
        new: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      ok: true,
      message: 'Competitor updated successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function deleteManageCompetitor(req, res, next) {
  try {
    const validatedParams = validateOrThrow(
      manageCompetitorIdSchema,
      req.params
    );

    const doc = await ManageCompetitor.findByIdAndDelete(validatedParams.id);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        message: 'Competitor not found',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Competitor deleted successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}