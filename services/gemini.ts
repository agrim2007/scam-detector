import Groq from "groq-sdk";

// Initialize the Groq SDK
// Ensure you add VITE_GROQ_API_KEY to your .env file
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY as string,
  dangerouslyAllowBrowser: true // Required if running directly in a Vite client-side app
});

// Helper: Compress image to reduce upload size and latency
// (Kept identical to your original code)
async function compressImage(base64Src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Src;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 512; 
      
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
      
      // Compress to JPEG with 0.6 quality
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
    // Groq accepts data URLs (e.g., "data:image/jpeg;base64,...") directly
    const optimizedImage = await compressImage(imageSrc);

    // 2. Prepare the JSON Schema definition for the prompt
    // Groq models need explicit instructions for JSON structure in the prompt
    const jsonStructure = JSON.stringify({
      name: "string (precise product name)",
      description: "string (short description)",
      priceMin: "number (min estimated price in USD)",
      priceMax: "number (max estimated price in USD)",
      shopUrl: "string (search URL)"
    });

    // 3. Configure Model & Messages
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Identify this product (precise name, model). Estimate its current market price range in USD. 
                     Return ONLY a valid JSON object with the following structure, no markdown formatting:
                     ${jsonStructure}`
            },
            {
              type: "image_url",
              image_url: {
                url: optimizedImage, // Pass the Data URL directly
              },
            },
          ],
        },
      ],
      // Use Llama 3.2 Vision (11b or 90b are standard for vision on Groq)
      model: "llama-3.2-11b-vision-preview", 
      
      // Enforce JSON mode
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for factual consistency
    });

    // 4. Parse Response
    const content = chatCompletion.choices[0]?.message?.content;
    
    if (!content) throw new Error("No content received from Groq");

    let data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse JSON:", content);
      throw new Error("Failed to interpret AI response");
    }

    return {
      name: data.name || "Unknown Product",
      description: data.description || "Analysis complete.",
      priceMin: data.priceMin || 0,
      priceMax: data.priceMax || 0,
      confidence: 90, 
      imageUrl: imageSrc, 
      shopUrl: data.shopUrl || `https://www.google.com/search?q=${encodeURIComponent(data.name || 'product')}`,
      sources: [] 
    };

  } catch (error) {
    console.error("Groq API Error:", error);
    throw error;
  }
}