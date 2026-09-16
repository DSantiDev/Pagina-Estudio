export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.pdf,.xlsx,.docx';

export const ATTACHMENT_TYPES = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function attachmentMime(name) {
  const extension = /\.[a-z0-9]+$/i.exec(name)?.[0].toLowerCase();
  return ATTACHMENT_TYPES[extension] || null;
}
