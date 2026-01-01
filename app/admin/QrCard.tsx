'use client'

import QRCode from "react-qr-code"

export default function QrCard({ url }: { url: string }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8 flex flex-col md:flex-row items-center gap-6">
      
      {/* Zone du QR Code */}
      <div className="bg-white p-2 border rounded-lg">
        <QRCode 
          value={url} 
          size={120} 
          fgColor="#000000" 
          bgColor="#ffffff" 
        />
      </div>

      {/* Zone Texte & Info */}
      <div className="flex-1 text-center md:text-left">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          QR Code Restaurant
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Ceci est votre QR Code unique. Imprimez-le et collez-le sur vos tables.
          <br/>
          Il redirige vos clients vers :
        </p>
        <code className="block bg-gray-100 p-2 rounded text-xs text-gray-600 font-mono break-all">
          {url}
        </code>
      </div>
    </div>
  )
}