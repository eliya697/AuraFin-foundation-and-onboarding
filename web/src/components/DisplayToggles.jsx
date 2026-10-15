import { Eye, EyeOff, Monitor, Moon, Sun } from 'lucide-react';
import { nextPreference, useTheme } from '../state/theme.js';
import { usePrivacy } from '../state/privacy.js';

const THEME_OPTIONS = [
  { value: 'system', label: 'אוטומטי', icon: Monitor },
  { value: 'light', label: 'בהיר', icon: Sun },
  { value: 'dark', label: 'כהה', icon: Moon },
];
const optionFor = (value) => THEME_OPTIONS.find((o) => o.value === value) ?? THEME_OPTIONS[0];

const iconButton =
  'grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-navy-soft transition-colors hover:bg-mist hover:text-navy active:bg-mist';

/** Top-bar button: cycles system → light → dark. */
export function ThemeCycleButton() {
  const { preference, setPreference } = useTheme();
  const current = optionFor(preference);
  const next = optionFor(nextPreference(preference));
  const Icon = current.icon;
  return (
    <button
      type="button"
      onClick={() => setPreference(next.value)}
      className={iconButton}
      aria-label={`ערכת צבעים: ${current.label}. לחיצה תעביר ל${next.label}`}
      title={`ערכת צבעים: ${current.label}`}
    >
      <Icon size={20} />
    </button>
  );
}

/** Top-bar Privacy Eye: hides / shows every amount. */
export function PrivacyButton() {
  const { hidden, toggle } = usePrivacy();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? 'הצגת סכומים' : 'הסתרת סכומים'}
      title={hidden ? 'הצגת סכומים' : 'הסתרת סכומים'}
      className={`${iconButton} ${hidden ? 'bg-turquoise/10 text-turquoise-dark' : ''}`}
    >
      <Icon size={20} />
    </button>
  );
}

/** Account screen: explicit three-way theme choice. */
export function ThemeSegmented() {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="ערכת צבעים" className="grid grid-cols-3 gap-1 rounded-2xl bg-mist p-1">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPreference(value)}
            className={`flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-bold transition-colors ${
              selected ? 'bg-surface text-turquoise-dark shadow-sm' : 'text-navy-soft hover:text-navy'
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        );
      })}
    </div>
  );
}
