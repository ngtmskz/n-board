import { Globe } from 'lucide-react';
import { LANGS, setLang, useLang } from '../i18n';

/** 表示言語の切り替え（日本語・English）。選んだ言語はブラウザに覚えておく。 */
export function LanguageSwitch({ label }: { label?: string }) {
  const lang = useLang((s) => s.lang);
  return (
    <div className="language-switch" role="radiogroup" aria-label={label ?? 'Language'}>
      <Globe size={15} aria-hidden="true" />
      {label && <span className="language-switch-label">{label}</span>}
      <span className="language-switch-options">
        {LANGS.map((l) => (
          <button
            key={l.lang}
            role="radio"
            aria-checked={lang === l.lang}
            className={lang === l.lang ? 'on' : ''}
            onClick={() => setLang(l.lang)}
          >
            {l.label}
          </button>
        ))}
      </span>
    </div>
  );
}
