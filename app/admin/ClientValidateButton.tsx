'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientValidateButton({ id }: { id: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleValidate = async () => {
    if(!confirm("Valider ce gain ?")) return
    setLoading(true)
    try {
      await fetch('/api/admin/winners', {
        method: 'PATCH',
        body: JSON.stringify({ id }),
      })
      router.refresh()
    } catch (e) {
      alert("Erreur")
    } finally {
      setLoading(false)
    }
  }

  return (
    <button 
      onClick={handleValidate}
      disabled={loading}
      className="bg-black text-white px-3 py-1 rounded text-xs hover:bg-gray-800 transition disabled:opacity-50"
    >
      {loading ? '...' : 'Valider'}
    </button>
  )
}