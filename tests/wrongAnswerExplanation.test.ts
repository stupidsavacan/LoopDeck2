import { describe, expect, it } from 'vitest';
import type { Question } from '../src/core/models';
import {
  buildWrongAnswerExplanation,
  buildWrongAnswerFeedback,
  buildWrongAnswerLookupIndex,
  buildWrongAnswerLookupIndexForStudyMode,
  collectAnswerTexts,
  findQuestionByAnswer,
  normalizeWrongAnswerLookup
} from '../src/core/wrongAnswerExplanation';

const mitochondria = '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2';
const chloroplast = '\u8449\u7dd1\u4f53';
const pacific = '\u592a\u5e73\u6d0b';

const current: Question = {
  id: 'q-current',
  moduleId: 'biology',
  type: 'input',
  prompt: '\u547c\u5438\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: mitochondria,
  explanation: '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2\u306f\u547c\u5438\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const otherSameModule: Question = {
  id: 'q-other',
  moduleId: 'biology',
  type: 'input',
  prompt: '\u5149\u5408\u6210\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: chloroplast,
  acceptedAnswers: ['\u8449 \u7dd1 \u4f53'],
  explanation: '\u8449\u7dd1\u4f53\u306f\u5149\u5408\u6210\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const otherModule: Question = {
  id: 'q-geography',
  moduleId: 'geography',
  type: 'input',
  prompt: '\u4e16\u754c\u6700\u5927\u306e\u6d77\u6d0b',
  answer: pacific,
  acceptableAnswers: ['\u5927\u897f\u6d0b']
};

