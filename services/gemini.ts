import Groq from "groq-sdk";

// Initialize the Groq SDK
const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY as string,
  dangerouslyAllowBrowser: true 
});

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
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => {
      resolve(base64Src);
    }
  });
}

export async function identifyProduct(imageSrc: string) {
  try {
    const optimizedImage = await compressImage(imageSrc);

    const jsonStructure = JSON.stringify({
      name: "string (precise product name)",
      description: "string (short description)",
      priceMin: "number (min estimated price in USD)",
      priceMax: "number (max estimated price in USD)",
      shopUrl: "string (search URL)"
    });

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
                url: optimizedImage,
              },
            },
          ],
        },
      ],
      // UPDATED: This is the new model supported by Groq for Vision
      model: "meta-llama/llama-4-scout-17b-16e-instruct", 
      
      response_format: { type: "json_object" },
      temperature: 0.1, 
    });

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