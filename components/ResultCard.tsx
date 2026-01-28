import React from 'react';
import { ResultCardProps } from '../types'; // <--- Importing from the shared file
import { 
  X, 
  ExternalLink, 
  Tag, 
  Search
} from 'lucide-react';

export const ResultCard: React.FC<ResultCardProps> = ({ result, loading, onReset, capturedImage }) => {
  
  if (loading) {
    return (
      <div className="w-full max-w-sm bg-gray-900/80 backdrop-blur-xl p-8 rounded-3xl text-white text-center border border-white/10 shadow-2xl animate-pulse flex flex-col items-center">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold tracking-wide">Analyzing Image...</h2>
        <p className="text-gray-400 text-sm mt-3 font-medium">Identifying product & scanning prices</p>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="w-full max-w-md bg-gray-900/90 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in-up transition-all duration-300">
      
      {/* Header Image Preview */}
      <div className="relative h-32 w-full bg-black/50">
        <img 
          src={capturedImage || result.imageUrl} 
          alt="Product" 
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent" />
        
        <button 
          onClick={onReset} 
          className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Body */}
      <div className="p-6 -mt-4 relative">
        <div className="flex items-center gap-2 mb-3">
          <div className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider border ${
            result.confidence > 80 
              ? 'bg-green-500/20 text-green-400 border-green-500/30' 
              : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
          }`}>
            {result.confidence}% MATCH
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2 leading-tight shadow-black drop-shadow-md">
          {result.name}
        </h2>

        <p className="text-gray-400 text-sm mb-6 leading-relaxed border-l-2 border-gray-700 pl-3">
          {result.description}
        </p>

        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Est. Market Price
            </p>
            <div className="text-2xl font-mono text-cyan-400 font-bold tracking-tight">
              ${result.priceMin} - ${result.priceMax}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button 
            onClick={onReset} 
            className="py-3.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            Scan Again
          </button>
          
          <a 
            href={result.shopUrl} 
            target="_blank" 
            rel="noreferrer"
            className="py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-center transition-colors flex items-center justify-center gap-2"
          >
            View Shop
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
};