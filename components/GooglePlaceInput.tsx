"use client"

import usePlacesAutocomplete, { getGeocode, getDetails } from "use-places-autocomplete"
import { Search, MapPin, CheckCircle } from "lucide-react"
import { useState } from "react"

interface GooglePlaceInputProps {
  onSelect: (url: string) => void
  defaultValue?: string
}

export default function GooglePlaceInput({ onSelect, defaultValue = "" }: GooglePlaceInputProps) {
  // Hook magique qui gère la communication avec Google
  const {
    ready,
    value,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "fr" }, // Restreint à la France par défaut (changeable)
      language: "fr"
    },
    debounce: 300,
    defaultValue // Affiche la valeur existante si on est en modification
  })

  const [selectedPlace, setSelectedPlace] = useState(false)

  const handleSelect = async (description: string, placeId: string) => {
    setValue(description, false)
    clearSuggestions()
    setSelectedPlace(true)

    // Génération du lien SECURISE Google Avis
    // Format officiel : https://search.google.com/local/writereview?placeid=...
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`
    
    // On renvoie l'URL au formulaire parent
    onSelect(reviewUrl)
  }

  // Si l'utilisateur change le texte après avoir sélectionné, on reset
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    if (selectedPlace) {
        setSelectedPlace(false)
        onSelect("") // On vide l'URL si il modifie le texte
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          value={value}
          onChange={handleInput}
          disabled={!ready}
          placeholder="Tapez le nom de votre établissement..."
          className={`w-full p-3 pl-10 border rounded-xl outline-none transition-all ${selectedPlace ? 'border-green-500 ring-1 ring-green-500 bg-green-50' : 'bg-white focus:ring-2 focus:ring-blue-500'}`}
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            {selectedPlace ? <CheckCircle size={18} className="text-green-600"/> : <Search size={18}/>}
        </div>
      </div>

      {/* Liste des suggestions */}
      {status === "OK" && !selectedPlace && (
        <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-xl mt-2 shadow-xl max-h-60 overflow-y-auto">
          {data.map(({ place_id, description, structured_formatting }) => (
            <li
              key={place_id}
              onClick={() => handleSelect(description, place_id)}
              className="p-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3 transition-colors border-b last:border-0 border-slate-50"
            >
              <MapPin size={16} className="text-slate-400 shrink-0" />
              <div>
                <p className="font-bold text-sm text-slate-800">{structured_formatting.main_text}</p>
                <p className="text-xs text-slate-500">{structured_formatting.secondary_text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      
      {selectedPlace && (
        <p className="text-xs text-green-600 mt-2 font-bold flex items-center gap-1">
            <CheckCircle size={12}/> Lien d'avis généré automatiquement !
        </p>
      )}
    </div>
  )
}