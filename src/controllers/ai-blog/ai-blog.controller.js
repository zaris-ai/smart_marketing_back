import slugify from 'slugify';
import AiBlog, { normalizeTitle } from '../../models/ai-blog.model.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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
  return slugify(title, {
    lower: true,
    strict: true,
    trim: true,
  });
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

async function getExistingTitles(limit = 200) {
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

function buildAiBlogTelegramReport(doc) {
  const keywords = Array.isArray(doc.suggestedKeywords)
    ? doc.suggestedKeywords.slice(0, 6).map((item) => `• ${item}`).join('\n')
    : '';

  const sources = Array.isArray(doc.sourceLinks)
    ? doc.sourceLinks.slice(0, 2).map((item) => `• ${item}`).join('\n')
    : '';

  return [
    `AI Blog Draft: ${doc.title}`,
    `Topic: ${doc.topic}`,
    `Audience: ${doc.audience}`,
    `App: ${doc.appName}`,
    '',
    'Summary',
    doc.excerpt || 'A new AI blog draft was generated successfully and saved for review.',
    '',
    keywords ? `Keywords\n${keywords}` : '',
    sources ? `Source Links\n${sources}` : '',
    '',
    `Status: ${doc.status}`,
    `Slug: ${doc.slug}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function createAiBlog(req, res, next) {
  try {
    requireTwoLinks(req.body.links);

    const existingTitles = await getExistingTitles(300);

    const payload = {
      links: req.body.links,
      forbidden_titles: existingTitles,
    };

    let result = await runPythonCrew({
      crewName: 'blog_from_links',
      payload,
    });

    let parsed = safeJsonParse(result?.result?.content);

    if (!parsed) {
      return res.status(500).json({
        ok: false,
        message: 'Crew returned invalid JSON content',
        raw: result?.result?.content,
      });
    }

    if (!parsed.title || !parsed.content_html || !parsed.topic) {
      return res.status(500).json({
        ok: false,
        message: 'Crew response is missing required blog fields',
        data: parsed,
      });
    }

    if (await isDuplicateTitle(parsed.title)) {
      result = await runPythonCrew({
        crewName: 'blog_from_links',
        payload: {
          ...payload,
          retry_reason: `The generated title "${parsed.title}" already exists. Choose a substantially different title.`,
          forbidden_titles: [...existingTitles, parsed.title],
        },
      });

      parsed = safeJsonParse(result?.result?.content);

      if (!parsed || !parsed.title || !parsed.content_html || !parsed.topic) {
        return res.status(500).json({
          ok: false,
          message: 'Crew retry returned invalid or incomplete JSON content',
          raw: result?.result?.content,
        });
      }

      if (await isDuplicateTitle(parsed.title)) {
        return res.status(409).json({
          ok: false,
          message: 'Crew generated a duplicate blog title more than once. Try again.',
          data: {
            title: parsed.title,
          },
        });
      }
    }

    const baseSlug = buildBaseSlug(parsed.slug || parsed.title);
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    const doc = await AiBlog.create({
      title: parsed.title,
      normalizedTitle: normalizeTitle(parsed.title),
      slug: uniqueSlug,
      topic: parsed.topic,
      audience: parsed.audience || 'Shopify merchants',
      appName: parsed.app_name || 'Arka: Smart Analyzer',
      sourceLinks: payload.links,
      suggestedKeywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      metaDescription: parsed.meta_description || '',
      excerpt: parsed.excerpt || '',
      coverImage: {
        url: parsed.cover_image?.url || '',
        sourcePage: parsed.cover_image?.source_page || '',
        query: parsed.cover_image?.query || '',
        alt: parsed.cover_image?.alt || '',
      },
      contentHtml: parsed.content_html,
      contentMarkdown: parsed.content_markdown || '',
      editorData: parsed.editor_data || {
        type: 'html',
        content: parsed.content_html,
      },
      crewName: 'blog_from_links',
      rawResult: result,
      status: 'draft',
      generatedAt: new Date(),
    });

    try {
      const telegramReport = buildAiBlogTelegramReport(doc);

      const telegram = await publishCrewReport({
        crewName: 'blog_from_links',
        executedBy: req.user || null,
        createdAt: doc.createdAt || new Date(),
        savedId: doc._id.toString(),
        sourceFile: doc.slug || 'blog_from_links',
        html: doc.contentHtml || '',
        telegramReport,
      });

      doc.telegram = {
        published: !telegram?.skipped && !!telegram?.ok,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: telegram?.messages?.map((m) => m.messageId) || [],
        publishedAt: telegram?.ok ? new Date() : null,
        html: telegram?.reportHtml || '',
        error: '',
      };

      await doc.save();
    } catch (telegramError) {
      console.error('ai blog telegram publish failed:', telegramError);

      doc.telegram = {
        published: false,
        channelId: process.env.TELEGRAM_CHANNEL_ID || '',
        messageIds: [],
        publishedAt: null,
        html: '',
        error: telegramError.message || 'Telegram publish failed',
      };

      await doc.save();
    }

    return res.status(201).json({
      ok: true,
      message: 'AI blog generated and saved as draft',
      data: doc,
    });
  } catch (error) {
    console.error(error);
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
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
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
      updates.suggestedKeywords = req.body.suggestedKeywords.filter(Boolean);
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
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
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
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
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
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
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
        message: 'AI blog not found',
      });
    }

    return res.status(200).json({
      ok: true,
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
        message: 'AI blog not found',
      });
    }

    if (typeof req.body.title === 'string' && req.body.title.trim()) {
      const trimmedTitle = req.body.title.trim();

      if (await isDuplicateTitle(trimmedTitle, currentId)) {
        return res.status(409).json({
          ok: false,
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
      updates.suggestedKeywords = req.body.suggestedKeywords
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    if (Array.isArray(req.body.sourceLinks)) {
      updates.sourceLinks = req.body.sourceLinks
        .map((item) => String(item).trim())
        .filter(Boolean);
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