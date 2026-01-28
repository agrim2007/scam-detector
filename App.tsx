import React, { useState, useCallback } from 'react';
import { CameraView } from './components/CameraView';
import { ResultCard } from './components/ResultCard';
import { ProductResult } from './types';
import { identifyProduct } from './services/gemini';

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
      setResult(data);
    } catch (error) {
      console.error("Analysis failed", error);
      // Fallback or error state handling could go here
      setResult({
        name: "Scan Failed",
        description: "Could not connect to AI service. Please check your API key and connection.",
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
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col items-center justify-center">
      
      {!capturedImage ? (
        <CameraView onCapture={handleCapture} />
      ) : (
        <div className="relative w-full h-full">
           {/* Background Image (Blurred version of capture) */}
           <div 
            className="absolute inset-0 bg-cover bg-center opacity-40 blur-xl scale-110 transition-all duration-700"
            style={{ backgroundImage: `url(${capturedImage})` }}
           />
           
           {/* Result Overlay */}
           <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
             <ResultCard 
               result={result} 
               loading={isAnalyzing} 
               capturedImage={capturedImage}
               onReset={handleReset} 
             />
           </div>
        </div>
      )}
    </div>
  );
}