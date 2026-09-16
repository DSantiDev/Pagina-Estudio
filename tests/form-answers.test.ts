import test from 'node:test';
import assert from 'node:assert/strict';
import { readFormAnswers } from '../src/formAnswers.ts';

test('review follows question order and keeps zero, false and multiline answers', () => {
  const schema = JSON.stringify({ fields: [
    { id: 'count', label: '¿Cuántas cuotas faltan?' },
    { id: 'accepted', label: '¿Aceptas la propuesta?' },
    { id: 'reason', label: 'Explica tu respuesta' },
    { id: 'blank', label: 'Comentario opcional' },
  ] });
  const result = readFormAnswers(schema, JSON.stringify({ reason: 'Primera línea\nSegunda línea', accepted: false, count: 0 }));
  assert.equal(result.error, '');
  assert.deepEqual(result.items.map(({ question, answer, empty }) => ({ question, answer, empty })), [
    { question: '¿Cuántas cuotas faltan?', answer: '0', empty: false },
    { question: '¿Aceptas la propuesta?', answer: 'No', empty: false },
    { question: 'Explica tu respuesta', answer: 'Primera línea\nSegunda línea', empty: false },
    { question: 'Comentario opcional', answer: 'Sin respuesta', empty: true },
  ]);
});

test('legacy answers are retained when their original fields are unavailable', () => {
  const result = readFormAnswers('{broken', '{"campo_1":"Mi respuesta","campo_2":true}');
  assert.equal(result.error, '');
  assert.deepEqual(result.items.map(item => item.answer), ['Mi respuesta', 'Sí']);
  assert.ok(result.items.every(item => item.question.includes('pregunta original no disponible')));
});

test('invalid submissions produce a readable error instead of throwing or displaying JSON', () => {
  for (const raw of ['', '{broken', 'null', '[]', '42']) {
    const result = readFormAnswers('{}', raw);
    assert.ok(result.error);
    assert.deepEqual(result.items, []);
  }
});

test('duplicate or malformed fields do not repeat answers; text stays literal', () => {
  const schema = JSON.stringify({ fields: [null, { id: 'a', label: 'Respuesta' }, { id: 'a', label: 'Repetida' }, { label: 'Sin id' }] });
  const result = readFormAnswers(schema, JSON.stringify({ a: '<b>Texto del estudiante</b>' }));
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].answer, '<b>Texto del estudiante</b>');
});
