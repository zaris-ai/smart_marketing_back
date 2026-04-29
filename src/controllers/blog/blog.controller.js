import { marked } from 'marked';
import { randomUUID } from 'node:crypto';
import { runPythonCrew } from '../../services/pythonRunner.service.js';
import { publishCrewReport } from '../../services/telegram.service.js';
import { requireFields } from './crew.validators.js';

function safeParseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeBlogResult(rawContent, payload) {
  const parsed = safeParseJson(rawContent);

  // Preferred mode: crew returns strict JSON
  if (parsed && typeof parsed === 'object') {
    const title = String(parsed.title || payload.topic || 'Untitled blog').trim();
    const metaDescription = String(parsed.meta_description || '').trim();
    const excerpt = String(parsed.excerpt || '').trim();
    const suggestedKeywords = Array.isArray(parsed.suggested_keywords)
      ? parsed.suggested_keywords
      : [];
    const contentMarkdown = String(parsed.content_markdown || '').trim();
    const contentHtml = contentMarkdown ? marked.parse(contentMarkdown) : '';
    const telegramReport = String(parsed.telegram_report || '').trim();

    return {
      title,
      metaDescription,
      excerpt,
      suggestedKeywords,
      contentMarkdown,
      contentHtml,
      telegramReport,
      raw: parsed,
    };
  }

  // Fallback mode: crew returned plain markdown
  const contentMarkdown = String(rawContent || '').trim();
  const contentHtml = contentMarkdown ? marked.parse(contentMarkdown) : '';

  return {
    title: payload.topic,
    metaDescription: '',
    excerpt: '',
    suggestedKeywords: Array.isArray(payload.keywords) ? payload.keywords : [],
    contentMarkdown,
    contentHtml,
    telegramReport: `Blog generated: ${payload.topic}\nAudience: ${payload.audience}\nTone: ${payload.tone}`,
    raw: rawContent,
  };
}

export async function createBlog(req, res, next) {
  try {
    requireFields(req.body, ['topic']);

    const payload = {
      topic: req.body.topic,
      audience: req.body.audience || 'general readers',
      tone: req.body.tone || 'clear and practical',
      keywords: Array.isArray(req.body.keywords) ? req.body.keywords : [],
      min_words: Number(req.body.min_words || 800),
      max_words: Number(req.body.max_words || 1200),
    };

    const result = await runPythonCrew({
      crewName: 'blog',
      payload,
    });

    const rawContent = result?.result?.content || '';
    const blog = normalizeBlogResult(rawContent, payload);

    if (!blog.contentMarkdown || !blog.contentHtml) {
      return res.status(500).json({
        ok: false,
        error: 'Blog crew output was empty or invalid',
      });
    }

    const runId = randomUUID();

    let telegram = {
      ok: false,
      skipped: true,
      reason: 'Not attempted',
    };

    try {
      telegram = await publishCrewReport({
        crewName: 'blog',
        executedBy: req.user || null,
        createdAt: new Date(),
        savedId: runId,
        sourceFile: 'blog',
        html: blog.contentHtml,
        telegramReport:
          blog.telegramReport ||
          `Blog generated: ${blog.title}\nAudience: ${payload.audience}`,
      });
    } catch (telegramError) {
      console.error('publishCrewReport error:', telegramError);

      telegram = {
        ok: false,
        skipped: false,
        error: telegramError.message || 'Telegram publish failed',
      };
    }

    return res.status(201).json({
      ok: true,
      message: 'Blog created successfully',
      data: {
        runId,
        title: blog.title,
        content: blog.contentMarkdown, // backward-compatible
        contentMarkdown: blog.contentMarkdown,
        contentHtml: blog.contentHtml,
        metaDescription: blog.metaDescription,
        excerpt: blog.excerpt,
        suggestedKeywords: blog.suggestedKeywords,
        telegramReport: blog.telegramReport,
        telegram,
        rawResult: blog.raw,

        // extra backward-compatible structure
        result: {
          content: blog.contentMarkdown,
          html: blog.contentHtml,
          telegram_report: blog.telegramReport,
        },
      },
    });
  } catch (error) {
    console.log('createBlog error:', error);
    next(error);
  }
}