/** Short, non-blocking notification at the top of the screen. */
export function showToast(
  parent: HTMLElement,
  message: string,
  tone: 'ok' | 'bad' | 'info' = 'info',
  ms = 3500,
): void {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  parent.appendChild(toast);
  window.setTimeout(() => toast.classList.add('leaving'), ms);
  window.setTimeout(() => toast.remove(), ms + 400);
}