describe('wrong answer feedback lookup', () => {
  it('normalizes punctuation, spaces, width, and case for exact lookup', () => {
    expect(normalizeWrongAnswerLookup(' A = B ')).toBe(normalizeWrongAnswerLookup('a b'));
    expect(normalizeWrongAnswerLookup('\u8449 \u7dd1\u4f53\uff01')).toBe(normalizeWrongAnswerLookup(chloroplast));
  });

  it('collects answer, acceptableAnswers, acceptedAnswers, sides, and multi-select choices', () => {
    const multi: Question = {
      id: 'multi',
      moduleId: 'm',
      type: 'multi_select',
      prompt: 'select',
      choices: ['a', 'b'],
      correctChoices: ['a', 'b'],
      sides: {
        front: { label: 'front', text: 'front text', acceptableAnswers: ['front alt'] },
        back: { label: 'back', text: 'back text', acceptableAnswers: ['back alt'] }
      }
    };

    expect(collectAnswerTexts(multi)).toEqual(['front text', 'front alt', 'back text', 'back alt', 'a', 'b']);
  });

  it('finds another same-module question by answer before other modules', () => {
    const hit = findQuestionByAnswer(chloroplast, current, [current, otherModule, otherSameModule]);

    expect(hit?.question.id).toBe('q-other');
    expect(hit?.matchedAnswer).toBe(chloroplast);
    expect(hit?.matchRole).toBe('primary_answer');
  });

  it('distinguishes an acceptable answer from the primary answer', () => {
    const feedback = buildWrongAnswerFeedback('choice', '\u5927\u897f\u6d0b', current, [current, otherModule]);

    expect(feedback).toMatchObject({
      matchKind: 'lookup',
      matchedQuestionId: 'q-geography',
      matchRole: 'acceptable_answer'
    });
    expect(feedback?.pair).toMatchObject({
      front: { text: '\u4e16\u754c\u6700\u5927\u306e\u6d77\u6d0b' },
      back: { text: pacific }
    });
  });

  it('retains multiple roles from one question without pretending they are different questions', () => {
    const feedback = buildWrongAnswerFeedback('input', chloroplast, current, [current, otherSameModule]);

    expect(feedback).toMatchObject({
      matchKind: 'lookup',
      matchedQuestionId: 'q-other',
      matchRole: 'primary_answer'
    });
    expect(feedback?.alternatives?.map((item) => item.matchRole)).toEqual(['primary_answer', 'accepted_answer']);
    expect(feedback?.explanation).toContain('\u5149\u5408\u6210');
  });

  it('uses an exact generated-choice origin instead of reverse-looking-up duplicate text', () => {
    const first: Question = {
      id: 'q-pollen-first',
      moduleId: 'biology',
      type: 'input',
      prompt: 'pollen',
      answer: '\u82b1\u7c89'
    };
    const second: Question = {
      id: 'q-pollen-second',
      moduleId: 'biology',
      type: 'input',
      prompt: 'airborne particles',
      answer: '\u82b1\u7c89'
    };
    const feedback = buildWrongAnswerFeedback('choice', '\u82b1\u7c89', current, [current, first, second], undefined, {
      questionId: second.id,
      moduleId: second.moduleId,
      studyMode: 'as_stored'
    });

    expect(feedback).toMatchObject({
      matchKind: 'exact_origin',
      matchedQuestionId: 'q-pollen-second',
      matchRole: 'primary_answer'
    });
    expect(feedback?.pair?.front.text).toBe('airborne particles');
  });

  it('keeps fallback ambiguity when the same answer belongs to different questions', () => {
    const duplicate: Question = {
      id: 'q-duplicate',
      moduleId: 'biology',
      type: 'input',
      prompt: '\u5225\u306e\u554f\u984c',
      answer: chloroplast
    };
    const feedback = buildWrongAnswerFeedback('input', chloroplast, current, [current, otherSameModule, duplicate]);

    expect(feedback?.matchKind).toBe('ambiguous');
    expect(new Set(feedback?.alternatives?.map((item) => item.questionId))).toEqual(new Set(['q-other', 'q-duplicate']));
  });

  it('uses explicit side provenance for reverse-study origins', () => {
    const sided: Question = {
      id: 'q-sided',
      moduleId: 'vocab',
      type: 'input',
      prompt: '\u3042\u306f\u308c',
      answer: '\u3057\u307f\u3058\u307f\u3068\u8da3\u6df1\u3044',
      sides: {
        front: { label: '\u53e4\u8a9e', text: '\u3042\u306f\u308c', acceptableAnswers: ['\u3042\u306f\u308c\u306a\u308a'] },
        back: { label: '\u610f\u5473', text: '\u3057\u307f\u3058\u307f\u3068\u8da3\u6df1\u3044' }
      },
      supportedStudyModes: ['front_to_back', 'back_to_front']
    };
    const feedback = buildWrongAnswerFeedback('choice', '\u3042\u306f\u308c\u306a\u308a', current, [current, sided], undefined, {
      questionId: sided.id,
      moduleId: sided.moduleId,
      studyMode: 'back_to_front'
    });

    expect(feedback).toMatchObject({ matchKind: 'exact_origin', matchRole: 'front_alias' });
    expect(feedback?.pair?.front.label).toBe('\u53e4\u8a9e');
  });

  it('indexes auto-reversed answers for the active study direction', () => {
    const pollution: Question = {
      id: 'q-pollution',
      moduleId: 'leap-dedicated-0701-0800',
      type: 'input',
      prompt: 'pollution',
      answer: '\u6c5a\u67d3'
    };
    const tropical: Question = {
      id: 'q-tropical',
      moduleId: 'leap-dedicated-0701-0800',
      type: 'input',
      prompt: 'tropical',
      answer: '\u71b1\u5e2f\u306e'
    };
    const presentedCurrent: Question = {
      ...pollution,
      prompt: '\u6c5a\u67d3',
      answer: 'pollution',
      acceptableAnswers: ['pollution'],
      acceptedAnswers: ['pollution'],
      activeStudyMode: 'back_to_front'
    };
    const pool = [pollution, tropical];
    const index = buildWrongAnswerLookupIndexForStudyMode(pool, 'back_to_front');
    const feedback = buildWrongAnswerFeedback('input', 'tropical', presentedCurrent, pool, index);

    expect(feedback).toMatchObject({
      found: true,
      matchKind: 'lookup',
      matchedQuestionId: 'q-tropical'
    });
    expect(feedback?.pair?.front).toMatchObject({ label: '\u82f1\u8a9e', text: 'tropical' });
    expect(feedback?.pair?.back).toMatchObject({ label: '\u65e5\u672c\u8a9e', text: '\u71b1\u5e2f\u306e' });

    const mixed = buildWrongAnswerLookupIndexForStudyMode([tropical], 'mixed');
    expect(mixed.has('tropical')).toBe(true);
    expect(mixed.has('\u71b1\u5e2f\u306e')).toBe(true);
  });
  it('reuses a prebuilt answer index while preserving same-module priority', () => {
    const pool = [current, otherModule, otherSameModule];
    const index = buildWrongAnswerLookupIndex(pool);
    const hit = findQuestionByAnswer(chloroplast, current, pool, index);

    expect(hit?.question.id).toBe('q-other');
    expect(buildWrongAnswerExplanation('choice', '\u5927\u897f\u6d0b', current, pool, index)?.matchedQuestionId).toBe('q-geography');
  });

  it('returns a not-found feedback when no registered answer matches', () => {
    const feedback = buildWrongAnswerFeedback('input', '\u5168\u304f\u9055\u3046\u7b54\u3048', current, [current, otherSameModule]);

    expect(feedback).toMatchObject({ source: 'input', found: false, matchKind: 'not_found' });
  });
});
