import {
    escapeHtml,
    htmlToPlainText,
    markdownishToTelegramHtml,
} from '../utils/telegramHtml.js'

function pickReportBody(output) {
    if (output == null) return '';

    if (typeof output === 'string') {
        return output;
    }

    if (typeof output === 'object') {
        if (output.report_markdown) return output.report_markdown;
        if (output.report_md) return output.report_md;
        if (output.report_html) return htmlToPlainText(output.report_html);
        if (output.html) return htmlToPlainText(output.html);
        if (output.final_answer) return output.final_answer;
        if (output.result && typeof output.result === 'string') return output.result;
        return JSON.stringify(output, null, 2);
    }

    return String(output);
}

function formatDateTime(dateInput, timezone = process.env.TELEGRAM_REPORT_TIMEZONE || 'UTC') {
    const date = new Date(dateInput || Date.now());

    return new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

function buildInputSummary(input) {
    if (!input) return '';

    if (typeof input === 'string') {
        return input.slice(0, 400);
    }

    try {
        const raw = JSON.stringify(input);
        return raw.length > 400 ? raw.slice(0, 400) + '…' : raw;
    } catch {
        return '';
    }
}

function buildTelegramReport({
    crewName,
    runId,
    executedBy,
    createdAt,
    input,
    output,
}) {
    const person =
        executedBy?.name ||
        executedBy?.fullName ||
        executedBy?.email ||
        executedBy?.username ||
        'Unknown user';

    const bodySource = pickReportBody(output);
    const bodyHtml = markdownishToTelegramHtml(bodySource);
    const inputSummary = buildInputSummary(input);

    const parts = [
        `<b>📌 Crew Report: ${escapeHtml(crewName || 'unknown')}</b>`,
        `<b>Executed by:</b> ${escapeHtml(person)}`,
        `<b>Date & time:</b> ${escapeHtml(formatDateTime(createdAt))} (${escapeHtml(process.env.TELEGRAM_REPORT_TIMEZONE || 'UTC')})`,
        `<b>Run ID:</b> <code>${escapeHtml(runId || '-')}</code>`,
    ];

    if (inputSummary) {
        parts.push(`<b>Input:</b> ${escapeHtml(inputSummary)}`);
    }

    parts.push('');
    parts.push('<b>Report</b>');
    parts.push(bodyHtml);

    return parts.join('\n');
}

export {
    buildTelegramReport,
};