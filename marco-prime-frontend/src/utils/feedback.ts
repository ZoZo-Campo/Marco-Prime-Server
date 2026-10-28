/** Vibre brièvement au tap (supporté par le WebView Android). */
export function haptic(ms = 15): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* navigateur sans support Vibration */
  }
}

/**
 * Effet onde au point exact du tap. L'élément déclencheur doit être
 * positionné en `relative` (et idéalement `overflow-hidden`).
 */
export function ripple(
  event: MouseEvent | TouchEvent,
  color = "currentColor",
): void {
  const target = event.currentTarget as HTMLElement | null;
  if (!target || typeof target.getBoundingClientRect !== "function") return;

  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const clientX = "clientX" in event ? event.clientX : rect.left + rect.width / 2;
  const clientY = "clientY" in event ? event.clientY : rect.top + rect.height / 2;

  const span = document.createElement("span");
  span.className = "ripple";
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.style.left = `${clientX - rect.left - size / 2}px`;
  span.style.top = `${clientY - rect.top - size / 2}px`;
  span.style.color = color;

  target.appendChild(span);
  window.setTimeout(() => span.remove(), 520);
}
