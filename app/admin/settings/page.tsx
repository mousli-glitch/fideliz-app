"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { sanitizeSlug } from "@/lib/utils"

export default function SettingsPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    brand_color: "#000000",
    text_color: "#FFFFFF",
    logo_url: "",
    bg_image_url: ""
  })

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 👇 FIX 1 : On utilise 'as any' pour la lecture aussi
      const { data } = await (supabase.from("restaurants") as any)
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (data) {
        setFormData({
          name: data.name || "",
          slug: data.slug || "",
          brand_color: data.brand_color || "#000000",
          text_color: data.text_color || "#FFFFFF",
          logo_url: data.logo_url || "",
          bg_image_url: data.bg_image_url || ""
        })
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const safeSlug = sanitizeSlug(formData.slug)
    const payload = { ...formData, slug: safeSlug }

    // 👇 FIX 2 : On force le type pour la vérification d'existence
    const { data: existing } = await (supabase.from("restaurants") as any)
      .select("id")
      .eq("user_id", user.id)
      .single()

    let error
    if (existing) {
      // 👇 FIX 3 : On force le type pour l'UPDATE (c'est ici que tu avais l'erreur 'never')
      const { error: err } = await (supabase.from("restaurants") as any)
        .update(payload)
        .eq("user_id", user.id)
      error = err
    } else {
      // 👇 FIX 4 : On force le type pour l'INSERT
      const { error: err } = await (supabase.from("restaurants") as any)
        .insert({ user_id: user.id, ...payload })
      error = err
    }

    setSaving(false)
    if (error) {
      alert("Erreur (Slug déjà pris ?): " + (error as any).message)
    } else {
      setFormData(prev => ({ ...prev, slug: safeSlug }))
      alert("Sauvegardé avec succès !")
    }
  }

  if (loading) return <div>Chargement...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Mon Restaurant</h2>
        <p className="text-slate-500">Configurez votre identité visuelle.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
          <div className="space-y-2">
            <Label>Nom du restaurant</Label>
            <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required placeholder="Ex: Le Bistrot" />
          </div>

          <div className="space-y-2">
            <Label>Identifiant URL (Slug)</Label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">fideliz.app/play/</span>
              <Input value={formData.slug} onChange={e => setFormData({...formData, slug: sanitizeSlug(e.target.value)})} required placeholder="le-bistrot" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Couleur Principale</Label>
              <div className="flex gap-2">
                <input type="color" className="h-10 w-10 rounded cursor-pointer" value={formData.brand_color} onChange={e => setFormData({...formData, brand_color: e.target.value})} />
                <Input value={formData.brand_color} onChange={e => setFormData({...formData, brand_color: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Couleur Texte</Label>
              <div className="flex gap-2">
                <input type="color" className="h-10 w-10 rounded cursor-pointer" value={formData.text_color} onChange={e => setFormData({...formData, text_color: e.target.value})} />
                <Input value={formData.text_color} onChange={e => setFormData({...formData, text_color: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="space-y-2"><Label>Logo (URL)</Label><Input value={formData.logo_url} onChange={e => setFormData({...formData, logo_url: e.target.value})} /></div>
          <div className="space-y-2"><Label>Fond d'écran (URL)</Label><Input value={formData.bg_image_url} onChange={e => setFormData({...formData, bg_image_url: e.target.value})} /></div>

          <Button type="submit" disabled={saving}>
            {saving ? "Sauvegarde..." : "Enregistrer les modifications"}
          </Button>
        </form>
      </Card>
    </div>
  )
}