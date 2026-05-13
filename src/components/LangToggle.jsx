export default function LangToggle({ lang, setLang, variant = 'light' }) {
  const dark = variant === 'dark'
  return (
    <div className={`inline-flex rounded-full p-1 text-sm font-bold ${dark ? 'bg-white/15 text-white' : 'bg-white/80 border border-slate-200 text-slate-600'}`}>
      <button
        onClick={() => setLang('en')}
        className={`px-4 py-1.5 rounded-full transition ${lang === 'en' ? (dark ? 'bg-white text-brand-700' : 'bg-brand-600 text-white shadow') : ''}`}
      >EN</button>
      <button
        onClick={() => setLang('es')}
        className={`px-4 py-1.5 rounded-full transition ${lang === 'es' ? (dark ? 'bg-white text-brand-700' : 'bg-brand-600 text-white shadow') : ''}`}
      >ES</button>
    </div>
  )
}
