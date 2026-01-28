import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

// Initialize the standard Generative AI SDK
// Note: Use import.meta.env for Vite-based projects instead of process.env
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_API_KEY as string);

// Helper: Compress image to reduce upload size and latency
async function compressImage(base64Src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 512; // 512px is optimal for speed
      
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_WIDTH) {
          width *= MAX_WIDTH / height;
          height = MAX_WIDTH;
        }
      }

      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      // Compress to JPEG with 0.6 quality for faster transmission
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => {
      resolve(base64Src);
    }
  });
}

export async function identifyProduct(imageSrc: string) {
  try {
    // 1. Compress Image Client-Side
    const optimizedImage = await compressImage(imageSrc);
    const base64Data = optimizedImage.split(',')[1];

    // 2. Configure Model (Gemini 1.5 Flash)
    // Using 1.5-flash for speed and stability with the standard SDK
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING },
            description: { type: SchemaType.STRING },
            priceMin: { type: SchemaType.NUMBER },
            priceMax: { type: SchemaType.NUMBER },
            shopUrl: { type: SchemaType.STRING },
          },
          required: ["name", "description", "priceMin", "priceMax", "shopUrl"]
        }
      }
    });

    // 3. Prepare Prompt
    const prompt = "Identify this product (precise name, model). Estimate its current market price range in USD based on your knowledge. Provide a generic search URL.";
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: "image/jpeg",
      },
    };

    // 4. Generate Content
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse JSON:", text);
      throw new Error("Failed to interpret AI response");
    }

    return {
      name: data.name || "Unknown Product",
      description: data.description || "Analysis complete.",
      priceMin: data.priceMin || 0,
      priceMax: data.priceMax || 0,
      confidence: 90, 
      imageUrl: imageSrc, 
      // Fallback URL since 1.5-flash standard doesn't return grounding metadata in the same way
      shopUrl: data.shopUrl || `https://www.google.com/search?q=${encodeURIComponent(data.name || 'product')}`,
      sources: [] 
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}