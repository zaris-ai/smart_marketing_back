import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';

import AiBlog from '../../models/ai-blog.model.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';
import { requireFields } from './crew.validators.js';

function cleanString(value = '') {
  return String(value || '').trim();
}

function normalizeStringArray(value) {
  if (!value) return [];

  const arr = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\n,]/)
        .map((item) => item.trim());

  return [...new Set(arr.map((item) => cleanString(item)).filter(Boolean))];
}

function getRequiredModelSourceLinks() {
  return [
    process.env.BLOG_SOURCE_LINK_1 || 'https://web.arkaanalyzer.com/',
    process.env.BLOG_SOURCE_LINK_2 ||
      'https://apps.shopify.com/arka-smart-analyzer',
  ];
}

function sanitizeBlogHtml(html = '') {
  return sanitizeHtml(String(html || ''), {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'span',
      'pre',
      'code',
      'hr',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      span: ['style'],
      '*': ['class'],
    },
    allowedStyles: {
      span: {
        color: [
          /^#[0-9a-f]{3,8}$/i,
          /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i,
          /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/i,
        ],
      },
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

function toBlogResponse(blog) {
  return {
    _id: String(blog._id),
    title: blog.title,
    normalizedTitle: blog.normalizedTitle,
    slug: blog.slug,
    topic: blog.topic,
    audience: blog.audience,
    appName: blog.appName,
    sourceLinks: blog.sourceLinks,
    suggestedKeywords: blog.suggestedKeywords,
    metaDescription: blog.metaDescription,
    excerpt: blog.excerpt,
    coverImage: blog.coverImage,
    contentHtml: blog.contentHtml,
    contentMarkdown: blog.contentMarkdown,
    editorData: blog.editorData,
    decisionSource: blog.decisionSource,
    crewName: blog.crewName,
    rawResult: blog.rawResult,
    status: blog.status,
    publishedAt: blog.publishedAt,
    generatedAt: blog.generatedAt,
    telegram: blog.telegram,
    createdAt: blog.createdAt,
    updatedAt: blog.updatedAt,
  };
}

export async function listBlogs(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const q = cleanString(req.query.q || '');
    const status = cleanString(req.query.status || '');

    const filter = {};

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { topic: { $regex: q, $options: 'i' } },
        { suggestedKeywords: { $regex: q, $options: 'i' } },
      ];
    }

    if (status && ['draft', 'published'].includes(status)) {
      filter.status = status;
    }

    const [items, total] = await Promise.all([
      AiBlog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AiBlog.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      ok: true,
      message: 'Blogs loaded successfully',
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getBlogById(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        ok: false,
        message: 'Invalid blog id',
      });
    }

    const blog = await AiBlog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found',
      });
    }

    return res.json({
      success: true,
      ok: true,
      message: 'Blog loaded successfully',
      data: {
        blog: toBlogResponse(blog),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createBlog(req, res, next) {
  try {
    requireFields(req.body, ['topic']);

    const payload = {
      title: cleanString(req.body.title || ''),
      topic: cleanString(req.body.topic),
      audience: cleanString(req.body.audience || 'general readers'),
      tone: cleanString(req.body.tone || 'clear and practical'),
      keywords: normalizeStringArray(req.body.keywords),
      min_words: Number(req.body.min_words || 800),
      max_words: Number(req.body.max_words || 1200),
    };

    const run = await enqueueCrewRun({
      crewName: 'blog',
      title: `Blog: ${payload.title || payload.topic}`,
      payload,
      meta: {
        appName: req.body.appName || 'Arka: Smart Analyzer',
        sourceLinks: getRequiredModelSourceLinks(),
        decisionSource: 'auto_from_links',
      },
      userId: req.user?._id || null,
    });

    return res.status(202).json({
      success: true,
      ok: true,
      message: 'Blog generation started in background',
      data: {
        runId: run._id,
        status: run.status,
        crewName: run.crewName,
        createdAt: run.createdAt,
      },
    });
  } catch (error) {
    console.log('createBlog enqueue error:', error);
    next(error);
  }
}

export async function updateBlog(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        ok: false,
        message: 'Invalid blog id',
      });
    }

    const blog = await AiBlog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        ok: false,
        message: 'Blog not found',
      });
    }

    if (req.body.title !== undefined) {
      const title = cleanString(req.body.title);

      if (!title) {
        return res.status(400).json({
          success: false,
          ok: false,
          message: 'Title cannot be empty',
        });
      }

      blog.title = title;
    }

    if (req.body.topic !== undefined) {
      const topic = cleanString(req.body.topic);

      if (!topic) {
        return res.status(400).json({
          success: false,
          ok: false,
          message: 'Topic cannot be empty',
        });
      }

      blog.topic = topic;
    }

    if (req.body.audience !== undefined) {
      blog.audience = cleanString(req.body.audience || 'general readers');
    }

    if (req.body.metaDescription !== undefined) {
      blog.metaDescription = cleanString(req.body.metaDescription);
    }

    if (req.body.excerpt !== undefined) {
      blog.excerpt = cleanString(req.body.excerpt);
    }

    if (req.body.suggestedKeywords !== undefined) {
      blog.suggestedKeywords = normalizeStringArray(req.body.suggestedKeywords);
    }

    if (req.body.contentHtml !== undefined) {
      const contentHtml = sanitizeBlogHtml(req.body.contentHtml);

      if (!contentHtml) {
        return res.status(400).json({
          success: false,
          ok: false,
          message: 'Content HTML cannot be empty',
        });
      }

      blog.contentHtml = contentHtml;
    }

    if (req.body.contentMarkdown !== undefined) {
      blog.contentMarkdown = cleanString(req.body.contentMarkdown);
    }

    if (req.body.editorData !== undefined) {
      blog.editorData = req.body.editorData;
    } else if (req.body.contentHtml !== undefined) {
      blog.editorData = {
        format: 'html',
        source: 'smart_blog_editor',
        html: blog.contentHtml,
        savedAt: new Date(),
      };
    }

    if (req.body.status !== undefined) {
      const status = cleanString(req.body.status);

      if (!['draft', 'published'].includes(status)) {
        return res.status(400).json({
          success: false,
          ok: false,
          message: 'Invalid blog status',
        });
      }

      blog.status = status;

      if (status === 'published' && !blog.publishedAt) {
        blog.publishedAt = new Date();
      }

      if (status === 'draft') {
        blog.publishedAt = null;
      }
    }

    await blog.save();

    return res.json({
      success: true,
      ok: true,
      message: 'Blog updated successfully',
      data: {
        blog: toBlogResponse(blog),
      },
    });
  } catch (error) {
    console.log('updateBlog error:', error);
    next(error);
  }
}