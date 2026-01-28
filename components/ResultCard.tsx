import React from 'react';
import { ProductResult } from '../types';
import { 
  CheckCircle, 
  ScanLine, 
  Bookmark, 
  ExternalLink, 
  Loader2,
  Globe
} from 'lucide-react';

interface ResultCardProps {
  result: ProductResult | null;
  loading: boolean;
  capturedImage: string;
  onReset: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, loading, capturedImage, onReset }) => {
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-900/90 backdrop-blur-xl rounded-3xl border border-gray-700 shadow-2xl">
        <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
        <h3 className="text-xl font-semibold text-white">Analyzing Product...</h3>
        <p className="text-gray-400 text-sm mt-2">Searching live retailer prices</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="w-full max-w-md bg-[#1C1C1E] rounded-[32px] overflow-hidden shadow-2xl border border-gray-800 max-h-[90vh] overflow-y-auto scrollbar-hide">
      
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between border-b border-gray-800 sticky top-0 bg-[#1C1C1E] z-10">
        <div className="flex items-center gap-2">
           <ScanLine className="w-4 h-4 text-cyan-400" />
           <span className="text-xs font-bold text-cyan-400 tracking-wider">SCAN COMPLETE</span>
        </div>
        <div className="flex items-center gap-1.5 bg-[#0F362E] px-3 py-1 rounded-full border border-[#165B4A]">
           <CheckCircle className="w-3 h-3 text-emerald-400" />
           <span className="text-[10px] font-semibold text-emerald-400">Verified</span>
        </div>
      </div>

      <div className="p-6 flex flex-col items-center">
        
        {/* Product Image Halo */}
        <div className="relative mb-6 shrink-0">
           <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full transform scale-110" />
           <div className="relative w-40 h-40 rounded-full p-1 bg-gradient-to-b from-gray-700 to-gray-900 shadow-xl overflow-hidden">
              <img 
                src={result.imageUrl} 
                alt={result.name}
                className="w-full h-full object-cover"
              />
           </div>
        </div>

        {/* Product Info */}
        <h2 className="text-2xl font-bold text-white text-center mb-1 leading-tight">{result.name}</h2>
        <p className="text-sm text-gray-400 text-center mb-6">{result.description}</p>

        {/* Price Card */}
        <div className="w-full bg-[#151516] border border-gray-800 rounded-xl p-4 mb-6 flex flex-col items-center">
            <span className="text-[10px] text-gray-500 font-bold tracking-wider uppercase mb-1">Estimated Market Value</span>
            <div className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                ${result.priceMin} - ${result.priceMax}
            </div>
        </div>

        {/* Actions */}
        <div className="w-full space-y-3 mb-6">
            <a 
              href={result.shopUrl} 
              target="_blank" 
              rel="noreferrer"
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white font-semibold shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
               <ExternalLink className="w-5 h-5" />
               View Best Deal
            </a>
            
            <button onClick={onReset} className="w-full py-4 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white font-semibold border border-gray-700 flex items-center justify-center gap-2 transition-all">
               <ScanLine className="w-5 h-5" />
               Scan Another
            </button>
        </div>

        {/* Sources Section (Grounding) */}
        {result.sources && result.sources.length > 0 && (
          <div className="w-full border-t border-gray-800 pt-4">
            <h4 className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wider">Sources Found</h4>
            <div className="flex flex-col gap-2">
              {result.sources.map((source, index) => {
                if (!source.web?.uri) return null;
                return (
                  <a 
                    key={index}
                    href={source.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4 text-gray-400 group-hover:text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-300 truncate group-hover:text-white">
                        {source.web.title || new URL(source.web.uri).hostname}
                      </p>
                      <p className="text-[10px] text-gray-600 truncate">
                        {source.web.uri}
                      </p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-gray-400" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};