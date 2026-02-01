"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import {
  Search,
  Mail,
  MessageSquare,
  UserCheck,
  Trash2,
  Loader2,
  UserX,
  CheckSquare,
  Square,
} from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { deleteContactAction } from "@/app/actions/delete-contact"

type Customer = {
  id: string
  first_name: string
  email: string | null
  phone: string
  marketing_optin: boolean
  created_at: string
  game: { active_action: string } | null
  prize: { label: string } | null
}

interface CustomersTableProps {
  initialCustomers: Customer[]
  totalCount?: number
  page: number
  totalPages: number
  initialQuery: string
}

export function CustomersTable({
  initialCustomers,
  totalCount,
  page,
  totalPages,
  initialQuery,
}: CustomersTableProps) {
  const params = useParams()
  const slug = params?.slug as string

  const router = useRouter()
  const searchParams = useSearchParams()

  const PAGE_SIZE = 30

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || [])
  const [searchTerm, setSearchTerm] = useState(initialQuery || "")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const [isPending, startTransition] = useTransition()
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)

  // ✅ Sync quand SSR change (navigation URL)
  useEffect(() => {
    setCustomers(initialCustomers || [])
    setSelectedIds([])
  }, [initialCustomers])

  useEffect(() => {
    setSearchTerm(initialQuery || "")
  }, [initialQuery])

  const shownCustomers = useMemo(() => customers, [customers])

  // Sélection
  const toggleSelectAll = () => {
    if (selectedIds.length === shownCustomers.length) setSelectedIds([])
    else setSelectedIds(shownCustomers.map((c) => c.id))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const pushUrl = (nextPage: number, nextQuery: string) => {
    const sp = new URLSearchParams(searchParams.toString())

    const q = nextQuery.trim()
    if (q) sp.set("q", q)
    else sp.delete("q")

    sp.set("page", String(nextPage))

    startTransition(() => {
      router.push(`?${sp.toString()}`)
    })
  }

  // ✅ Recherche globale (SSR) avec debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setPendingLabel(searchTerm.trim() ? `Recherche: "${searchTerm.trim()}"` : "Chargement...")
      pushUrl(1, searchTerm)
      scrollTop()
    }, 350)

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const canPrev = page > 1 && !isPending
  const canNext = page < totalPages && !isPending

  const handlePrev = () => {
    if (!canPrev) return
    setPendingLabel(`Page ${page - 1}`)
    pushUrl(page - 1, searchTerm)
    scrollTop()
  }

  const handleNext = () => {
    if (!canNext) return
    setPendingLabel(`Page ${page + 1}`)
    pushUrl(page + 1, searchTerm)
    scrollTop()
  }

  // Suppression groupée
  const handleBulkDelete = async () => {
    const count = selectedIds.length
    if (!confirm(`Supprimer définitivement les ${count} client(s) sélectionné(s) ?`)) return

    setIsBulkDeleting(true)
    const result = await deleteContactAction(selectedIds, slug)
    if (result.success) {
      setCustomers((prev) => prev.filter((c) => !selectedIds.includes(c.id)))
      setSelectedIds([])
    } else {
      alert("Erreur : " + result.error)
    }
    setIsBulkDeleting(false)
  }

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Supprimer ce client ?")) return
    setDeletingId(id)

    const result = await deleteContactAction([id], slug)
    if (result.success) {
      setCustomers((prev) => prev.filter((c) => c.id !== id))
      setSelectedIds((prev) => prev.filter((selected) => selected !== id))
    } else {
      alert("Erreur : " + result.error)
    }

    setDeletingId(null)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher dans tout le CRM (nom, email, tel)..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 transition bg-white text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={isPending}
          />
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={isBulkDeleting || isPending}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-sm disabled:opacity-40"
          >
            {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Supprimer {selectedIds.length} sélection(s)
          </button>
        )}
      </div>

      {/* ✅ Wrapper relatif + overlay pendant navigation SSR */}
      <div className="overflow-x-auto relative">
        {isPending && (
          <div className="absolute inset-0 z-10 bg-white/70 backdrop-blur-[1px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              {pendingLabel || "Chargement..."}
            </div>
          </div>
        )}

        <div className={isPending ? "opacity-60 pointer-events-none" : ""}>
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="hover:text-blue-600 transition-colors"
                    disabled={isPending}
                  >
                    {selectedIds.length === shownCustomers.length && shownCustomers.length > 0 ? (
                      <CheckSquare size={18} className="text-blue-600" />
                    ) : (
                      <Square size={18} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-4">Client</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-center">Marketing</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {shownCustomers.length > 0 ? (
                shownCustomers.map((client) => {
                  const isSelected = selectedIds.includes(client.id)
                  return (
                    <tr
                      key={client.id}
                      className={`hover:bg-blue-50/50 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => toggleSelect(client.id)}
                          className="text-slate-300 hover:text-blue-600"
                          disabled={isPending}
                        >
                          {isSelected ? <CheckSquare size={18} className="text-blue-600" /> : <Square size={18} />}
                        </button>
                      </td>

                      <td className="px-4 py-4 font-bold text-slate-900">{client.first_name || "Anonyme"}</td>

                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex flex-col text-xs">
                          <span className="flex items-center gap-2 text-slate-500">
                            <Mail size={12} /> {client.email || "-"}
                          </span>
                          <span className="flex items-center gap-2 text-slate-500">
                            <MessageSquare size={12} /> {client.phone || "-"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {client.marketing_optin ? (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <UserCheck size={10} /> Opt-in
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <UserX size={10} /> Non
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteOne(client.id)}
                          disabled={deletingId === client.id || isPending}
                          className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingId === client.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination SSR */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
        <div className="text-xs text-slate-500">
          Page <span className="font-bold">{page}</span> / <span className="font-bold">{totalPages}</span>
          {typeof totalCount === "number" ? (
            <span className="ml-2 text-slate-400">({totalCount} clients)</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={!canPrev}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40"
          >
            Précédent
          </button>

          <button
            onClick={handleNext}
            disabled={!canNext}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-bold disabled:opacity-40"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  )
}