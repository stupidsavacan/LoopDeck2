import type { ModuleInfo } from '../core/models';
import type { FocusConfig } from '../flow/models';
import { button, clear, el, toast } from '../ui/dom';
import { renderAppHeader } from '../ui/appHeader';

export function renderFocusScreen(root: HTMLElement, modules: ModuleInfo[], current: FocusConfig | undefined, onBack: () => void, onSave: (focus: FocusConfig | undefined) => Promise<void>): void {
  clear(root);
  const screen = el('main', 'flow-screen focus-screen');
  screen.append(renderAppHeader({ eyebrow: 'FOCUS', title: '集中期間', subtitle: 'Flowの対象だけを絞る。教材データは変えません。', onBack }));
  const form = el('form', 'surface focus-form') as HTMLFormElement;
  const name = el('input', 'text-field') as HTMLInputElement;
  name.required = true; name.value = current?.name ?? '次のテスト'; name.placeholder = '名前';
  const date = el('input', 'text-field') as HTMLInputElement;
  date.type = 'date'; date.required = true; date.value = current?.targetDate ?? new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const minutes = el('select', 'text-field') as HTMLSelectElement;
  for (const value of [5, 10, 20] as const) { const option = el('option', '', `1日 ${value}分`) as HTMLOptionElement; option.value = String(value); option.selected = (current?.dailyMinutes ?? 5) === value; minutes.append(option); }
  const moduleList = el('div', 'focus-modules');
  const checked = new Set(current?.moduleIds ?? []);
  for (const module of modules) {
    const label = el('label', 'check-row');
    const input = el('input') as HTMLInputElement; input.type = 'checkbox'; input.value = module.id; input.checked = checked.has(module.id);
    label.append(input, el('span', '', module.title), el('small', 'muted', module.subject)); moduleList.append(label);
  }
  const save = button('このFocusを使う', 'btn primary'); save.type = 'submit';
  const disable = button('Focusを解除', 'btn ghost danger');
  disable.onclick = async () => { await onSave(undefined); toast('Focusを解除しました。'); onBack(); };
  form.append(el('label', 'field-stack', '名前'), name, el('label', 'field-stack', '目標日'), date, el('label', 'field-stack', '1日の時間'), minutes, el('p', 'section-heading', '対象教材'), moduleList, save, disable);
  form.onsubmit = async (event) => {
    event.preventDefault();
    const moduleIds = [...moduleList.querySelectorAll<HTMLInputElement>('input:checked')].map((input) => input.value);
    if (!moduleIds.length) { toast('対象教材を1つ以上選んでください。'); return; }
    const now = new Date().toISOString();
    await onSave({ focusId: current?.focusId ?? `focus-${crypto.randomUUID()}`, name: name.value.trim(), enabled: true, targetDate: date.value, dailyMinutes: Number(minutes.value) as 5 | 10 | 20, moduleIds, createdAt: current?.createdAt ?? now, updatedAt: now });
    toast('Focusを保存しました。'); onBack();
  };
  screen.append(form);
  root.append(screen);
}
