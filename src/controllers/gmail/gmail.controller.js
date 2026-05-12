import asyncHandler from '../../utils/asyncHandler.js';
import GmailEmail from '../../models/gmailEmail.model.js';
import {
  exchangeCode,
  getAuthUrl,
  getEmailById,
  getThreadById,
  listEmails,
  listLabels,
} from '../../services/gmail.service.js';
import { enqueueCrewRun } from '../../services/backgroundCrew.service.js';

function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function getReadableBody(message) {
  if (!message) return '';

  return (
    normalizeString(message.textPlain) ||
    normalizeString(message.snippet) ||
    'No readable plain-text body found.'
  );
}

function buildEmailDbPayload(email, thread = null) {
  return {
    gmailId: email.id,
    threadId: email.threadId || '',
    labelIds: email.labelIds || [],
    snippet: email.snippet || '',
    historyId: email.historyId || '',
    internalDate: email.internalDate || '',
    from: email.from || '',
    to: email.to || '',
    cc: email.cc || '',
    bcc: email.bcc || '',
    subject: email.subject || '',
    date: email.date || '',
    textPlain: email.textPlain || '',
    textHtml: email.textHtml || '',
    headers: email.headers || [],
    threadMessages: thread?.messages || [],
    deletedAt: null,
  };
}

export const gmailAuthUrl = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    url: getAuthUrl(),
  });
});

export const gmailOAuthCallback = asyncHandler(async (req, res) => {
  const { code } = req.query;
  const tokens = await exchangeCode(code);

  res.json({
    success: true,
    message: 'Save refresh_token into GOOGLE_REFRESH_TOKEN',
    tokens,
  });
});

export const listMyEmails = asyncHandler(async (req, res) => {
  const maxResults = Number(req.query.maxResults || 10);
  const q = String(req.query.q || '');
  const labelName = req.query.labelName
    ? String(req.query.labelName)
    : undefined;
  const pageToken = req.query.pageToken || undefined;

  const data = await listEmails({
    maxResults,
    q,
    labelName,
    pageToken,
    labelIds: ['INBOX'],
  });

  res.json({
    success: true,
    data,
  });
});

export const listMyLabels = asyncHandler(async (req, res) => {
  const data = await listLabels();

  res.json({
    success: true,
    data,
  });
});

export const getMyEmailById = asyncHandler(async (req, res) => {
  const data = await getEmailById(req.params.id);

  res.json({
    success: true,
    data,
  });
});

export const getMyThreadById = asyncHandler(async (req, res) => {
  const data = await getThreadById(req.params.threadId);

  res.json({
    success: true,
    data,
  });
});

export const saveMyEmailById = asyncHandler(async (req, res) => {
  const emailId = req.params.id;

  if (!emailId) {
    return res.status(400).json({
      success: false,
      message: 'Email id is required',
    });
  }

  const email = await getEmailById(emailId);

  if (!email) {
    return res.status(404).json({
      success: false,
      message: 'Email not found',
    });
  }

  let thread = null;

  if (email.threadId) {
    try {
      thread = await getThreadById(email.threadId);
    } catch {
      thread = null;
    }
  }

  const saved = await GmailEmail.findOneAndUpdate(
    { gmailId: email.id },
    {
      $set: buildEmailDbPayload(email, thread),
      $setOnInsert: {
        status: 'unread',
        answerStatus: 'not_answered',
        localTags: [],
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  res.json({
    success: true,
    message: 'Email saved successfully',
    data: saved,
  });
});

export const listSavedMyEmails = asyncHandler(async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const skip = (page - 1) * limit;

  const q = normalizeString(req.query.q);
  const status = normalizeString(req.query.status);
  const answerStatus = normalizeString(req.query.answerStatus);
  const tag = normalizeString(req.query.tag);
  const hasAnalysis = normalizeString(req.query.hasAnalysis);

  const sortBy = normalizeString(req.query.sortBy) || 'createdAt';
  const sortOrder = normalizeString(req.query.sortOrder) === 'asc' ? 1 : -1;

  const allowedSortFields = [
    'createdAt',
    'updatedAt',
    'date',
    'subject',
    'from',
    'status',
    'answerStatus',
  ];

  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const filter = {
    deletedAt: null,
  };

  if (status) {
    filter.status = status;
  }

  if (answerStatus) {
    filter.answerStatus = answerStatus;
  }

  if (tag) {
    filter.localTags = tag;
  }

  if (hasAnalysis === 'true') {
    filter.latestAnalysis = { $ne: null };
  }

  if (hasAnalysis === 'false') {
    filter.latestAnalysis = null;
  }

  if (q) {
    filter.$or = [
      { subject: { $regex: q, $options: 'i' } },
      { from: { $regex: q, $options: 'i' } },
      { to: { $regex: q, $options: 'i' } },
      { textPlain: { $regex: q, $options: 'i' } },
      { snippet: { $regex: q, $options: 'i' } },
      { localTags: { $regex: q, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    GmailEmail.find(filter)
      .sort({ [safeSortBy]: sortOrder, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    GmailEmail.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      filters: {
        q,
        status,
        answerStatus,
        tag,
        hasAnalysis,
        sortBy: safeSortBy,
        sortOrder: sortOrder === 1 ? 'asc' : 'desc',
      },
    },
  });
});

export const getSavedMyEmailById = asyncHandler(async (req, res) => {
  const data = await GmailEmail.findOne({
    _id: req.params.id,
    deletedAt: null,
  }).lean();

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Saved email not found',
    });
  }

  res.json({
    success: true,
    data,
  });
});

export const updateSavedMyEmailById = asyncHandler(async (req, res) => {
  const allowed = {};

  if (req.body.status) {
    if (!['read', 'unread'].includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Use read or unread.',
      });
    }

    allowed.status = req.body.status;
  }

  if (req.body.answerStatus) {
    if (!['answered', 'not_answered'].includes(req.body.answerStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid answerStatus. Use answered or not_answered.',
      });
    }

    allowed.answerStatus = req.body.answerStatus;
  }

  if (Array.isArray(req.body.localTags)) {
    allowed.localTags = req.body.localTags
      .map((tag) => normalizeString(tag))
      .filter(Boolean);
  }

  const data = await GmailEmail.findOneAndUpdate(
    {
      _id: req.params.id,
      deletedAt: null,
    },
    {
      $set: allowed,
    },
    {
      new: true,
    }
  );

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Saved email not found',
    });
  }

  res.json({
    success: true,
    message: 'Saved email updated successfully',
    data,
  });
});

