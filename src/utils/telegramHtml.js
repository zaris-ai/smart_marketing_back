function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function htmlToPlainText(input = '') {
  return String(input)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function markdownishToTelegramHtml(input = '') {
  let text = String(input || '').replace(/\r\n/g, '\n').trim();
  text = escapeHtml(text);

  // fenced code
  text = text.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre>${String(code || '').trim()}</pre>`;
  });

  // inline code
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // headings
  text = text.replace(/^###\s+(.+)$/gm, '<b>$1</b>');
  text = text.replace(/^##\s+(.+)$/gm, '<b>$1</b>');
  text = text.replace(/^#\s+(.+)$/gm, '<b>$1</b>');

  // bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  // bullets
  text = text.replace(/^\s*[-*]\s+(.+)$/gm, '• $1');

  // cleanup
  text = text.replace(/\n{3,}/g, '\n\n');

  return text;
}

export {
  escapeHtml,
  htmlToPlainText,
  markdownishToTelegramHtml,
};