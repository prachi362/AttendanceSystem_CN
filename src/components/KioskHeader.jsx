// Simple centered-logo header
export default function KioskHeader() {
  return (
    <header className="shrink-0 px-6 pt-5 pb-4 flex items-center justify-center bg-white">
      <img src="/logo.png" alt="Conquer Nation" className="h-14 sm:h-16 object-contain" />
    </header>
  )
}
