import { button, el } from './dom';

export interface AppHeaderOptions {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  action?: { label: string; onClick: () => void };
}

export function renderAppHeader(options: AppHeaderOptions): HTMLElement {
  const header = el('header', 'flow-header');
  const top = el('div', 'flow-header-row');
  if (options.onBack) {
    const back = button('←', 'icon-button');
    back.setAttribute('aria-label', options.backLabel ?? '戻る');
    back.onclick = options.onBack;
    top.append(back);
  }
  const heading = el('div', 'flow-heading');
  if (options.eyebrow) heading.append(el('p', 'flow-eyebrow', options.eyebrow));
  heading.append(el('h1', '', options.title));
  if (options.subtitle) heading.append(el('p', 'flow-subtitle', options.subtitle));
  top.append(heading);
  if (options.action) {
    const action = button(options.action.label, 'btn secondary small');
    action.onclick = options.action.onClick;
    top.append(action);
  }
  header.append(top);
  return header;
}
