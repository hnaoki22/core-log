// Suspense fallback for participant routes. Renders instantly during
// navigation while the page's data + JS bundle load, so users see a layout
// shape rather than a blank screen.
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24" aria-busy="true" aria-label="読み込み中">
      <div className="max-w-md mx-auto px-5 pt-6 animate-pulse">
        {/* Header skeleton */}
        <div className="h-8 bg-[#E5DCD0] rounded-lg w-1/2 mb-2" />
        <div className="h-4 bg-[#E5DCD0]/70 rounded w-3/4 mb-6" />
        {/* Card skeletons */}
        <div className="space-y-3">
          <div className="h-24 bg-white rounded-2xl border border-[#EFE8DD]" />
          <div className="h-24 bg-white rounded-2xl border border-[#EFE8DD]" />
          <div className="h-24 bg-white rounded-2xl border border-[#EFE8DD]" />
        </div>
      </div>
    </div>
  );
}
