export default function LangToggle({ lang, setLang }) {
  return (
    <div className="inline-flex rounded-full p-1 text-xs bg-slate-100 border border-slate-200" style={{ fontWeight: 600 }}>
      <button
        onClick={() => setLang('en')}
        className={`px-3 py-1 rounded-full transition ${lang === 'en' ? 'bg-sky-500 text-white shadow' : 'text-slate-500'}`}
        style={{ transition: 'background-color 200ms cubic-bezier(0.2,0.7,0.2,1)' }}
      >EN</button>
      <button
        onClick={() => setLang('es')}
        className={`px-3 py-1 rounded-full transition ${lang === 'es' ? 'bg-sky-500 text-white shadow' : 'text-slate-500'}`}
        style={{ transition: 'background-color 200ms cubic-bezier(0.2,0.7,0.2,1)' }}
      >ES</button>
    </div>
  )
}
