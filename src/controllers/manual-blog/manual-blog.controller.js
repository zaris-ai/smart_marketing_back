import Joi from 'joi';
import sanitizeHtml from 'sanitize-html';

import AiBlog from '../../models/ai-blog.model.js';
import asyncHandler from '../../utils/asyncHandler.js';

function createHttpError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function slugify(value = '') {
    const slug = String(value)
        .normalize('NFKD')
        .toLowerCase()
        .trim()
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');

    return slug || 'blog';
}

async function makeUniqueSlug(baseSlug, excludeId = null) {
    let slug = slugify(baseSlug);
    let counter = 2;

    const query = excludeId
        ? { slug, _id: { $ne: excludeId } }
        : { slug };

    while (await AiBlog.exists(query)) {
        slug = `${slugify(baseSlug)}-${counter}`;
        counter += 1;

        if (excludeId) {
            query.slug = slug;
        } else {
            query.slug = slug;
        }
    }

    return slug;
}

function sanitizeBlogHtml(html = '') {
    return sanitizeHtml(html, {
        allowedTags: [
            'p',
            'br',
            'strong',
            'b',
            'em',
            'i',
            'u',
            's',
            'h1',
            'h2',
            'h3',
            'h4',
            'ul',
            'ol',
            'li',
            'blockquote',
            'code',
            'pre',
            'a',
            'span',
            'div',
            'hr',
        ],
        allowedAttributes: {
            a: ['href', 'target', 'rel'],
            span: ['style'],
            div: ['style'],
            '*': ['class'],
        },
        allowedStyles: {
            '*': {
                color: [
                    /^#[0-9a-f]{3,8}$/i,
                    /^rgb\((\s*\d+\s*,){2}\s*\d+\s*\)$/i,
                    /^rgba\((\s*\d+\s*,){3}\s*(0|1|0?\.\d+)\s*\)$/i,
                ],
                'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
            },
        },
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', {
                target: '_blank',
                rel: 'noopener noreferrer',
            }),
        },
    });
}

function isEmptyHtml(html = '') {
    const text = sanitizeHtml(html, {
        allowedTags: [],
        allowedAttributes: {},
    })
        .replace(/\s+/g, ' ')
        .trim();

    return !text;
}

const manualBlogSchema = Joi.object({
    title: Joi.string().trim().min(3).max(220).required(),
    slug: Joi.string().trim().allow('').max(260).optional(),
    topic: Joi.string().trim().min(2).max(220).required(),

    audience: Joi.string().trim().allow('').max(160).default('Shopify merchants'),
    appName: Joi.string().trim().allow('').max(160).default('Arka: Smart Analyzer'),

    suggestedKeywords: Joi.array().items(Joi.string().trim().max(80)).default([]),

    metaDescription: Joi.string().trim().allow('').max(320).default(''),
    excerpt: Joi.string().trim().allow('').max(700).default(''),

    coverImage: Joi.object({
        url: Joi.string().trim().allow('').max(1000).default(''),
        sourcePage: Joi.string().trim().allow('').max(1000).default(''),
        query: Joi.string().trim().allow('').max(300).default(''),
        alt: Joi.string().trim().allow('').max(300).default(''),
    }).default({}),

    contentHtml: Joi.string().required(),
    contentMarkdown: Joi.string().allow('').default(''),
    editorData: Joi.any().allow(null).default(null),

    status: Joi.string().valid('draft', 'published').default('draft'),
});

export const createManualBlog = asyncHandler(async (req, res) => {
    const { value, error } = manualBlogSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        throw createHttpError(
            400,
            error.details.map((detail) => detail.message).join(', ')
        );
    }

    const cleanHtml = sanitizeBlogHtml(value.contentHtml);

    if (isEmptyHtml(cleanHtml)) {
        throw createHttpError(400, 'Blog content is required');
    }

    const slug = await makeUniqueSlug(value.slug || value.title);

    const blog = await AiBlog.create({
        ...value,
        slug,
        contentHtml: cleanHtml,
        decisionSource: 'manual',
        crewName: 'manual_blog',
        sourceLinks: [],
        rawResult: null,
        generatedAt: new Date(),
        publishedAt: value.status === 'published' ? new Date() : null,
    });

    res.status(201).json({
        success: true,
        message:
            blog.status === 'published'
                ? 'Manual blog published successfully'
                : 'Manual blog saved as draft',
        blog,
    });
});

