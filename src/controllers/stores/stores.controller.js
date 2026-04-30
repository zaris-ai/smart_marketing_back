import fs from 'node:fs';
import fsp from 'node:fs/promises';
import mongoose from 'mongoose';
import Joi from 'joi';
import Store from '../../models/store.model.js';
import {
  parsePagination,
  buildPaginationMeta,
} from '../../utils/pagination.js';

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

function createImportFileError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function pickFirst(raw = {}, keys = []) {
  for (const key of keys) {
    const value = raw[key];

    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  return '';
}

function buildNameFromDomain(domain = '') {
  const clean = normalizeDomain(domain);

  if (!clean) return '';

  const firstPart = clean.split('.')[0] || clean;

  return firstPart
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

  if (raw.contactEmail !== undefined) {
    payload.contactEmail = cleanString(raw.contactEmail).toLowerCase();
  }

  if (raw.notes !== undefined) payload.notes = cleanString(raw.notes);
  if (raw.isActive !== undefined) payload.isActive = Boolean(raw.isActive);

  return payload;
}

function buildImportedStorePayload(raw = {}) {
  const rawDomain = pickFirst(raw, [
    'domain',
    'web_site',
    'website',
    'site',
    'url',
    'storeUrl',
    'store_url',
  ]);

  const domain = normalizeDomain(rawDomain);

  const name =
    cleanString(
      pickFirst(raw, ['name', 'storeName', 'store_name', 'title'])
    ) || buildNameFromDomain(domain);

  const country = cleanString(
    pickFirst(raw, ['country', 'web_hosting_location', 'hosting_country'])
  );

  const contactName = cleanString(
    pickFirst(raw, ['contactName', 'contact_name'])
  );

  const contactEmail = cleanString(
    pickFirst(raw, ['contactEmail', 'contact_email', 'email'])
  ).toLowerCase();

  const websiteIpAddress = cleanString(
    pickFirst(raw, ['website_ip_address', 'ip', 'ip_address'])
  );

  const webHostingCompany = cleanString(
    pickFirst(raw, ['web_hosting_company', 'hosting_company'])
  );

  const webHostingLocation = cleanString(
    pickFirst(raw, ['web_hosting_location', 'hosting_location'])
  );

  const webHostingCity = cleanString(
    pickFirst(raw, ['web_hosting_city', 'hosting_city'])
  );

  const worldSitePopularRating = cleanString(
    pickFirst(raw, ['world_site_popular_rating', 'popular_rating', 'rank'])
  );

  const notesParts = [];

  if (websiteIpAddress) notesParts.push(`IP: ${websiteIpAddress}`);
  if (webHostingCompany) notesParts.push(`Hosting: ${webHostingCompany}`);
  if (worldSitePopularRating) notesParts.push(`Rating: ${worldSitePopularRating}`);

  const now = new Date();

  return {
    name,
    domain,
    platform: 'shopify',
    country,
    contactName,
    contactEmail,
    notes: notesParts.join(' | '),
    isActive: true,
    metadata: {
      source: 'json_replace_import',
      originalNo: cleanString(raw.no),
      websiteIpAddress,
      webHostingCompany,
      webHostingLocation,
      webHostingCity,
      worldSitePopularRating,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function validateImportedStore(payload) {
  if (!payload.domain) {
    return 'Missing domain/web_site';
  }

  if (!payload.name || payload.name.length < 2) {
    return 'Missing valid name';
  }

  if (
    payload.contactEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contactEmail)
  ) {
    return 'Invalid contact email';
  }

  return null;
}

async function collectionExists(collectionName) {
  const collections = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .toArray();

  return collections.length > 0;
}

async function createStoreIndexes(collection) {
  await collection.createIndex({ domain: 1 }, { unique: true });
  await collection.createIndex({ createdAt: -1 });
  await collection.createIndex({ name: 'text', domain: 'text' });
}

function getWriteErrors(error) {
  return (
    error?.writeErrors ||
    error?.result?.result?.writeErrors ||
    error?.result?.writeErrors ||
    []
  );
}

function hasOnlyDuplicateKeyErrors(error) {
  const writeErrors = getWriteErrors(error);

  if (!writeErrors.length) {
    return error?.code === 11000;
  }

  return writeErrors.every((item) => item?.code === 11000);
}

function getBulkInsertedCount(error) {
  return (
    error?.result?.insertedCount ||
    error?.result?.result?.nInserted ||
    error?.insertedDocs?.length ||
    0
  );
}

function getDuplicateWriteErrorCount(error) {
  const writeErrors = getWriteErrors(error);

  if (!writeErrors.length && error?.code === 11000) {
    return 1;
  }

  return writeErrors.filter((item) => item?.code === 11000).length;
}

async function* readTopLevelJsonArrayObjects(filePath) {
  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: 1024 * 1024,
  });

  let arrayStarted = false;
  let arrayEnded = false;

  let collectingObject = false;
  let objectBuffer = '';
  let objectDepth = 0;

  let insideString = false;
  let escaped = false;

  let parsedObjectCount = 0;

  for await (const chunk of stream) {
    for (let index = 0; index < chunk.length; index += 1) {
      const char = chunk[index];

      if (char === '\uFEFF') {
        continue;
      }

      if (!arrayStarted) {
        if (/\s/.test(char)) {
          continue;
        }

        if (char !== '[') {
          throw createImportFileError(
            'JSON file must be a top-level array. Example: [{ "web_site": "example.com" }]'
          );
        }

        arrayStarted = true;
        continue;
      }

      if (arrayEnded) {
        if (/\s/.test(char)) {
          continue;
        }

        throw createImportFileError('Invalid data after closing JSON array.');
      }

      if (!collectingObject) {
        if (/\s/.test(char) || char === ',') {
          continue;
        }

        if (char === ']') {
          arrayEnded = true;
          continue;
        }

        if (char !== '{') {
          throw createImportFileError(
            'JSON array must contain objects only. Example: [{ "web_site": "example.com" }]'
          );
        }

        collectingObject = true;
        objectBuffer = '{';
        objectDepth = 1;
        insideString = false;
        escaped = false;
        continue;
      }

      objectBuffer += char;

      if (insideString) {
        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === '"') {
          insideString = false;
        }

        continue;
      }

      if (char === '"') {
        insideString = true;
        continue;
      }

      if (char === '{') {
        objectDepth += 1;
        continue;
      }

      if (char === '}') {
        objectDepth -= 1;

        if (objectDepth === 0) {
          parsedObjectCount += 1;

          let parsed;

          try {
            parsed = JSON.parse(objectBuffer);
          } catch (error) {
            throw createImportFileError(
              `Invalid JSON object near row ${parsedObjectCount}: ${error.message}`
            );
          }

          yield parsed;

          collectingObject = false;
          objectBuffer = '';
        }
      }
    }
  }

  if (!arrayStarted) {
    throw createImportFileError('JSON file is empty or missing a top-level array.');
  }

  if (collectingObject || objectDepth !== 0 || insideString) {
    throw createImportFileError('JSON file ended before an object was closed.');
  }

  if (!arrayEnded) {
    throw createImportFileError('JSON file ended before the top-level array was closed.');
  }
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

    const { page, limit, skip } = parsePagination(value, {
      defaultPage: 1,
      defaultLimit: 20,
      maxLimit: 100,
    });

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
      Store.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Store.countDocuments(filter),
    ]);

    return res.status(200).json({
      ok: true,
      data: {
        stores,
        pagination: buildPaginationMeta({
          page,
          limit,
          total,
        }),
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

export async function replaceStoresFromJson(req, res) {
  const uploadedPath = req.file?.path;
  const db = mongoose.connection.db;
  const targetCollectionName = Store.collection.collectionName;

  const importId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const tempCollectionName = `${targetCollectionName}_import_${importId}`;
  const backupCollectionName = `${targetCollectionName}_backup_${importId}`;

  let tempCollectionPromoted = false;

  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: 'JSON file is required',
      });
    }

    const tempCollection = db.collection(tempCollectionName);

    await createStoreIndexes(tempCollection);

    const invalidRows = [];
    const INVALID_ROWS_LIMIT = 200;
    const BATCH_SIZE = 1000;

    let batch = [];
    let totalRows = 0;
    let validRows = 0;
    let insertedCount = 0;
    let duplicateInFileCount = 0;
    let invalidCount = 0;

    async function flushBatch() {
      if (!batch.length) return;

      const currentBatch = batch;
      batch = [];

      try {
        const result = await tempCollection.insertMany(currentBatch, {
          ordered: false,
        });

        insertedCount += result?.insertedCount || currentBatch.length;
      } catch (error) {
        if (!hasOnlyDuplicateKeyErrors(error)) {
          throw error;
        }

        insertedCount += getBulkInsertedCount(error);
        duplicateInFileCount += getDuplicateWriteErrorCount(error);
      }
    }

    for await (const row of readTopLevelJsonArrayObjects(uploadedPath)) {
      totalRows += 1;

      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        invalidCount += 1;

        if (invalidRows.length < INVALID_ROWS_LIMIT) {
          invalidRows.push({
            row: totalRows,
            reason: 'Row must be an object',
          });
        }

        continue;
      }

      const payload = buildImportedStorePayload(row);
      const validationError = validateImportedStore(payload);

      if (validationError) {
        invalidCount += 1;

        if (invalidRows.length < INVALID_ROWS_LIMIT) {
          invalidRows.push({
            row: totalRows,
            domain: payload.domain || '',
            reason: validationError,
          });
        }

        continue;
      }

      validRows += 1;
      batch.push(payload);

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    if (!totalRows) {
      await tempCollection.drop();

      return res.status(400).json({
        ok: false,
        error: 'JSON file has no rows',
      });
    }

    if (!insertedCount) {
      await tempCollection.drop();

      return res.status(400).json({
        ok: false,
        error: 'No valid stores found. Existing stores were not changed.',
        data: {
          totalRows,
          validRows,
          insertedCount,
          duplicateInFileCount,
          invalidCount,
          invalidRows,
        },
      });
    }

    const targetExists = await collectionExists(targetCollectionName);

    if (targetExists) {
      await db.collection(targetCollectionName).rename(backupCollectionName, {
        dropTarget: true,
      });
    }

    try {
      await tempCollection.rename(targetCollectionName, {
        dropTarget: true,
      });

      tempCollectionPromoted = true;

      const backupExists = await collectionExists(backupCollectionName);

      if (targetExists && backupExists) {
        await db.collection(backupCollectionName).drop();
      }
    } catch (replaceError) {
      const targetStillExists = await collectionExists(targetCollectionName);
      const backupExists = await collectionExists(backupCollectionName);

      if (!targetStillExists && backupExists) {
        await db.collection(backupCollectionName).rename(targetCollectionName, {
          dropTarget: true,
        });
      }

      throw replaceError;
    }

    return res.status(201).json({
      ok: true,
      message: 'Stores replaced successfully from JSON file',
      data: {
        totalRows,
        validRows,
        insertedCount,
        duplicateInFileCount,
        invalidCount,
        invalidRows,
      },
    });
  } catch (error) {
    console.error('replaceStoresFromJson error:', error);

    if (!tempCollectionPromoted) {
      try {
        if (await collectionExists(tempCollectionName)) {
          await db.collection(tempCollectionName).drop();
        }
      } catch (cleanupError) {
        console.error('Temp collection cleanup error:', cleanupError);
      }
    }

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      ok: false,
      error:
        error.message ||
        'Failed to replace stores from JSON. Existing stores were not changed.',
    });
  } finally {
    if (uploadedPath) {
      try {
        await fsp.unlink(uploadedPath);
      } catch (cleanupError) {
        console.error('Uploaded file cleanup error:', cleanupError);
      }
    }
  }
}