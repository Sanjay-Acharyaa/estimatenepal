const statusColors: Record<string, string> = {
  ESTIMATING: "bg-blue-100 text-blue-700",
  BID_SUBMITTED: "bg-yellow-100 text-yellow-700",
  ACCEPTED: "bg-green-100 text-green-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  COMPLETE: "bg-gray-100 text-gray-700",
  LOST: "bg-red-100 text-red-700",
  ARCHIVED: "bg-gray-100 text-gray-400",
};

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
