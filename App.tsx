import React, { useState, useCallback } from 'react';
import { CameraView } from './components/CameraView';
import { ResultCard } from './components/ResultCard';
import { identifyProduct } from './services/gemini';
import { ProductResult } from './types'; // <--- Now imports correctly

export default function App() {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ProductResult | null>(null);

  const handleCapture = useCallback(async (imageSrc: string) => {
    setCapturedImage(imageSrc);
    setIsAnalyzing(true);
    setResult(null);

    try {
      const data = await identifyProduct(imageSrc);
      setResult(data as ProductResult);
    } catch (error) {
      console.error("Analysis failed", error);
      // Fallback error object
      setResult({
        name: "Scan Failed",
        description: "Could not connect to AI service.",
        priceMin: 0,
        priceMax: 0,
        confidence: 0,
        imageUrl: imageSrc,
        shopUrl: "#"
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setCapturedImage(null);
    setResult(null);
    setIsAnalyzing(false);
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center font-sans">
      {!capturedImage ? (
        <CameraView onCapture={handleCapture} />
      ) : (
        <div className="relative w-full h-full animate-fade-in">
           {/* Background Blur */}
           <div 
            className="absolute inset-0 bg-cover bg-center opacity-50 blur-xl scale-110"
            style={{ backgroundImage: `url(${capturedImage})` }}
           />
           {/* Result Overlay */}
           <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
             <ResultCard 
               result={result} 
               loading={isAnalyzing} 
               onReset={handleReset} 
               capturedImage={capturedImage} 
             />
           </div>
        </div>
      )}
    </div>
  );
}