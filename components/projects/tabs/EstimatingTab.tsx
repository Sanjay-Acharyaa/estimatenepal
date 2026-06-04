import Link from "next/link";

export function EstimatingTab({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
      <div className="text-5xl">📊</div>
      <h2 className="text-lg font-semibold text-gray-700">Bill of Quantities</h2>
      <p className="text-sm text-gray-500 max-w-sm">
        View the full quantity schedule, propose rate overrides, and export to PDF or Excel.
      </p>
      <Link
        href={`/dashboard/projects/${projectId}/boq`}
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
      >
        Open BOQ →
      </Link>
    </div>
  );
}