export const listManualBlogs = asyncHandler(async (req, res) => {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 100);
    const skip = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status) : '';
    const q = req.query.q ? String(req.query.q).trim() : '';

    const filter = {
        decisionSource: 'manual',
    };

    if (status && ['draft', 'published'].includes(status)) {
        filter.status = status;
    }

    if (q) {
        filter.$or = [
            { title: { $regex: q, $options: 'i' } },
            { topic: { $regex: q, $options: 'i' } },
            { excerpt: { $regex: q, $options: 'i' } },
            { metaDescription: { $regex: q, $options: 'i' } },
        ];
    }

    const [blogs, total] = await Promise.all([
        AiBlog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AiBlog.countDocuments(filter),
    ]);

    res.json({
        success: true,
        blogs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});

export const getManualBlogById = asyncHandler(async (req, res) => {
    const blog = await AiBlog.findOne({
        _id: req.params.id,
        decisionSource: 'manual',
    }).lean();

    if (!blog) {
        throw createHttpError(404, 'Manual blog not found');
    }

    res.json({
        success: true,
        blog,
    });
});

export const updateManualBlog = asyncHandler(async (req, res) => {
    const existingBlog = await AiBlog.findOne({
        _id: req.params.id,
        decisionSource: 'manual',
    });

    if (!existingBlog) {
        throw createHttpError(404, 'Manual blog not found');
    }

    const { value, error } = manualBlogSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
    });

    if (error) {
        throw createHttpError(
            400,
            error.details.map((detail) => detail.message).join(', ')
        );
    }

    const cleanHtml = sanitizeBlogHtml(value.contentHtml);

    if (isEmptyHtml(cleanHtml)) {
        throw createHttpError(400, 'Blog content is required');
    }

    const nextSlug =
        value.slug && value.slug !== existingBlog.slug
            ? await makeUniqueSlug(value.slug, existingBlog._id)
            : existingBlog.slug;

    existingBlog.set({
        ...value,
        slug: nextSlug,
        contentHtml: cleanHtml,
        decisionSource: 'manual',
        crewName: 'manual_blog',
        sourceLinks: [],
        rawResult: null,
        publishedAt:
            value.status === 'published'
                ? existingBlog.publishedAt || new Date()
                : null,
    });

    await existingBlog.save();

    res.json({
        success: true,
        message:
            existingBlog.status === 'published'
                ? 'Manual blog updated and published'
                : 'Manual blog updated as draft',
        blog: existingBlog,
    });
});

export const publishManualBlog = asyncHandler(async (req, res) => {
    const blog = await AiBlog.findOne({
        _id: req.params.id,
        decisionSource: 'manual',
    });

    if (!blog) {
        throw createHttpError(404, 'Manual blog not found');
    }

    if (isEmptyHtml(blog.contentHtml)) {
        throw createHttpError(400, 'Blog content is required before publishing');
    }

    blog.status = 'published';
    blog.publishedAt = blog.publishedAt || new Date();

    await blog.save();

    res.json({
        success: true,
        message: 'Manual blog published successfully',
        blog,
    });
});

export const deleteManualBlog = asyncHandler(async (req, res) => {
    const blog = await AiBlog.findOneAndDelete({
        _id: req.params.id,
        decisionSource: 'manual',
    });

    if (!blog) {
        throw createHttpError(404, 'Manual blog not found');
    }

    res.json({
        success: true,
        message: 'Manual blog deleted successfully',
    });
});