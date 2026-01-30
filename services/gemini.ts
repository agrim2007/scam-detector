// services/gemini.ts
// Uses SearchApi.io (Google Lens) - HYBRID MODE + FIXED API CALL
// 1. Identifying: Uses top visual match (YouTube/Blog) for accurate Name.
// 2. Shopping: Uses lower store match for accurate Price.
// 3. Fix: Includes 'q' param so the API doesn't crash.

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

// Trusted stores for the "Buy" button
const TRUSTED_SHOPS = ['amazon', 'flipkart', 'myntra', 'croma', 'reliance', 'tatacliq', 'meesho', 'ajio', 'boat', 'samsung', 'apple', 'vijaysales'];

async function uploadToImgBB(base64Image: string): Promise<string> {
  const formData = new FormData();
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
  formData.append("image", cleanBase64);

  const response = await fetch(`https://api.imgbb.com/1/upload?expiration=600&key=${IMGBB_API_KEY}`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!data.success) throw new Error("Failed to upload image to ImgBB.");
  return data.data.url; 
}

export async function identifyProduct(imageSrc: string) {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) throw new Error("Missing API Keys.");

    // 1. Upload Image
    const publicImageUrl = await uploadToImgBB(imageSrc);

    // 2. Prepare Search (Google Lens)
    const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
    searchUrl.searchParams.append("engine", "google_lens");
    searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    searchUrl.searchParams.append("url", publicImageUrl); 
    searchUrl.searchParams.append("gl", "in"); // India
    searchUrl.searchParams.append("hl", "en"); 
    
    // FIX: Add a neutral dot '.' as the query. 
    // The API fails without 'q', but '.' tells it to just focus on the image.
    searchUrl.searchParams.append("q", "."); 

    const response = await fetch(searchUrl.toString());
    const data = await response.json();

    if (data.error) {
        console.error("API Error:", data.error);
        throw new Error(data.error);
    }

    // 3. HYBRID LOGIC 🧠
    const visualMatches = data.visual_matches || [];
    
    // A. Identity Source (Top Result - usually a Video/Review with accurate name)
    const identityMatch = visualMatches[0]; 
    
    // B. Price Source (First result that has a price)
    const matchesWithPrice = visualMatches.filter((m: any) => m.price);
    
    // Try to find a trusted store, otherwise take any store with a price
    const shoppingMatch = matchesWithPrice.find((m: any) => 
        TRUSTED_SHOPS.some(shop => m.source?.toLowerCase().includes(shop))
    ) || matchesWithPrice[0];

    // 4. COMBINE THEM
    let productName = "Unidentified Item";
    let priceMin = 0;
    let shopUrl = "";
    let sourceName = "Web";
    let description = "No exact match found.";

    // Get Name from Top Match (Most Accurate)
    if (identityMatch) {
        productName = identityMatch.title;
        description = identityMatch.subtitle || `Identified via ${identityMatch.source}`;
        shopUrl = identityMatch.link; // Default link
        sourceName = identityMatch.source;
    }

    // Get Price & Link from Shopping Match (If available)
    if (shoppingMatch) {
        // We override the link/source to point to the store
        shopUrl = shoppingMatch.link;
        sourceName = shoppingMatch.source;
        
        // Parse the price safely
        const rawString = shoppingMatch.price.value || shoppingMatch.price.raw || shoppingMatch.price.extracted_value;
        if (rawString) {
            // Remove commas and non-numbers (e.g. "₹ 1,799" -> 1799)
            const cleanString = rawString.toString().replace(/,/g, '').replace(/[^0-9.]/g, '');
            priceMin = parseFloat(cleanString);
        }
    }

    // Fallback: If no price found, set to 0
    if (isNaN(priceMin)) priceMin = 0;

    return {
      name: productName,
      description: `Identified as ${productName}. Best price on ${sourceName}.`,
      priceMin: priceMin,
      priceMax: priceMin,
      currency: "₹",
      confidence: identityMatch ? 90 : 0,
      imageUrl: imageSrc,
      shopUrl: shopUrl || publicImageUrl,
      sources: matchesWithPrice.slice(0, 5).map((match: any) => ({
        web: {
          uri: match.link,
          title: match.title,
          price: match.price?.raw || `₹${match.price?.value}`
        }
      }))
    };

  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
}