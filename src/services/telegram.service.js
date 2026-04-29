import * as cheerio from 'cheerio';

const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TELEGRAM_REPORT_TIMEZONE =
  process.env.TELEGRAM_REPORT_TIMEZONE || 'Asia/Tehran';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(dateInput) {
  const date = new Date(dateInput || Date.now());

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TELEGRAM_REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function getExecutorName(user) {
  if (!user) return 'Unknown user';

  return (
    user.name ||
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    user.username ||
    user.email ||
    'Unknown user'
  );
}

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function extractTextFromHtml(html = '') {
  if (!html) return '';

  const $ = cheerio.load(html);

  $('script, style, noscript, iframe, svg').remove();

  const parts = [];

  $('h1, h2, h3').each((_, el) => {
    const text = normalizeText($(el).text());
    if (text) parts.push(text);
  });

  $('p').each((_, el) => {
    const text = normalizeText($(el).text());
    if (text) parts.push(text);
  });

  $('li').each((_, el) => {
    const text = normalizeText($(el).text());
    if (text) parts.push(`• ${text}`);
  });

  return [...new Set(parts)].join('\n').trim();
}

function extractTelegramReportFromTasks(tasksOutput = []) {
  if (!Array.isArray(tasksOutput) || !tasksOutput.length) return '';

  const chunks = [];

  for (const item of tasksOutput) {
    if (!item) continue;

    if (typeof item === 'string') {
      const text = item.trim();
      if (text) chunks.push(text);
      continue;
    }

    if (typeof item === 'object') {
      const value =
        item.raw ||
        item.output ||
        item.content ||
        item.result ||
        item.description ||
        '';

      if (value) chunks.push(String(value).trim());
    }
  }

  return chunks.join('\n\n').trim();
}

function buildReportBody({ telegramReport, html, tasksOutput = [] }) {
  if (telegramReport && String(telegramReport).trim()) {
    return String(telegramReport).trim();
  }

  const fromHtml = extractTextFromHtml(html);
  if (fromHtml) return fromHtml;

  const fromTasks = extractTelegramReportFromTasks(tasksOutput);
  if (fromTasks) return fromTasks;

  return 'No readable report content was extracted.';
}

function splitTelegramMessage(text, limit = 3900) {
  if (!text || text.length <= limit) return [text];

  const blocks = text.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;

    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (block.length <= limit) {
      current = block;
      continue;
    }

    let remaining = block;
    while (remaining.length > limit) {
      let cut = remaining.lastIndexOf('\n', limit);
      if (cut < 1000) cut = remaining.lastIndexOf(' ', limit);
      if (cut < 1000) cut = limit;

      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }

    if (remaining) current = remaining;
  }

  if (current) chunks.push(current);

  return chunks;
}

async function callTelegram(method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `Telegram API error: ${method}`);
  }

  return data.result;
}

export async function publishCrewReport({
  crewName,
  executedBy,
  createdAt,
  savedId,
  sourceFile,
  html = '',
  telegramReport = '',
  tasksOutput = [],
}) {
  if (!TELEGRAM_ENABLED) {
    return {
      ok: false,
      skipped: true,
      reason: 'Telegram is disabled',
    };
  }

  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing');
  }

  if (!TELEGRAM_CHANNEL_ID) {
    throw new Error('TELEGRAM_CHANNEL_ID is missing');
  }

  const reportBody = buildReportBody({
    telegramReport,
    html,
    tasksOutput,
  });

  const finalText = [
    `<b>📌 Crew Report: ${escapeHtml(crewName || 'unknown')}</b>`,
    `<b>Executed by:</b> ${escapeHtml(getExecutorName(executedBy))}`,
    `<b>Date & time:</b> ${escapeHtml(formatDateTime(createdAt))} (${escapeHtml(
      TELEGRAM_REPORT_TIMEZONE
    )})`,
    `<b>Run ID:</b> <code>${escapeHtml(savedId || '-')}</code>`,
    `<b>Source file:</b> ${escapeHtml(sourceFile || '-')}`,
    '',
    `<b>Report</b>`,
    escapeHtml(reportBody),
  ].join('\n');

  const chunks = splitTelegramMessage(finalText);
  const messages = [];

  for (const chunk of chunks) {
    const result = await callTelegram('sendMessage', {
      chat_id: TELEGRAM_CHANNEL_ID,
      text: chunk,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    messages.push({
      messageId: result.message_id,
      chatId: result.chat?.id,
    });
  }

  return {
    ok: true,
    skipped: false,
    messages,
    reportHtml: finalText,
  };
}