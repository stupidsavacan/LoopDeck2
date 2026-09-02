import type { AppRoute } from '../app/routes';
import type { FlowPreferences, FocusConfig } from '../flow/models';
import { button, clear, el } from '../ui/dom';
import { renderAppHeader } from '../ui/appHeader';

export function renderMoreScreen(root: HTMLElement, preferences: FlowPreferences, focus: FocusConfig | undefined, navigate: (route: AppRoute) => void, updatePreferences: (preferences: FlowPreferences) => void): void {
  clear(root);
  const screen = el('main', 'flow-screen more-screen');
  screen.append(renderAppHeader({ eyebrow: 'MORE', title: 'その他', subtitle: '教材とアプリの管理' }));
  const list = el('section', 'settings-list');
  const items: Array<[string, string, AppRoute]> = [
    ['集中期間', focus?.enabled ? `${focus.name} · ${focus.targetDate}` : '期限と対象教材を決める', { name: 'focus' }],
    ['教材パック', '取込・書出・バックアップ', { name: 'packs', mode: 'manage' }],
    ['PDFプリント', 'オフライン用の問題用紙を作る', { name: 'pdfWorksheet' }]
  ];
  for (const [title, description, route] of items) {
    const row = button('', 'settings-row');
    const copy = el('div', 'module-copy'); copy.append(el('strong', '', title), el('span', 'muted', description));
    row.append(copy, el('span', 'row-arrow', '→'));
    row.onclick = () => navigate(route);
    list.append(row);
  }
  screen.append(list);

  const appearance = el('section', 'section-block');
  appearance.append(el('div', 'section-heading', '表示'));
  const choices = el('div', 'segmented-control');
  for (const [id, label] of [['system', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']] as const) {
    const choice = button(label, `segment-button${preferences.appearance === id ? ' is-selected' : ''}`);
    choice.onclick = () => updatePreferences({ ...preferences, appearance: id });
    choices.append(choice);
  }
  appearance.append(choices);
  screen.append(appearance);

  const study = el('section', 'section-block');
  study.append(el('div', 'section-heading', '学習の動き'));
  const studyList = el('div', 'settings-list');
  const toggles: Array<[keyof Pick<FlowPreferences, 'autoNextCorrect' | 'autoRevealAfterIdle'>, string, string]> = [
    ['autoNextCorrect', '正解したら自動で次へ', '保存完了後に0.65秒で進みます'],
    ['autoRevealAfterIdle', '10秒間未入力なら答えを表示', '入力・選択・ヒント操作で10秒を数え直します']
  ];
  for (const [key, title, description] of toggles) {
    const label = el('label', 'settings-toggle-row');
    const copy = el('div', 'module-copy'); copy.append(el('strong', '', title), el('span', 'muted', description));
    const input = el('input', 'switch-input') as HTMLInputElement; input.type = 'checkbox'; input.checked = preferences[key];
    input.onchange = () => updatePreferences({ ...preferences, [key]: input.checked });
    label.append(copy, input); studyList.append(label);
  }
  study.append(studyList); screen.append(study);

  const version = button('LoopDeck Flow · reinterpretation v1', 'version-line');
  let taps = 0;
  version.onclick = () => { taps += 1; if (taps >= 7) navigate({ name: 'debugLog' }); };
  screen.append(version);
  root.append(screen);
}
