export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F5F0EB]" aria-busy="true" aria-label="読み込み中">
      <div className="max-w-4xl mx-auto px-5 pt-6 animate-pulse">
        <div className="h-9 bg-[#E5DCD0] rounded-lg w-1/3 mb-2" />
        <div className="h-4 bg-[#E5DCD0]/70 rounded w-1/4 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl border border-[#EFE8DD]" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-white rounded-xl border border-[#EFE8DD]" />
          ))}
        </div>
      </div>
    </div>
  );
}
