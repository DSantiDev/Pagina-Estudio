import { inflateRawSync } from 'node:zlib';
import { attachmentMime, MAX_ATTACHMENT_BYTES } from '../shared/attachments.js';

const invalid = message => { throw Object.assign(new Error(message), { status: 415 }); };
export function validateAttachmentMetadata(name, mime) {
  const expected = attachmentMime(name);
  if (!expected || /[\\/\x00-\x1f]/.test(name) || name.length > 150) invalid('Solo se permiten PDF, Excel (.xlsx) o Word (.docx).');
  if (mime !== expected && mime !== 'application/octet-stream') invalid('El tipo de archivo no coincide con su extensión.');
  return expected;
}

// Inspect the Office package without extracting it onto disk.
function officeEntries(bytes) {
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (bytes.readUInt32LE(offset) === 0x06054b50 && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) { end = offset; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) invalid('El documento de Office está dañado o no es compatible.');
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (!count || count > 10000 || offset + size !== end) invalid('El documento de Office no es válido.');
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) invalid('El documento de Office no es válido.');
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20), expanded = bytes.readUInt32LE(offset + 24);
    const nameSize = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    if (offset + 46 + nameSize + extra + comment > end || localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) invalid('El documento de Office no es válido.');
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize).toString('utf8');
    const localNameSize = bytes.readUInt16LE(localOffset + 26), localExtra = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameSize + localExtra;
    if (start + compressed > bytes.length || name !== bytes.subarray(localOffset + 30, localOffset + 30 + localNameSize).toString('utf8') || entries.has(name)) invalid('El documento de Office no es válido.');
    if (flags & 1 || ![0, 8].includes(method) || name.includes('..') || name.startsWith('/') || /vbaProject|activeX|embeddings\/|\.(exe|dll|js|vbs|bat|cmd|ps1)$/i.test(name)) invalid('No se permiten documentos cifrados, con macros o con archivos ejecutables incrustados.');
    entries.set(name, { method, expanded, data: bytes.subarray(start, start + compressed) });
    offset += 46 + nameSize + extra + comment;
  }
  if (offset !== end) invalid('El documento de Office no es válido.');
  return entries;
}

export function validateAttachment(bytes, name, mime) {
  const expected = validateAttachmentMetadata(name, mime);
  if (!bytes.length) throw Object.assign(new Error('El archivo está vacío.'), { status: 400 });
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw Object.assign(new Error('El archivo supera el límite de 10 MB.'), { status: 413 });
  if (expected === 'application/pdf') {
    if (!/^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString('ascii')) || !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))) invalid('El archivo no contiene un PDF válido.');
    return expected;
  }
  try {
    const entries = officeEntries(bytes), contentTypes = entries.get('[Content_Types].xml');
    if (!contentTypes || contentTypes.expanded > 256 * 1024) invalid('El documento de Office no es válido.');
    const xml = (contentTypes.method === 8 ? inflateRawSync(contentTypes.data, { maxOutputLength: 256 * 1024 }) : contentTypes.data).toString('utf8');
    const word = expected === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const main = word ? 'word/document.xml' : 'xl/workbook.xml';
    const type = word ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
    if (!entries.has(main) || !xml.includes(type) || /macroEnabled|vbaProject/i.test(xml)) invalid('El contenido del documento no corresponde al formato seleccionado.');
  } catch (error) {
    if (error.status) throw error;
    invalid('El documento de Office está dañado o no es compatible.');
  }
  return expected;
}