export const deleteSavedMyEmailById = asyncHandler(async (req, res) => {
  const hard = String(req.query.hard || '') === 'true';

  const data = hard
    ? await GmailEmail.findByIdAndDelete(req.params.id)
    : await GmailEmail.findOneAndUpdate(
        {
          _id: req.params.id,
          deletedAt: null,
        },
        {
          $set: {
            deletedAt: new Date(),
          },
        },
        {
          new: true,
        }
      );

  if (!data) {
    return res.status(404).json({
      success: false,
      message: 'Saved email not found',
    });
  }

  res.json({
    success: true,
    message: hard
      ? 'Saved email permanently deleted'
      : 'Saved email deleted successfully',
    data,
  });
});

export const analyzeMyEmailById = asyncHandler(async (req, res) => {
  const emailId = req.params.id;

  if (!emailId) {
    return res.status(400).json({
      success: false,
      message: 'Email id is required',
    });
  }

  const email = await getEmailById(emailId);

  if (!email) {
    return res.status(404).json({
      success: false,
      message: 'Email not found',
    });
  }

  let thread = null;

  if (email.threadId) {
    try {
      thread = await getThreadById(email.threadId);
    } catch {
      thread = null;
    }
  }

  const emailBody = getReadableBody(email);

  const payload = {
    raw_email_body: emailBody,
    desired_tone:
      normalizeString(req.body?.desired_tone) ||
      'professional, direct, helpful',
    sender_name: normalizeString(req.body?.sender_name) || 'Mahdi',
    sender_role: normalizeString(req.body?.sender_role) || 'Founder',
    sender_company: normalizeString(req.body?.sender_company) || 'Arka',
    cta_goal:
      normalizeString(req.body?.cta_goal) ||
      'reply clearly and move the conversation to the next useful step',
  };

  const dbPayload = buildEmailDbPayload(email, thread);

  const savedEmail = await GmailEmail.findOneAndUpdate(
    { gmailId: email.id },
    {
      $set: dbPayload,
      $setOnInsert: {
        status: 'unread',
        answerStatus: 'not_answered',
        localTags: [],
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  const run = await enqueueCrewRun({
    crewName: 'marketing_email_reply',
    title: `Analyze email: ${email.subject || email.from || email.id}`,
    payload,
    meta: {
      gmailEmailId: savedEmail._id,
      gmailId: email.id,
      threadId: email.threadId || '',
      subject: email.subject || '',
      from: email.from || '',
    },
    userId: req.user?._id || null,
  });

  return res.status(202).json({
    success: true,
    ok: true,
    message: 'Email analysis started in background',
    data: {
      runId: run._id,
      status: run.status,
      crewName: run.crewName,
      createdAt: run.createdAt,
    },
    savedEmail,
    meta: {
      crewName: 'marketing_email_reply',
      emailId: email.id,
      threadId: email.threadId || '',
    },
  });
});