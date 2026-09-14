import { useEffect, useRef } from "react";

export type FocusMove = "left" | "right" | "up" | "down" | "first" | "last";

export type ShortcutHandlers = {
  onNewTask: () => void;
  onEditFocused: () => void;
  onDeleteFocused: () => void;
  onFocusFilter: () => void;
  onSetView: (view: "board" | "graph") => void;
  onEscape: () => void;
  onMoveFocus: (move: FocusMove) => void;
  onSelectFocused: () => void;
  /** Lane index 0–3, matching COLUMNS order. */
  onMoveToLane: (index: number) => void;
  onMoveLaneRelative: (delta: -1 | 1) => void;
  onToggleHelp: () => void;
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

/**
 * Board keyboard shortcuts. See _docs/specs.md §10.2.
 *
 * `blocked` is true while a dialog owns the screen — Radix traps focus there, and the board's
 * shortcuts must not fire underneath it. Typing into any field suppresses them too, so `n` in a
 * title field types an "n".
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, blocked: boolean) {
  // Callers pass a fresh object every render; keeping it in a ref means the listener is bound
  // once rather than torn down and rebuilt on each keystroke elsewhere in the tree.
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const handlers = latest.current;

      // Nothing fires while a dialog owns the screen — including `?`, which would otherwise
      // stack the shortcut list on top of the dialog you are already in. Dialogs close on Escape.
      if (blocked) return;

      if (event.key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        handlers.onToggleHelp();
        return;
      }

      if (event.key === "Escape") {
        handlers.onEscape();
        return;
      }

      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "n":
          event.preventDefault();
          handlers.onNewTask();
          break;
        case "e":
          event.preventDefault();
          handlers.onEditFocused();
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          handlers.onDeleteFocused();
          break;
        case "/":
          event.preventDefault();
          handlers.onFocusFilter();
          break;
        case "b":
          event.preventDefault();
          handlers.onSetView("board");
          break;
        case "g":
          event.preventDefault();
          handlers.onSetView("graph");
          break;
        case "Enter":
        case " ":
          // The focused card handles these itself; only act when focus is elsewhere.
          if (!(event.target instanceof HTMLElement) || !event.target.dataset["taskId"]) {
            event.preventDefault();
            handlers.onSelectFocused();
          }
          break;
        case "ArrowLeft":
        case "h":
          event.preventDefault();
          if (event.shiftKey) handlers.onMoveLaneRelative(-1);
          else handlers.onMoveFocus("left");
          break;
        case "ArrowRight":
        case "l":
          event.preventDefault();
          if (event.shiftKey) handlers.onMoveLaneRelative(1);
          else handlers.onMoveFocus("right");
          break;
        case "ArrowUp":
        case "k":
          event.preventDefault();
          handlers.onMoveFocus("up");
          break;
        case "ArrowDown":
        case "j":
          event.preventDefault();
          handlers.onMoveFocus("down");
          break;
        case "Home":
          event.preventDefault();
          handlers.onMoveFocus("first");
          break;
        case "End":
          event.preventDefault();
          handlers.onMoveFocus("last");
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          event.preventDefault();
          handlers.onMoveToLane(Number(event.key) - 1);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [blocked]);
}
