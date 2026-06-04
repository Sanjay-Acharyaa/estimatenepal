import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function SuperAdminPage() {
  const [orgs, users] = await Promise.all([
    prisma.org.findMany({
      include: { _count: { select: { users: true, projects: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { org: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-red-600 text-white px-8 py-4 flex items-center gap-4">
        <span className="font-bold text-lg">Super Admin</span>
        <span className="text-red-200 text-sm">Platform management</span>
        <div className="ml-auto">
          <Link href="/dashboard" className="text-sm text-red-200 hover:text-white">
            Back to Dashboard
          </Link>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Quick links */}
        <div className="flex gap-3">
          <Link href="/admin/rates"
            className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm">
            📋 DUDBC Rate Database
          </Link>
        </div>

        {/* Orgs */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Organisations ({orgs.length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Plan</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Users</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Projects</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orgs.map((org: (typeof orgs)[number]) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{org.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{org._count.users}</td>
                    <td className="px-4 py-3 text-gray-600">{org._count.projects}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No organisations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Users */}
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Recent Users ({users.length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Org</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user: (typeof users)[number]) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {user.name}
                      {user.isSuperAdmin && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                          SUPER
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3 text-gray-500">{user.org?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{user.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          user.emailVerified
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {user.emailVerified ? "Yes" : "No"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
