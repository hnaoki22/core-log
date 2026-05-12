export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center" aria-busy="true" aria-label="読み込み中">
      <div className="max-w-sm w-full mx-auto px-6 animate-pulse">
        <div className="h-7 bg-[#E5DCD0] rounded-lg w-1/2 mx-auto mb-3" />
        <div className="h-4 bg-[#E5DCD0]/70 rounded w-3/4 mx-auto mb-6" />
        <div className="h-12 bg-white rounded-xl border border-[#EFE8DD]" />
      </div>
    </div>
  );
}
