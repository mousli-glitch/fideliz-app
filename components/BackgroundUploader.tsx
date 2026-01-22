"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { UploadCloud, Loader2, Trash2, CheckCircle, RefreshCw } from "lucide-react"

interface BackgroundUploaderProps {
  currentUrl: string
  onUrlChange: (url: string) => void
}

export default function BackgroundUploader({ currentUrl, onUrlChange }: BackgroundUploaderProps) {
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)

  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = document.createElement("img")
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement("canvas")
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
          
          if (ctx) {
              ctx.fillStyle = "#FFFFFF";
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height)
          }
          
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
      const fileName = `custom-bg-${Date.now()}.jpg`
      
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
        <div className={`relative border-2 rounded-xl transition-all text-center group cursor-pointer flex flex-col items-center justify-center min-h-[160px] overflow-hidden ${currentUrl ? 'border-green-500 bg-slate-50' : 'border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/30'}`}>
            
            <input type="file" accept="image/*" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"/>
            
            {uploading ? (
                <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="animate-spin text-blue-600" size={32}/>
                    <p className="text-xs font-bold text-slate-600 animate-pulse">Traitement de l'image...</p>
                </div>
            ) : (
                <>
                    {currentUrl ? (
                         // 🔥 CAS : IMAGE PRÉSENTE (Feedback Vert)
                         <div className="relative w-full h-40">
                            {/* L'image en fond */}
                            <img src={currentUrl} alt="Aperçu" className="w-full h-full object-cover" />
                            
                            {/* Overlay sombre au survol pour modifier */}
                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <RefreshCw className="text-white mb-2" size={24}/>
                                <p className="text-white font-bold text-xs uppercase tracking-widest">Changer l'image</p>
                            </div>

                            {/* Badge Vert de succès (Toujours visible) */}
                            <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 fade-in duration-300">
                                <CheckCircle size={14} className="text-white"/>
                                <span className="text-[10px] font-black uppercase tracking-wide">Image activée</span>
                            </div>
                         </div>
                    ) : (
                        // CAS : PAS D'IMAGE (Zone de drop standard)
                        <div className="flex flex-col items-center gap-3 py-8 px-4">
                            <div className="bg-slate-100 p-3 rounded-full shadow-sm group-hover:scale-110 transition-transform"><UploadCloud size={24} className="text-slate-400 group-hover:text-blue-500"/></div>
                            <div>
                                <p className="text-sm font-bold text-slate-700 group-hover:text-blue-600 transition-colors">Cliquez ou glissez une image ici</p>
                                <p className="text-[10px] text-slate-400 mt-1">JPG ou PNG (Max 5Mo)</p>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>

        {/* Bouton supprimer (Visible seulement si image présente) */}
        {currentUrl && (
            <button onClick={(e) => { e.preventDefault(); onUrlChange(""); }} className="text-xs text-red-500 flex items-center gap-1 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors mx-auto font-medium">
                <Trash2 size={14}/> Supprimer l'image personnalisée
            </button>
        )}
    </div>
  )
}