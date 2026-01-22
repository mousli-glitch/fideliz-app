"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { UploadCloud, Image as ImageIcon, Loader2, Trash2 } from "lucide-react"

interface BackgroundUploaderProps {
  currentUrl: string
  onUrlChange: (url: string) => void
}

export default function BackgroundUploader({ currentUrl, onUrlChange }: BackgroundUploaderProps) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)

  // Optimisation pour FOND D'ECRAN (JPG, Max 1200px)
  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = document.createElement("img")
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement("canvas")
          // Max 1200px pour un bon ratio qualité/poids
          const MAX_WIDTH = 1200 
          const MAX_HEIGHT = 1200
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height
              height = MAX_HEIGHT
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext("2d")
          
          // Fond blanc par défaut (pas de transparence pour JPG)
          if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height)
          }
          
          // Export en JPG qualité 80%
          canvas.toBlob((blob) => {
            if (blob) resolve(blob)
          }, "image/jpeg", 0.8)
        }
      }
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    setUploading(true)
    const originalFile = e.target.files[0]
    
    try {
      const resizedBlob = await resizeImage(originalFile)
      const resizedFile = new File([resizedBlob], "bg.jpg", { type: 'image/jpeg' })

      // Nom unique pour éviter les conflits
      const fileName = `custom-bg-${Date.now()}.jpg`
      
      // Upload dans le bucket 'backgrounds'
      const { error } = await supabase.storage
        .from('backgrounds')
        .upload(fileName, resizedFile)

      if (error) throw error

      const { data: { publicUrl } } = supabase.storage
        .from('backgrounds')
        .getPublicUrl(fileName)

      onUrlChange(publicUrl)

    } catch (error: any) {
      alert("Erreur upload : " + error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
        {/* Zone de Drop */}
        <div className={`relative border-2 border-dashed rounded-xl transition-all text-center p-6 group cursor-pointer flex flex-col items-center justify-center min-h-[140px] ${currentUrl ? 'border-blue-300 bg-blue-50/30' : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-blue-400'}`}>
            <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
            
            <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-blue-500">
                {uploading ? (
                    <>
                        <Loader2 className="animate-spin text-blue-600" size={32}/>
                        <p className="text-xs font-bold text-slate-600 animate-pulse">Optimisation & Envoi...</p>
                    </>
                ) : (
                    <>
                        {currentUrl ? (
                             <div className="relative w-full h-32 rounded-lg overflow-hidden shadow-sm">
                                <img src={currentUrl} alt="Aperçu" className="w-full h-full object-cover opacity-80" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white font-bold text-xs uppercase tracking-widest">
                                    Changer l'image
                                </div>
                             </div>
                        ) : (
                            <>
                                <div className="bg-white p-3 rounded-full shadow-sm"><UploadCloud size={24}/></div>
                                <div>
                                    <p className="text-sm font-bold text-slate-700">Importer une image perso</p>
                                    <p className="text-[10px] text-slate-400">JPG/PNG - Max 5Mo</p>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>

        {/* Bouton supprimer si une image est sélectionnée */}
        {currentUrl && (
            <button onClick={() => onUrlChange("")} className="text-xs text-red-500 flex items-center gap-1 hover:underline mx-auto">
                <Trash2 size={12}/> Supprimer l'image personnalisée
            </button>
        )}
    </div>
  )
}