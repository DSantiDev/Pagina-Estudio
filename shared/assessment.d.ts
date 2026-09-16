export type QuestionGrades = Record<string, boolean>;
export type ReviewSummary = { total: number; reviewed: number; correct: number; complete: boolean; percentage: number; score: number | null };
export type CourseResult = { totalLessons: number; completedLessons: number; allCompleted: boolean; completionPercentage: number; gradedLessons: number; finalScore: number | null };
export function questionIds(schema: string | undefined, rawAnswers: string): string[];
export function reviewSummary(ids: string[], marks: QuestionGrades): ReviewSummary;
export function courseResult(lessons: Array<{ evaluation_mode?: string; completed?: number; score?: number | null }>): CourseResult;
