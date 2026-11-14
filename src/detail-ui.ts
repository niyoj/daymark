/** Keep keyboard position when a subscribed checklist replaces its children. */
export function restoreFocus(root: HTMLElement, key: string | null | undefined) {
    if (!key) return;
    const target = Array.from(root.querySelectorAll?.<HTMLElement>('[data-focus-key]') ?? [])
        .find(element => element.getAttribute('data-focus-key') === key);
    target?.focus({ preventScroll: true });
}
export function focusedKey(root: HTMLElement) {
    const active = root.ownerDocument.activeElement;
    return active && root.contains?.(active) ? active.getAttribute('data-focus-key') : undefined;
}
export function returnToCell(root: HTMLElement, key: string) {
    const target = Array.from(root.querySelectorAll?.<HTMLElement>('[data-detail-key]') ?? [])
        .find(element => element.getAttribute('data-detail-key') === key);
    target?.focus({ preventScroll: true });
}
export type CellSelection =
    | { kind: 'weekday'; routineId: string; weekday: number; start: string; end: string }
    | { kind: 'weekly'; routineId: string; weekStart: string; start: string; end: string }
    | { kind: 'calendar'; date: string };
export type OpenCellDetails = (selection: CellSelection, returnFocus: () => void) => void;
