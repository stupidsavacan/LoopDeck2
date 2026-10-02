import type { ModuleInfo, StudySettings } from './models';

export function runtimeSettings(settings: StudySettings): StudySettings {
  return {
    ...settings,
    shuffle: false,
    questionLimit: 'all',
    selectedRange: 'all',
    selectedCategory: 'all',
    filter: 'all'
  };
}

export function defaultStudySettings(module: ModuleInfo): StudySettings {
  return {
    shuffle: true,
    autoNext: true,
    autoRevealAfterIdle: false,
    questionLimit: 'all',
    selectedRange: 'all',
    selectedCategory: 'all',
    filter: 'all',
    answerFormat: module.preferredAnswerFormat ?? 'auto',
    questionMode: 'as_stored',
    showExample: true,
    showNumber: true,
    showCategory: true
  };
}

