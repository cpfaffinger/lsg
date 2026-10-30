type Child = Node | string | number | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
  style?: Partial<CSSStyleDeclaration>;
}

/** Tiny DOM builder: h('button', { class: 'btn', on: { click } }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.attrs) for (const [key, value] of Object.entries(props.attrs)) element.setAttribute(key, value);
  if (props.style) Object.assign(element.style, props.style);
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      if (handler) element.addEventListener(type, handler);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child instanceof Node ? child : String(child));
  }
  return element;
}

export function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const el = h('button', { class: className, on: { click: () => onClick() } }, label);
  el.type = 'button';
  return el;
}

export function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}
