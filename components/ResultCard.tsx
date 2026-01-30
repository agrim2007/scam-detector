import React from 'react';
import { ResultCardProps } from '../types';
import { 
  X, 
  ExternalLink, 
  Tag, 
  Search,
  ShoppingCart,
  TrendingUp
} from 'lucide-react';

export const ResultCard: React.FC<ResultCardProps> = ({ result, loading, onReset, capturedImage }) => {
  
  if (loading) {
    return (
      <div className="w-full max-w-sm bg-gray-900/80 backdrop-blur-xl p-8 rounded-3xl text-white text-center border border-white/10 shadow-2xl animate-pulse flex flex-col items-center">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 border-4 border-gray-600 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <h2 className="text-xl font-bold tracking-wide">Scanning Indian Stores...</h2>
        <p className="text-gray-400 text-sm mt-3 font-medium">Comparing prices on Amazon, Flipkart & more</p>
      </div>
    );
  }

  if (!result) return null;

  // Helper to format price correctly (e.g. ₹ 1,299)
  const currencySymbol = result.currency || '₹';
  const displayPrice = result.priceMin === result.priceMax 
    ? `${currencySymbol} ${result.priceMin.toLocaleString('en-IN')}`
    : `${currencySymbol} ${result.priceMin.toLocaleString('en-IN')} - ${currencySymbol} ${result.priceMax.toLocaleString('en-IN')}`;

  return (
    <div className="w-full max-w-md bg-gray-900/90 backdrop-blur-xl rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in-up transition-all duration-300 flex flex-col max-h-[90vh]">
      
      {/* Header Image Preview */}
      <div className="relative h-40 w-full bg-black/50 flex-shrink-0">
        <img 
          src={capturedImage || result.imageUrl} 
          alt="Product" 
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent" />
        
        <button 
          onClick={onReset} 
          className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-colors border border-white/10 z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Confidence Badge */}
        <div className="absolute bottom-4 left-6 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider border backdrop-blur-md bg-black/30 text-white border-white/20 shadow-sm flex items-center gap-1">
           <div className={`w-2 h-2 rounded-full ${result.confidence > 80 ? 'bg-green-400' : 'bg-yellow-400'}`} />
           {result.confidence}% MATCH
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        <h2 className="text-2xl font-bold text-white leading-tight">
          {result.name}
        </h2>

        <p className="text-gray-400 text-sm leading-relaxed border-l-2 border-cyan-500/50 pl-3">
          {result.description}
        </p>

        {/* Price Box with Stock Status */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-800/50 rounded-xl p-4 border border-white/5 flex items-center justify-between shadow-lg">
          <div className="flex-1">
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
              <Tag className="w-3 h-3 text-cyan-400" /> Best Price Found
            </p>
            <div className="text-3xl font-mono text-white font-bold tracking-tight mb-2">
              {result.priceAvailable && result.priceMin > 0 ? displayPrice : 'Price Unavailable'}
            </div>
            {/* Stock Status Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide ${
              result.inStock ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${result.inStock ? 'bg-green-400' : 'bg-red-400'}`} />
              {result.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}
            </div>
          </div>
          <div className="bg-cyan-500/10 p-2.5 rounded-full">
            <TrendingUp className="w-6 h-6 text-cyan-400" />
          </div>
        </div>

        {/* Found Stores List (New Feature) */}
        {result.sourceName && (
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-2">🏪 Available at:</p>
            <a 
              href={result.shopUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors" />
                <span className="text-sm text-gray-300 font-medium">{result.sourceName}</span>
              </div>
              <ExternalLink className="w-4 h-4 text-cyan-400 opacity-50 group-hover:opacity-100" />
            </a>
          </div>
        )}
        {result.sources && result.sources.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Other sellers:</p>
            {result.sources.map((source, idx) => (
              <a 
                key={idx}
                href={source.web?.uri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <ShoppingCart className="w-4 h-4 text-gray-400 group-hover:text-cyan-400 transition-colors" />
                  <span className="text-sm text-gray-300 truncate max-w-[180px]">{source.web?.title}</span>
                </div>
                <span className="text-sm font-mono font-bold text-cyan-400">{source.web?.price || 'View'}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Action Buttons at Bottom */}
      <div className="grid grid-cols-2 gap-3 p-6 border-t border-white/5 flex-shrink-0 bg-gray-900/95 backdrop-blur">
        <button 
          onClick={onReset} 
          className="py-3.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors flex items-center justify-center gap-2 border border-white/5"
        >
          <Search className="w-4 h-4" />
          Scan Again
        </button>
        
        <a 
          href={result.shopUrl} 
          target="_blank" 
          rel="noreferrer"
          className="py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-center transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          Buy Now
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};