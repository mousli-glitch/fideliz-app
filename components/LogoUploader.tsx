"use client"

import { useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { UploadCloud, Link as LinkIcon, X, Loader2, CheckCircle, Image as ImageIcon } from "lucide-react"

interface LogoUploaderProps {
  currentUrl: string
  onUrlChange: (url: string) => void
}

export default function LogoUploader({ currentUrl, onUrlChange }: LogoUploaderProps) {
  const supabase = createClient()
  const [mode, setMode] = useState<'UPLOAD' | 'URL'>('UPLOAD')
  const [uploading, setUploading] = useState(false)

  // --- FONCTION DE REDIMENSIONNEMENT (Le secret de la performance) ---
  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = document.createElement("img")
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const MAX_WIDTH = 300 // On force 300px max (largement suffisant pour w-12)
          const MAX_HEIGHT = 300
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
          ctx?.drawImage(img, 0, 0, width, height)
          
          // Conversion en JPEG qualité 80%
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
      // 1. On redimensionne AVANT l'upload
      const resizedBlob = await resizeImage(originalFile)
      const resizedFile = new File([resizedBlob], originalFile.name, { type: 'image/jpeg' })

      // 2. Nom unique
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`
      
      // 3. Upload vers Supabase
      const { error } = await supabase.storage
        .from('logos')
        .upload(fileName, resizedFile)

      if (error) throw error

      // 4. Récupérer l'URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(fileName)

      onUrlChange(publicUrl)

    } catch (error: any) {
      alert("Erreur upload : " + error.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Switcher Mode */}
      <div className="flex items-center gap-6 text-sm border-b border-slate-100 pb-2">
        <label className={`flex items-center gap-2 cursor-pointer font-bold transition-colors ${mode === 'UPLOAD' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
          <input type="radio" name="logo_mode" checked={mode === 'UPLOAD'} onChange={() => setMode('UPLOAD')} className="hidden"/>
          <UploadCloud size={18}/> Importer un fichier
        </label>
        <label className={`flex items-center gap-2 cursor-pointer font-bold transition-colors ${mode === 'URL' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
          <input type="radio" name="logo_mode" checked={mode === 'URL'} onChange={() => setMode('URL')} className="hidden"/>
          <LinkIcon size={18}/> Lien URL externe
        </label>
      </div>

      <div className="flex gap-6 items-start">
        {/* Zone Principale */}
        <div className="flex-1">
            {mode === 'UPLOAD' ? (
                <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-400 transition-all text-center p-8 group cursor-pointer">
                    <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUpload} 
                        disabled={uploading}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-blue-500">
                        {uploading ? (
                            <>
                                <Loader2 className="animate-spin text-blue-600" size={32}/>
                                <p className="text-sm font-bold text-slate-600">Optimisation & Envoi...</p>
                            </>
                        ) : (
                            <>
                                <div className="bg-white p-3 rounded-full shadow-sm">
                                    <UploadCloud size={24}/>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-700">Cliquez ou glissez votre logo</p>
                                    <p className="text-[10px] text-slate-400 mt-1">JPG, PNG (Max 300x300px auto)</p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="relative">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                        type="url" 
                        placeholder="https://..." 
                        value={currentUrl}
                        onChange={(e) => onUrlChange(e.target.value)}
                        className="w-full p-3 pl-10 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            )}
        </div>

        {/* Prévisualisation */}
        {currentUrl && (
            <div className="flex flex-col items-center gap-2">
                <div className="relative w-24 h-24 border rounded-xl overflow-hidden bg-[url('https://transparenttextures.com/patterns/stardust.png')] bg-slate-100 shadow-sm flex items-center justify-center group">
                    <img src={currentUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                    <button 
                        onClick={() => onUrlChange("")} 
                        className="absolute top-1 right-1 bg-white/90 rounded-full p-1 shadow hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Supprimer le logo"
                    >
                        <X size={14}/>
                    </button>
                </div>
                <span className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                    <CheckCircle size={10}/> Actif
                </span>
            </div>
        )}
      </div>
    </div>
  )
}