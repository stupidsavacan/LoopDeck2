import { describe, expect, it } from 'vitest';
import { advanceSession, buildRangeOptions, createSession, currentQuestion, isSessionComplete, listQuestionCategories, selectSessionQuestions } from '../src/core/sessionEngine';
import type { ModuleInfo, Question } from '../src/core/models';

const module: ModuleInfo = { id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] };
const questions: Question[] = [
  { id: 'q1', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A', category: 'cat-a', number: 1 },
  { id: 'q2', moduleId: 'm', type: 'choice', prompt: 'B?', choices: ['B', 'C'], answer: 'B', category: 'cat-a', number: 2 },
  { id: 'q3', moduleId: 'm', type: 'input', prompt: 'C?', answer: 'C', category: 'cat-b', number: 3 },
  { id: 'q4', moduleId: 'm', type: 'input', prompt: 'D?', answer: 'D', category: 'cat-b', number: 4 },
  { id: 'q5', moduleId: 'm', type: 'input', prompt: 'E?', answer: 'E', number: 5 }
];

describe('session engine', () => {
  it('creates and advances a session', () => {
    const session = createSession(module, questions.slice(0, 2), { shuffle: false, autoNext: true, questionLimit: 'all' });
    expect(currentQuestion(session)?.id).toBe('q1');
    const next = advanceSession(session);
    expect(currentQuestion(next)?.id).toBe('q2');
    expect(isSessionComplete(advanceSession(next))).toBe(true);
  });

  it('filters by range and category before limiting', () => {
    const selected = selectSessionQuestions(questions, {
      shuffle: false,
      autoNext: true,
      questionLimit: 2,
      selectedRange: '2-5',
      selectedCategory: 'cat-b'
    });

    expect(selected.map((question) => question.id)).toEqual(['q3', 'q4']);
  });

  it('supports wrong-only and bookmark-only study selections', () => {
    const wrong = selectSessionQuestions(questions, { shuffle: false, autoNext: true, questionLimit: 'all', filter: 'wrong' }, { wrongQuestionIds: ['q2', 'q4'] });
    const bookmarked = selectSessionQuestions(questions, { shuffle: false, autoNext: true, questionLimit: 'all', selectedRange: 'bookmarked' }, { bookmarkedQuestionIds: ['q1', 'q5'] });

    expect(wrong.map((question) => question.id)).toEqual(['q2', 'q4']);
    expect(bookmarked.map((question) => question.id)).toEqual(['q1', 'q5']);
  });

  it('builds StudyHome-style range and category lists', () => {
    const rangeQuestions = Array.from({ length: 55 }, (_, index) => ({ ...questions[0], id: `q${index + 1}`, number: index + 1 }));

    expect(buildRangeOptions(rangeQuestions).map((option) => option.value)).toEqual(['all', '1-25', '26-50', '51-55']);
    expect(listQuestionCategories(questions)).toEqual(['cat-a', 'cat-b']);
  });
});
