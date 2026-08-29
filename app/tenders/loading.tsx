export default function TendersLoading() {
  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-6 space-y-4">
        <div className="h-7 w-40 rounded bg-gray-200 animate-pulse" />
        <div className="h-20 rounded-xl bg-gray-200 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    </main>
  );
}
