import asyncHandler from '../../utils/asyncHandler.js';
import {
  exchangeCode,
  getAuthUrl,
  getEmailById,
  getThreadById,
  listEmails,
  listLabels,
} from '../../services/gmail.service.js';
import { runPythonCrew } from '../../services/pythonRunner.service.js';

function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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

function extractEmailAddress(value = '') {
  if (!value) return '';

  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) {
    return match[1].trim();
  }

  return value.trim();
}

function extractNameFromFromField(value = '') {
  if (!value) return '';

  const angleMatch = value.match(/^(.*?)\s*<[^>]+>$/);
  if (angleMatch?.[1]) {
    return angleMatch[1].replace(/^"|"$/g, '').trim();
  }

  const emailOnly = extractEmailAddress(value);
  if (emailOnly.includes('@')) {
    return '';
  }

  return value.trim();
}

function validateCrewResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('Crew returned invalid JSON content');
    error.statusCode = 500;
    throw error;
  }

  if (!parsed.analysis || typeof parsed.analysis !== 'object') {
    const error = new Error('Crew response is missing analysis section');
    error.statusCode = 500;
    throw error;
  }

  if (!parsed.reply || typeof parsed.reply !== 'object') {
    const error = new Error('Crew response is missing reply section');
    error.statusCode = 500;
    throw error;
  }

  if (!String(parsed.reply.subject || '').trim()) {
    const error = new Error('Crew response is missing reply.subject');
    error.statusCode = 500;
    throw error;
  }

  if (!String(parsed.reply.body_text || '').trim()) {
    const error = new Error('Crew response is missing reply.body_text');
    error.statusCode = 500;
    throw error;
  }
}

function buildThreadContext(thread, currentEmailId) {
  if (!thread?.messages?.length) return '';

  const sorted = [...thread.messages].sort(
    (a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0)
  );

  const compactMessages = sorted.map((message, index) => {
    const marker = message.id === currentEmailId ? 'CURRENT EMAIL' : `THREAD MESSAGE ${index + 1}`;

    return [
      marker,
      `Subject: ${message.subject || '(No subject)'}`,
      `From: ${message.from || '—'}`,
      `To: ${message.to || '—'}`,
      `CC: ${message.cc || '—'}`,
      `Date: ${message.date || '—'}`,
      `Body: ${getReadableBody(message)}`,
    ].join('\n');
  });

  return compactMessages.join('\n\n---\n\n');
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

  const payload = {
    customer_email_from: extractEmailAddress(email.from),
    customer_name: extractNameFromFromField(email.from),
    customer_email_subject: normalizeString(email.subject),
    customer_email_body: getReadableBody(email),
    desired_tone:
      normalizeString(req.body?.desired_tone) ||
      'professional, direct, helpful',
    sender_name: normalizeString(req.body?.sender_name) || 'Mahdi',
    sender_role: normalizeString(req.body?.sender_role) || 'Founder',
    sender_company: normalizeString(req.body?.sender_company) || 'Arka',
    cta_goal:
      normalizeString(req.body?.cta_goal) ||
      'move the conversation toward a short discovery call',
    extra_context:
      normalizeString(req.body?.extra_context) ||
      buildThreadContext(thread, email.id),
  };

  const result = await runPythonCrew({
    crewName: 'marketing_email_reply',
    payload,
  });

  const rawContent = result?.result?.content || '';
  const parsed = safeJsonParse(rawContent);

  validateCrewResponse(parsed);

  res.json({
    success: true,
    message: 'Marketing email analysis generated successfully',
    data: parsed,
    meta: {
      crewName: 'marketing_email_reply',
      emailId: email.id,
      threadId: email.threadId || '',
    },
  });
});