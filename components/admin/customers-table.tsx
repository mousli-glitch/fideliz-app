"use client"

import { useMemo, useState } from "react"
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
import { useParams } from "next/navigation"
import { deleteContactAction } from "@/app/actions/delete-contact"
import { getCustomersPageAction } from "@/app/actions/get-customers-page"

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

type CustomersPageResult =
  | {
      success: true
      customers: Customer[]
      total: number
      totalPages: number
      page: number
      hasMore: boolean
    }
  | { success: false; message: string }

interface CustomersTableProps {
  initialCustomers: Customer[]
  hasMoreInitial: boolean
  totalCount?: number // ✅ optionnel (recommandé)
}

export function CustomersTable({ initialCustomers, hasMoreInitial, totalCount }: CustomersTableProps) {
  const params = useParams()
  const slug = params?.slug as string

  const PAGE_SIZE = 30

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || [])
  const [searchTerm, setSearchTerm] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Pagination pages (offset)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState<number>(() => {
    if (typeof totalCount === "number") return Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    // fallback si pas de totalCount : on assume 1 page au début
    return 1
  })
  const [hasMore, setHasMore] = useState<boolean>(hasMoreInitial)
  const [isPaging, setIsPaging] = useState(false)

  // État sélection multiple
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return customers.filter((client) => {
      return (
        (client.first_name || "").toLowerCase().includes(term) ||
        (client.email || "").toLowerCase().includes(term) ||
        (client.phone || "").includes(term)
      )
    })
  }, [customers, searchTerm])

  // Sélection
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredCustomers.length) setSelectedIds([])
    else setSelectedIds(filteredCustomers.map((c) => c.id))
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const scrollTop = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const loadPage = async (targetPage: number) => {
    if (!slug || isPaging) return
    if (targetPage < 1) return
    if (totalPages && targetPage > totalPages) return

    setIsPaging(true)

    // ✅ Page 1 : on remet l’SSR (évite re-fetch, plus stable)
    if (targetPage === 1) {
      setCustomers(initialCustomers || [])
      setPage(1)
      setSelectedIds([])
      setHasMore(hasMoreInitial)
      scrollTop()
      setIsPaging(false)
      return
    }

    // ✅ IMPORTANT : ici on appelle l’action en mode "page"
    // -> si ton action attend (slug, page, limit)
    const res = (await getCustomersPageAction(slug, targetPage, PAGE_SIZE)) as CustomersPageResult

    if (res.success) {
      setCustomers(res.customers || [])
      setPage(res.page || targetPage)
      setHasMore(Boolean(res.hasMore))
      setTotalPages(res.totalPages || totalPages)
      setSelectedIds([])
      scrollTop()
    } else {
      console.error("CRM pagination error:", res.message)
    }

    setIsPaging(false)
  }

  const canPrev = page > 1 && !isPaging
  const canNext = ((totalPages ? page < totalPages : hasMore) && !isPaging) || false

  const handlePrev = async () => {
    if (!canPrev) return
    await loadPage(page - 1)
  }

  const handleNext = async () => {
    if (!canNext) return
    await loadPage(page + 1)
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
    }
    setDeletingId(null)
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher un client..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:border-blue-500 transition bg-white text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {selectedIds.length > 0 && (
          <button
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-red-700 transition-all shadow-sm"
          >
            {isBulkDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Supprimer {selectedIds.length} sélection(s)
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-4 w-10 text-center">
                <button onClick={toggleSelectAll} className="hover:text-blue-600 transition-colors">
                  {selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0 ? (
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
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((client) => {
                const isSelected = selectedIds.includes(client.id)
                return (
                  <tr
                    key={client.id}
                    className={`hover:bg-blue-50/50 transition-colors ${isSelected ? "bg-blue-50/40" : ""}`}
                  >
                    <td className="px-4 py-4 text-center">
                      <button onClick={() => toggleSelect(client.id)} className="text-slate-300 hover:text-blue-600">
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
                        disabled={deletingId === client.id}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        {deletingId === client.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={16} />}
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

      {/* Pagination */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/30">
        <div className="text-xs text-slate-500">
          Page <span className="font-bold">{page}</span>
          {totalPages ? <> / <span className="font-bold">{totalPages}</span></> : null}
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