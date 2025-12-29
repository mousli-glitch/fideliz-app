import AdminDashboard from "@/components/AdminDashboard"

interface AdminPageProps {
  params: Promise<{ slug: string }>
}

export default async function AdminPage({ params }: AdminPageProps) {
  const { slug } = await params

  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-md mx-auto mb-6 pt-6 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Staff Only 👮‍♂️
            </h1>
            <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase">
                {slug}
            </span>
        </div>
      </div>
      
      <AdminDashboard slug={slug} />
    </main>
  )
}