export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F5F0EB]" aria-busy="true" aria-label="読み込み中">
      <div className="max-w-md mx-auto px-5 pt-6 animate-pulse">
        <div className="h-8 bg-[#E5DCD0] rounded-lg w-2/3 mb-2" />
        <div className="h-4 bg-[#E5DCD0]/70 rounded w-1/2 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-[#EFE8DD]" />
          ))}
        </div>
      </div>
    </div>
  );
}
