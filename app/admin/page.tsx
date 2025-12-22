import AdminDashboard from "@/components/AdminDashboard"

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-zinc-100 p-8">
      <div className="max-w-5xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-black">FIDELIZ Admin</h1>
          <p className="text-zinc-500">Espace Restaurateur</p>
        </div>
        <a href="/" className="text-sm text-zinc-400 hover:text-black hover:underline">
          ← Retour Site
        </a>
      </div>
      <AdminDashboard />
    </main>
  )
}