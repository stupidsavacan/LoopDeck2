export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function button(label: string, className = 'btn'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function toast(message: string): void {
  const node = el('div', 'toast', message);
  document.body.append(node);
  window.setTimeout(() => node.classList.add('show'), 20);
  window.setTimeout(() => node.remove(), 2600);
}
