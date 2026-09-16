export type ReviewAnswer = { key: string; question: string; answer: string; empty: boolean };

function readObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function formatAnswer(value: unknown): string {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatAnswer).filter(Boolean).join('\n');
  return 'Esta respuesta no se puede mostrar en este formato.';
}

// Use question IDs to join answers to their labels, keeping the teacher's field order.
export function readFormAnswers(schema: string | undefined, rawAnswers: string): { items: ReviewAnswer[]; error: string } {
  const answers = readObject(rawAnswers);
  if (!answers) return { items: [], error: 'No se pudieron leer las respuestas de este envío.' };
  const definition = readObject(schema || '{}');
  const fields = Array.isArray(definition?.fields) ? definition.fields : [];
  const seen = new Set<string>();
  const items: ReviewAnswer[] = [];
  for (const value of fields) {
    if (!value || typeof value !== 'object' || typeof value.id !== 'string' || seen.has(value.id)) continue;
    seen.add(value.id);
    const answer = formatAnswer(Object.prototype.hasOwnProperty.call(answers, value.id) ? answers[value.id] : undefined);
    items.push({ key: value.id, question: typeof value.label === 'string' && value.label.trim() ? value.label : `Pregunta ${items.length + 1}`, answer: answer || 'Sin respuesta', empty: !answer });
  }
  // Preserve older answers even when a question was removed from the current form.
  for (const [key, value] of Object.entries(answers)) {
    if (seen.has(key)) continue;
    const answer = formatAnswer(value);
    items.push({ key, question: `Respuesta ${items.length + 1} · pregunta original no disponible`, answer: answer || 'Sin respuesta', empty: !answer });
  }
  return { items, error: '' };
}
