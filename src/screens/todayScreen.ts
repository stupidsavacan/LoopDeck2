import type { TodaySnapshot, StudyPlan } from '../flow/models';
import type { AppRoute } from '../app/routes';
import { button, clear, el } from '../ui/dom';
import { renderAppHeader } from '../ui/appHeader';

const reasonLabel = { due: '復習予定', weak: '苦手', new: '新しい問題', continuation: '前回の続き' } as const;

export interface TodayScreenActions {
  navigate(route: AppRoute): void;
  startPlan(plan: StudyPlan): void;
  resume(sessionId: string): void;
  changeBudget(minutes: 5 | 10 | 20): void;
}

export function renderTodayScreen(root: HTMLElement, snapshot: TodaySnapshot, actions: TodayScreenActions): void {
  clear(root);
  const screen = el('main', 'flow-screen today-screen');
  const day = new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
  screen.append(renderAppHeader({ eyebrow: day, title: '今日のFlow', subtitle: snapshot.activeFocus ? `${snapshot.activeFocus.name}に集中` : '迷う前に、短く始めよう' }));

  const resume = snapshot.resumeSession ?? snapshot.legacyResumeSession;
  if (resume) {
    const card = el('section', 'surface resume-surface');
    const left = el('div', 'stack compact');
    const remaining = Math.max(0, resume.entries.length - resume.index);
    left.append(el('p', 'flow-eyebrow', 'CONTINUE'), el('h2', '', '前回の続き'), el('p', 'muted', `残り${remaining}問・安全に保存されています`));
    const resumeButton = button('続ける', 'btn secondary');
    resumeButton.onclick = () => actions.resume(resume.sessionId);
    card.append(left, resumeButton);
    screen.append(card);
  }

  const plan = snapshot.previewPlan;
  const hero = el('section', 'flow-hero');
  const kicker = el('div', 'flow-kicker');
  kicker.append(el('span', 'pulse-dot'), el('span', '', plan.queue.length ? 'READY' : 'ALL CLEAR'));
  hero.append(kicker, el('h2', '', plan.queue.length ? `今やる${plan.budgetMinutes}分` : '今日は整っています'));
  if (plan.queue.length) {
    hero.append(el('p', 'hero-number', `${plan.queue.length}`), el('p', 'hero-unit', 'questions'));
    const breakdown = el('div', 'reason-row');
    for (const reason of ['due', 'weak', 'new'] as const) {
      const count = plan.primaryReasonCounts[reason];
      if (count) breakdown.append(el('span', `reason-chip reason-${reason}`, `${reasonLabel[reason]} ${count}`));
    }
    hero.append(breakdown);
    const start = button(`今やる${plan.budgetMinutes}分`, 'btn primary hero-action');
    start.onclick = () => actions.startPlan(plan);
    hero.append(start);

    const detail = el('details', 'plan-details');
    detail.append(el('summary', '', 'このFlowの内訳'));
    const list = el('ol', 'plan-preview-list');
    for (const entry of plan.queue.slice(0, 8)) list.append(el('li', '', `${reasonLabel[entry.primaryReason]} · ${entry.moduleId}`));
    if (plan.queue.length > 8) list.append(el('li', 'muted', `ほか${plan.queue.length - 8}問`));
    detail.append(list);
    hero.append(detail);
  } else {
    hero.append(el('p', '', snapshot.hasAnyQuestions ? '復習予定・苦手・未回答の候補はありません。教材から自由に学習できます。' : '教材を取り込むと、ここに次の学習が現れます。'));
    const secondary = button(snapshot.hasAnyQuestions ? '教材を見る' : '教材を取り込む', 'btn secondary hero-action');
    secondary.onclick = () => actions.navigate(snapshot.hasAnyQuestions ? { name: 'library' } : { name: 'packs', mode: 'import' });
    hero.append(secondary);
  }
  screen.append(hero);

  const budget = el('section', 'section-block');
  budget.append(el('div', 'section-heading', '時間を選ぶ'));
  const choices = el('div', 'segmented-control');
  for (const minutes of [5, 10, 20] as const) {
    const choice = button(`${minutes}分`, `segment-button${plan.budgetMinutes === minutes ? ' is-selected' : ''}`);
    choice.setAttribute('aria-pressed', String(plan.budgetMinutes === minutes));
    choice.onclick = () => actions.changeBudget(minutes);
    choices.append(choice);
  }
  budget.append(choices);
  screen.append(budget);

  if (snapshot.attentionModules.length) {
    const attention = el('section', 'section-block');
    attention.append(el('div', 'section-heading', '注意が必要'));
    const list = el('div', 'module-list');
    for (const item of snapshot.attentionModules) {
      const row = button('', 'module-row');
      const copy = el('div', 'module-copy');
      copy.append(el('strong', '', item.module.title), el('span', 'muted', `${item.attentionCount}問を確認 · 最近 ${Math.round(item.recentAccuracy * 100)}%`));
      row.append(el('span', 'module-mark'), copy, el('span', 'row-arrow', '→'));
      row.onclick = () => actions.navigate({ name: 'module', moduleId: item.module.id });
      list.append(row);
    }
    attention.append(list);
    screen.append(attention);
  }
  root.append(screen);
}
