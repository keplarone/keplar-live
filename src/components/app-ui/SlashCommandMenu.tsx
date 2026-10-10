"use client";
/**
 * Autocomplete list for slash commands: the image commands (/BTS, /Adcreative, …) while Create image is on, and the chat's own
 * commands (/slides, /quiz, /approvals, …) otherwise.
 * Keyboard: ArrowUp/Down, Enter/Tab to pick, Escape to dismiss. Mobile-friendly tap targets.
 */
import s from "./SlashCommandMenu.module.css";

type MenuCommand = { id: string; slash: string; label: string; summary: string; prefersReference?: boolean };

type Props<T extends MenuCommand> = {
  id: string;
  label?: string;
  items: T[];
  active: number;
  onActive: (i: number) => void;
  onPick: (cmd: T) => void;
};

export function SlashCommandMenu<T extends MenuCommand>({ id, label = "Image slash commands", items, active, onActive, onPick }: Props<T>) {
  if (!items.length) return null;
  return (
    <ul
      id={id}
      className={s.menu}
      role="listbox"
      aria-label={label}
      data-testid="slash-command-menu"
    >
      {items.map((cmd, i) => {
        const optId = `${id}-opt-${cmd.id}`;
        const isActive = i === active;
        return (
          <li key={cmd.id} role="presentation">
            <button
              type="button"
              id={optId}
              role="option"
              aria-selected={isActive}
              className={s.item}
              data-active={isActive || undefined}
              data-testid={`slash-cmd-${cmd.id}`}
              onMouseEnter={() => onActive(i)}
              onMouseDown={(e) => {
                // Keep focus in the textarea; click still picks.
                e.preventDefault();
                onPick(cmd);
              }}
            >
              <span className={s.slash}>{cmd.slash}</span>
              <span className={s.meta}>
                <span className={s.label}>{cmd.label}</span>
                <span className={s.summary}>{cmd.summary}</span>
              </span>
              {cmd.prefersReference ? <span className={s.badge}>Ref</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
