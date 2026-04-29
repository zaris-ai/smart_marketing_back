import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getHeaderValue(headers = [], name) {
  const header = headers.find(
    (item) => item?.name?.toLowerCase() === name.toLowerCase()
  );

  return header?.value || '';
}

function decodeBase64Url(value = '') {
  if (!value) return '';

  return Buffer.from(
    value.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  ).toString('utf8');
}

function extractBodyFromPayload(payload) {
  if (!payload) {
    return {
      textPlain: '',
      textHtml: '',
    };
  }

  let textPlain = '';
  let textHtml = '';

  const walk = (part) => {
    if (!part) return;

    if (part.mimeType === 'text/plain' && part.body?.data && !textPlain) {
      textPlain = decodeBase64Url(part.body.data);
    }

    if (part.mimeType === 'text/html' && part.body?.data && !textHtml) {
      textHtml = decodeBase64Url(part.body.data);
    }

    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  };

  walk(payload);

  if (!textPlain && payload.body?.data) {
    textPlain = decodeBase64Url(payload.body.data);
  }

  return {
    textPlain,
    textHtml,
  };
}

function mapMessageSummary(msg) {
  const headers = msg.payload?.headers || [];

  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds || [],
    snippet: msg.snippet || '',
    from: getHeaderValue(headers, 'From'),
    to: getHeaderValue(headers, 'To'),
    cc: getHeaderValue(headers, 'Cc'),
    subject: getHeaderValue(headers, 'Subject'),
    date: getHeaderValue(headers, 'Date'),
    internalDate: msg.internalDate || null,
  };
}

function mapMessageFull(msg) {
  const headers = msg.payload?.headers || [];
  const body = extractBodyFromPayload(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    labelIds: msg.labelIds || [],
    snippet: msg.snippet || '',
    historyId: msg.historyId || null,
    internalDate: msg.internalDate || null,
    from: getHeaderValue(headers, 'From'),
    to: getHeaderValue(headers, 'To'),
    cc: getHeaderValue(headers, 'Cc'),
    bcc: getHeaderValue(headers, 'Bcc'),
    subject: getHeaderValue(headers, 'Subject'),
    date: getHeaderValue(headers, 'Date'),
    textPlain: body.textPlain,
    textHtml: body.textHtml,
    headers,
  };
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    requireEnv('GOOGLE_CLIENT_ID'),
    requireEnv('GOOGLE_CLIENT_SECRET'),
    requireEnv('GOOGLE_REDIRECT_URI')
  );
}

export function getAuthUrl() {
  const client = getOAuthClient();

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code) {
  if (!code) {
    throw new Error('Missing OAuth code');
  }

  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);

  return tokens;
}

export function getGmailClient() {
  const refreshToken = requireEnv('GOOGLE_REFRESH_TOKEN');
  const client = getOAuthClient();

  client.setCredentials({
    refresh_token: refreshToken,
  });

  return google.gmail({
    version: 'v1',
    auth: client,
  });
}

export async function listLabels() {
  const gmail = getGmailClient();

  const { data } = await gmail.users.labels.list({
    userId: 'me',
  });

  return data.labels || [];
}

export async function findLabelIdByName(labelName) {
  if (!labelName) return null;

  const labels = await listLabels();
  const normalizedLabelName = labelName.trim().toLowerCase();

  const label = labels.find(
    (item) => item?.name?.trim().toLowerCase() === normalizedLabelName
  );

  return label?.id || null;
}

export async function listEmails({
  maxResults = 10,
  q = '',
  labelIds = ['INBOX'],
  labelName,
  pageToken,
} = {}) {
  const gmail = getGmailClient();

  let resolvedLabelIds = Array.isArray(labelIds) ? [...labelIds] : ['INBOX'];

  if (labelName) {
    const labelId = await findLabelIdByName(labelName);

    if (!labelId) {
      return {
        messages: [],
        nextPageToken: null,
        resultSizeEstimate: 0,
      };
    }

    resolvedLabelIds = [labelId];
  }

  const { data } = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: q || undefined,
    labelIds: resolvedLabelIds,
    pageToken,
  });

  const messageRefs = data.messages || [];

  const messages = await Promise.all(
    messageRefs.map(async ({ id }) => {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Cc', 'Bcc', 'Subject', 'Date'],
      });

      return mapMessageSummary(msg);
    })
  );

  return {
    messages,
    nextPageToken: data.nextPageToken || null,
    resultSizeEstimate: data.resultSizeEstimate || 0,
  };
}

export async function getEmailById(messageId) {
  if (!messageId) {
    throw new Error('Message ID is required');
  }

  const gmail = getGmailClient();

  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  return mapMessageFull(data);
}

export async function getThreadById(threadId) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  const gmail = getGmailClient();

  const { data } = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  return {
    id: data.id,
    historyId: data.historyId || null,
    messages: (data.messages || []).map(mapMessageFull),
  };
}