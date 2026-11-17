type Child = Node | string | number | null | false;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== false)
      element.setAttribute(key, value === true ? '' : String(value));
  }
  element.append(
    ...children
      .filter(
        (child): child is Node | string | number =>
          child !== null && child !== false,
      )
      .map((child) => (typeof child === 'number' ? String(child) : child)),
  );
  return element;
}
const paths = {
  reset: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
  up: 'm6 14 6-6 6 6',
  down: 'm6 10 6 6 6-6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  play: 'm8 4 12 8-12 8V4Z',
  pause: 'M8 4v16M16 4v16',
  sliders: 'M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6',
};
export type IconName = keyof typeof paths;
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}
export function button(
  label: string,
  onClick: () => void,
  options: { icon?: IconName; class?: string; iconOnly?: boolean } = {},
): HTMLButtonElement {
  const item = el(
    'button',
    {
      type: 'button',
      class: options.class ?? 'button',
      ...(options.iconOnly ? { 'aria-label': label, title: label } : {}),
    },
    options.icon ? icon(options.icon) : null,
    options.iconOnly ? null : label,
  );
  item.addEventListener('click', onClick);
  return item;
}
export function slider(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (value: number) => void,
  format = (n: number) => n.toFixed(2),
) {
  const output = el('output', { for: id, class: 'value' }, format(value));
  const input = el('input', {
    id,
    type: 'range',
    'aria-label': label,
    min,
    max,
    step,
    value,
  });
  const paint = () =>
    input.style.setProperty(
      '--range',
      `${((Number(input.value) - min) / (max - min)) * 100}%`,
    );
  paint();
  input.addEventListener('input', () => {
    output.value = format(Number(input.value));
    paint();
    onInput(Number(input.value));
  });
  return {
    element: el(
      'div',
      { class: 'field' },
      el(
        'div',
        { class: 'field-label' },
        el('label', { for: id }, label),
        output,
      ),
      input,
    ),
    input,
    set: (n: number) => {
      input.value = String(n);
      output.value = format(n);
      paint();
    },
  };
}
export function toggle(
  id: string,
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void,
) {
  const input = el('input', { id, type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el(
    'label',
    { class: 'toggle', for: id },
    input,
    el('span', { class: 'toggle-track', 'aria-hidden': 'true' }),
    el('span', {}, label),
  );
}
