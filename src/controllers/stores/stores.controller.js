import mongoose from 'mongoose';
import Joi from 'joi';
import Store from '../../models/store.model.js';

function normalizeDomain(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function cleanString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function validate(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return {
      error: error.details.map((item) => item.message).join(', '),
      value: null,
    };
  }

  return { error: null, value };
}

const createStoreSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  domain: Joi.string().trim().required(),
  country: Joi.string().trim().allow('').default(''),
  contactName: Joi.string().trim().allow('').default(''),
  contactEmail: Joi.string().trim().email().allow('').default(''),
  notes: Joi.string().trim().allow('').default(''),
  isActive: Joi.boolean().default(true),
});

const updateStoreSchema = Joi.object({
  name: Joi.string().trim().min(2),
  domain: Joi.string().trim(),
  country: Joi.string().trim().allow(''),
  contactName: Joi.string().trim().allow(''),
  contactEmail: Joi.string().trim().email().allow(''),
  notes: Joi.string().trim().allow(''),
  isActive: Joi.boolean(),
}).min(1);

const listStoresSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  q: Joi.string().trim().allow('').optional(),
  isActive: Joi.boolean().optional(),
});

function buildStorePayload(raw = {}) {
  return {
    name: cleanString(raw.name),
    domain: normalizeDomain(raw.domain),
    platform: 'shopify',
    country: cleanString(raw.country),
    contactName: cleanString(raw.contactName),
    contactEmail: cleanString(raw.contactEmail).toLowerCase(),
    notes: cleanString(raw.notes),
    isActive: raw.isActive === undefined ? true : Boolean(raw.isActive),
  };
}

function buildUpdatePayload(raw = {}) {
  const payload = {};

  if (raw.name !== undefined) payload.name = cleanString(raw.name);
  if (raw.domain !== undefined) payload.domain = normalizeDomain(raw.domain);
  if (raw.country !== undefined) payload.country = cleanString(raw.country);
  if (raw.contactName !== undefined) payload.contactName = cleanString(raw.contactName);
  if (raw.contactEmail !== undefined) payload.contactEmail = cleanString(raw.contactEmail).toLowerCase();
  if (raw.notes !== undefined) payload.notes = cleanString(raw.notes);
  if (raw.isActive !== undefined) payload.isActive = Boolean(raw.isActive);

  return payload;
}

export async function createStore(req, res) {
  try {
    const { error, value } = validate(createStoreSchema, req.body);
    
    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const payload = buildStorePayload(value);

    const exists = await Store.exists({ domain: payload.domain });
    if (exists) {
      return res.status(409).json({
        ok: false,
        error: 'Store with this domain already exists',
      });
    }

    const store = await Store.create(payload);

    return res.status(201).json({
      ok: true,
      message: 'Store created successfully',
      data: { store },
    });
  } catch (error) {
    console.error('createStore error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to create store',
    });
  }
}

export async function listStores(req, res) {
  try {
    const { error, value } = validate(listStoresSchema, req.query);

    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const page = value.page;
    const limit = value.limit;
    const skip = (page - 1) * limit;

    const filter = {};

    if (value.isActive !== undefined) {
      filter.isActive = value.isActive;
    }

    if (value.q) {
      filter.$or = [
        { name: { $regex: value.q, $options: 'i' } },
        { domain: { $regex: value.q, $options: 'i' } },
        { contactEmail: { $regex: value.q, $options: 'i' } },
        { country: { $regex: value.q, $options: 'i' } },
      ];
    }

    const [stores, total] = await Promise.all([
      Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Store.countDocuments(filter),
    ]);

    return res.status(200).json({
      ok: true,
      data: {
        stores,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('listStores error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load stores',
    });
  }
}

export async function getStoreById(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(id);

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
      });
    }

    return res.status(200).json({
      ok: true,
      data: { store },
    });
  } catch (error) {
    console.error('getStoreById error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to load store',
    });
  }
}

export async function updateStore(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const { error, value } = validate(updateStoreSchema, req.body);

    if (error) {
      return res.status(400).json({
        ok: false,
        error,
      });
    }

    const store = await Store.findById(id);

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
      });
    }

    const payload = buildUpdatePayload(value);

    if (payload.domain && payload.domain !== store.domain) {
      const exists = await Store.exists({ domain: payload.domain });
      if (exists) {
        return res.status(409).json({
          ok: false,
          error: 'Another store already uses this domain',
        });
      }
    }

    Object.assign(store, payload);
    store.platform = 'shopify';

    await store.save();

    return res.status(200).json({
      ok: true,
      message: 'Store updated successfully',
      data: { store },
    });
  } catch (error) {
    console.error('updateStore error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to update store',
    });
  }
}

export async function deleteStore(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid store id',
      });
    }

    const store = await Store.findById(id);

    if (!store) {
      return res.status(404).json({
        ok: false,
        error: 'Store not found',
      });
    }

    await store.deleteOne();

    return res.status(200).json({
      ok: true,
      message: 'Store deleted successfully',
    });
  } catch (error) {
    console.error('deleteStore error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to delete store',
    });
  }
}