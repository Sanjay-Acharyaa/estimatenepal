export function DeadlineUrgencyChip({ deadline }: { deadline: Date | string }) {
  const ms = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);

  if (days <= 0) {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
        Closed
      </span>
    );
  }
  if (days <= 3) {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
        {days}d left
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">
        {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">
      {days}d left
    </span>
  );
}
