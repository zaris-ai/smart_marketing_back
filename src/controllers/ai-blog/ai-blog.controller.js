import slugify from 'slugify';

import AiBlog, { normalizeTitle } from '../../models/ai-blog.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';

const DEFAULT_SOURCE_LINKS = [
  'https://web.arkaanalyzer.com/',
  'https://apps.shopify.com/arka-smart-analyzer',
];

function requireTwoLinks(links) {
  if (!Array.isArray(links) || links.length !== 2) {
    const error = new Error('links must be an array with exactly 2 URLs');
    error.statusCode = 400;
    throw error;
  }

  for (const link of links) {
    try {
      new URL(link);
    } catch {
      const error = new Error(`Invalid URL: ${link}`);
      error.statusCode = 400;
      throw error;
    }
  }
}

function buildBaseSlug(title = 'untitled-blog') {
  const base = slugify(title, {
    lower: true,
    strict: true,
    trim: true,
  });

  return base || 'untitled-blog';
}

async function ensureUniqueSlug(baseSlug, currentId = null) {
  let slug = baseSlug;
  let counter = 1;

  while (
    await AiBlog.exists(
      currentId ? { slug, _id: { $ne: currentId } } : { slug }
    )
  ) {
    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return slug;
}

async function getExistingTitles(limit = 300) {
  const docs = await AiBlog.find({}, { title: 1, _id: 0 })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return docs.map((item) => item.title).filter(Boolean);
}

async function isDuplicateTitle(title, excludeId = null) {
  const normalized = normalizeTitle(title);

  if (!normalized) return false;

  const query = { normalizedTitle: normalized };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Boolean(await AiBlog.exists(query));
}

function normalizeKeywordArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeSourceLinks(value) {
  if (!Array.isArray(value)) return DEFAULT_SOURCE_LINKS;

  const links = value
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  return links.length ? links : DEFAULT_SOURCE_LINKS;
}

function serializeRun(run) {
  return {
    _id: String(run._id),
    crewName: run.crewName,
    title: run.title || '',
    status: run.status,
    savedRecord: run.savedRecord || null,
    createdAt: run.createdAt,
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
    error: run.error || {
      message: '',
      stack: '',
    },
  };
}

export async function createAiBlog(req, res, next) {
  try {
    requireTwoLinks(req.body.links);

    const links = normalizeSourceLinks(req.body.links);
    const existingTitles = await getExistingTitles(300);

    const payload = {
      links,
      forbidden_titles: existingTitles,
    };

    const run = await enqueueCrewRun({
      crewName: 'blog_from_links',
      title: 'AI Blog Draft From Source Links',
      payload,
      meta: {
        sourceLinks: links,
        appName: 'Arka: Smart Analyzer',
        forbiddenTitlesCount: existingTitles.length,
        executedByName: req.user?.name || req.user?.email || 'Unknown user',
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      ok: true,
      success: true,
      message: 'AI blog generation queued successfully',
      data: {
        run: serializeRun(run),
        runId: String(run._id),
      },
    });
  } catch (error) {
    console.error('createAiBlog error:', error);
    next(error);
  }
}

export async function getAiBlogs(req, res, next) {
  try {
    const { status, limit = 20, page = 1 } = req.query;

    const query = {};

    if (status && ['draft', 'published'].includes(status)) {
      query.status = status;
    }

    const safeLimit = Math.min(Number(limit) || 20, 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      AiBlog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      AiBlog.countDocuments(query),
    ]);

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blogs fetched successfully',
      data: {
        items,
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          pages: Math.ceil(total / safeLimit),
        },
      },
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function getAiBlogById(req, res, next) {
  try {
    const doc = await AiBlog.findById(req.params.id).lean();

    if (!doc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blog fetched successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function updateAiBlogDraft(req, res, next) {
  try {
    const currentId = req.params.id;
    const updates = {};

    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      const trimmedTitle = req.body.title.trim();

      if (await isDuplicateTitle(trimmedTitle, currentId)) {
        return res.status(409).json({
          ok: false,
          success: false,
          message: 'A blog with this title already exists.',
        });
      }

      updates.title = trimmedTitle;
      updates.normalizedTitle = normalizeTitle(trimmedTitle);

      const baseSlug = buildBaseSlug(trimmedTitle);
      updates.slug = await ensureUniqueSlug(baseSlug, currentId);
    }

    if (typeof req.body.topic === 'string') {
      updates.topic = req.body.topic.trim();
    }

    if (typeof req.body.excerpt === 'string') {
      updates.excerpt = req.body.excerpt.trim();
    }

    if (typeof req.body.metaDescription === 'string') {
      updates.metaDescription = req.body.metaDescription.trim();
    }

    if (Array.isArray(req.body.suggestedKeywords)) {
      updates.suggestedKeywords = normalizeKeywordArray(
        req.body.suggestedKeywords
      );
    }

    if (typeof req.body.contentHtml === 'string') {
      updates.contentHtml = req.body.contentHtml;
    }

    if (typeof req.body.contentMarkdown === 'string') {
      updates.contentMarkdown = req.body.contentMarkdown;
    }

    if (req.body.editorData !== undefined) {
      updates.editorData = req.body.editorData;
    }

    if (req.body.coverImage && typeof req.body.coverImage === 'object') {
      updates.coverImage = {
        url: req.body.coverImage.url || '',
        sourcePage: req.body.coverImage.sourcePage || '',
        query: req.body.coverImage.query || '',
        alt: req.body.coverImage.alt || '',
      };
    }

    const doc = await AiBlog.findByIdAndUpdate(currentId, updates, {
      new: true,
      runValidators: true,
    });

    if (!doc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blog draft updated successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function publishAiBlog(req, res, next) {
  try {
    const doc = await AiBlog.findByIdAndUpdate(
      req.params.id,
      {
        status: 'published',
        publishedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blog published successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function unpublishAiBlog(req, res, next) {
  try {
    const doc = await AiBlog.findByIdAndUpdate(
      req.params.id,
      {
        status: 'draft',
        publishedAt: null,
      },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blog moved back to draft',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function deleteAiBlog(req, res, next) {
  try {
    const doc = await AiBlog.findByIdAndDelete(req.params.id);

    if (!doc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
      success: true,
      message: 'AI blog deleted successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}

export async function updateAiBlog(req, res, next) {
  try {
    const currentId = req.params.id;
    const updates = {};

    const existingDoc = await AiBlog.findById(currentId);

    if (!existingDoc) {
      return res.status(404).json({
        ok: false,
        success: false,
        message: 'AI blog not found',
      });
    }

    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      const trimmedTitle = req.body.title.trim();

      if (await isDuplicateTitle(trimmedTitle, currentId)) {
        return res.status(409).json({
          ok: false,
          success: false,
          message: 'A blog with this title already exists.',
        });
      }

      updates.title = trimmedTitle;
      updates.normalizedTitle = normalizeTitle(trimmedTitle);

      const baseSlug = buildBaseSlug(req.body.slug || trimmedTitle);
      updates.slug = await ensureUniqueSlug(baseSlug, currentId);
    }

    if (typeof req.body.slug === 'string' && req.body.slug.trim()) {
      const baseSlug = buildBaseSlug(req.body.slug);
      updates.slug = await ensureUniqueSlug(baseSlug, currentId);
    }

    if (typeof req.body.topic === 'string') {
      updates.topic = req.body.topic.trim();
    }

    if (typeof req.body.audience === 'string') {
      updates.audience = req.body.audience.trim();
    }

    if (typeof req.body.appName === 'string') {
      updates.appName = req.body.appName.trim();
    }

    if (typeof req.body.excerpt === 'string') {
      updates.excerpt = req.body.excerpt.trim();
    }

    if (typeof req.body.metaDescription === 'string') {
      updates.metaDescription = req.body.metaDescription.trim();
    }

    if (Array.isArray(req.body.suggestedKeywords)) {
      updates.suggestedKeywords = normalizeKeywordArray(
        req.body.suggestedKeywords
      );
    }

    if (Array.isArray(req.body.sourceLinks)) {
      updates.sourceLinks = normalizeSourceLinks(req.body.sourceLinks);
    }

    if (typeof req.body.contentHtml === 'string') {
      updates.contentHtml = req.body.contentHtml;
    }

    if (typeof req.body.contentMarkdown === 'string') {
      updates.contentMarkdown = req.body.contentMarkdown;
    }

    if (req.body.editorData !== undefined) {
      updates.editorData = req.body.editorData;
    }

    if (req.body.coverImage && typeof req.body.coverImage === 'object') {
      updates.coverImage = {
        url: req.body.coverImage.url || '',
        sourcePage: req.body.coverImage.sourcePage || '',
        query: req.body.coverImage.query || '',
        alt: req.body.coverImage.alt || '',
      };
    }

    const doc = await AiBlog.findByIdAndUpdate(currentId, updates, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      ok: true,
      success: true,
      message:
        doc.status === 'published'
          ? 'Published AI blog updated successfully'
          : 'AI blog draft updated successfully',
      data: doc,
    });
  } catch (error) {
    console.error(error);
    next(error);
  }
}