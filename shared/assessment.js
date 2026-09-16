export function questionIds(schema, rawAnswers) {
  const definition = JSON.parse(schema || '{}');
  const answers = JSON.parse(rawAnswers);
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Respuestas no válidas.');
  const fields = Array.isArray(definition?.fields) ? definition.fields : [];
  return [...new Set([
    ...fields.filter(field => field && typeof field.id === 'string').map(field => field.id),
    ...Object.keys(answers),
  ])];
}

export function reviewSummary(ids, marks) {
  const reviewed = ids.filter(id => Object.prototype.hasOwnProperty.call(marks, id) && typeof marks[id] === 'boolean').length;
  const correct = ids.filter(id => Object.prototype.hasOwnProperty.call(marks, id) && marks[id] === true).length;
  const complete = ids.length > 0 && reviewed === ids.length;
  const percentage = ids.length ? Math.round(correct / ids.length * 100) : 0;
  return { total: ids.length, reviewed, correct, complete, percentage, score: complete ? percentage : null };
}

export function courseResult(lessons) {
  const graded = lessons.filter(lesson => lesson.evaluation_mode !== 'informative');
  const completedLessons = lessons.filter(lesson => Boolean(lesson.completed) && (lesson.evaluation_mode === 'informative' || (typeof lesson.score === 'number' && lesson.score >= 70))).length;
  const allCompleted = lessons.length > 0 && completedLessons === lessons.length;
  return {
    totalLessons: lessons.length,
    completedLessons,
    allCompleted,
    completionPercentage: lessons.length ? Math.floor(completedLessons / lessons.length * 100) : 0,
    gradedLessons: graded.length,
    finalScore: allCompleted && graded.length ? Math.round(graded.reduce((sum, lesson) => sum + lesson.score, 0) / graded.length * 100) / 100 : null,
  };
}
