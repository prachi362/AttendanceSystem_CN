// Simple centered-logo header
export default function KioskHeader() {
  return (
    <header className="shrink-0 px-6 pt-5 pb-4 flex items-center justify-center border-b border-white/5">
      <img src="/logo.png" alt="Conquer Nation" className="h-32 sm:h-40 object-contain drop-shadow-[0_2px_8px_rgba(92,200,240,0.35)]" />
    </header>
  )
}
