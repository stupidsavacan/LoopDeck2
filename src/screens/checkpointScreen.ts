import type { FlowSessionRecord } from '../flow/models';
import { button, el } from '../ui/dom';

export function renderCheckpointScreen(session: FlowSessionRecord, onContinue: () => void, onStop: () => void): HTMLElement {
  const wrap = el('main', 'player-screen checkpoint-screen');
  const complete = Math.min(session.index, session.entries.length);
  const percent = session.entries.length ? Math.round(complete / session.entries.length * 100) : 100;
  const card = el('section', 'checkpoint-card');
  card.append(el('p', 'flow-eyebrow', 'CHECKPOINT'), el('div', 'checkpoint-number', `${complete}`), el('h1', '', 'ひと区切りです'), el('p', 'muted', `全体の${percent}% · 残り${Math.max(0, session.entries.length - complete)}問`));
  const continueButton = button('次の5問へ', 'btn primary'); continueButton.onclick = onContinue;
  const stop = button('今日はここまで', 'btn ghost'); stop.onclick = onStop;
  card.append(continueButton, stop);
  wrap.append(card);
  return wrap;
}
