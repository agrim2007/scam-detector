// services/gemini.ts
// Uses SearchApi.io (2-Step Smart System) 🧠
// FIX: Dynamic Price Parsing for Amazon links.
// Removed "stale" fallback prices. Only shows REAL-TIME data.

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

// Trusted stores
const TRUSTED_SHOPS = ['amazon', 'flipkart', 'myntra', 'croma', 'reliance', 'tatacliq', 'meesho', 'ajio', 'boat', 'samsung', 'apple'];

async function uploadToImgBB(base64Image: string): Promise<string> {
  const formData = new FormData();
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
  formData.append("image", cleanBase64);

  const response = await fetch(`https://api.imgbb.com/1/upload?expiration=600&key=${IMGBB_API_KEY}`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!data.success) throw new Error("Failed to upload image.");
  return data.data.url; 
}

// Helper: Step 2 - Search for IN STOCK products
async function findBestPrice(productName: string) {
  const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
  searchUrl.searchParams.append("engine", "google_shopping");
  searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  searchUrl.searchParams.append("q", productName); 
  searchUrl.searchParams.append("gl", "in"); // India
  searchUrl.searchParams.append("hl", "en"); 
  searchUrl.searchParams.append("num", "10"); 
  
  // "is:1" = In Stock Only
  searchUrl.searchParams.append("tbs", "mr:1,merchagg:g784994|m7388148,is:1"); 

  const response = await fetch(searchUrl.toString());
  const data = await response.json();

  if (data.shopping_results && data.shopping_results.length > 0) {
    return data.shopping_results; 
  }
  return [];
}

// Helper: Deep Price Parser
function extractPrice(item: any): { min: number, max: number } {
    let price = 0;

    // 1. Try 'extracted_price' (Best for numbers)
    if (item.extracted_price) {
        price = item.extracted_price;
    } 
    // 2. Try 'price' string cleaning
    else if (item.price) {
        const str = item.price.toString();
        // Remove '₹', ',', 'Rs', spaces
        const clean = str.replace(/[^\d.]/g, ''); 
        const parsed = parseFloat(clean);
        if (!isNaN(parsed)) price = parsed;
    }

    // Check for detection errors (sometimes API returns 0)
    if (price <= 0) return { min: 0, max: 0 };

    return { min: price, max: price };
}

export async function identifyProduct(imageSrc: string) {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) throw new Error("Missing API Keys.");

    // --- STEP 1: VISUAL IDENTIFICATION ---
    const publicImageUrl = await uploadToImgBB(imageSrc);

    const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
    lensUrl.searchParams.append("engine", "google_lens");
    lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    lensUrl.searchParams.append("url", publicImageUrl); 
    lensUrl.searchParams.append("gl", "in"); 
    lensUrl.searchParams.append("q", "."); 

    const lensResponse = await fetch(lensUrl.toString());
    const lensData = await lensResponse.json();

    if (lensData.error) throw new Error(lensData.error);

    const visualMatches = lensData.visual_matches || [];
    if (visualMatches.length === 0) {
        return {
            name: "Unidentified Item",
            description: "Could not visually identify this product.",
            priceMin: 0, priceMax: 0, confidence: 0,
            imageUrl: imageSrc, shopUrl: "", sources: []
        };
    }

    const identifiedName = visualMatches[0].title;
    console.log("Identified:", identifiedName);

    // --- STEP 2: REAL-TIME SHOPPING SCAN ---
    const shoppingResults = await findBestPrice(identifiedName);

    let priceMin = 0;
    let priceMax = 0;
    let shopUrl = "";
    let sourceName = "Google Lens";
    let finalSources = [];

    if (shoppingResults.length > 0) {
        // Prioritize Amazon/Flipkart
        const trustedDeal = shoppingResults.find((item: any) => 
            TRUSTED_SHOPS.some(shop => item.source?.toLowerCase().includes(shop))
        );
        const bestDeal = trustedDeal || shoppingResults[0];

        shopUrl = bestDeal.link;
        sourceName = bestDeal.source;
        
        // Extract Price using deep parser
        const prices = extractPrice(bestDeal);
        priceMin = prices.min;
        priceMax = prices.max;

        // Map sources for UI
        finalSources = shoppingResults.slice(0, 5).map((item: any) => ({
            web: {
                uri: item.link,
                title: item.title,
                price: item.price // Keep original string for display (e.g. "₹1,499")
            }
        }));

    } else {
        // Fallback: If no shopping results, use Visual Link (but NO fake price)
        // We set price to 0 so the UI says "Check Price" instead of a lie.
        shopUrl = visualMatches[0].link;
        sourceName = visualMatches[0].source;
        
        finalSources = visualMatches.slice(0, 3).map((m: any) => ({
             web: { uri: m.link, title: m.title, price: "View Site" }
        }));
    }

    return {
      name: identifiedName,
      description: `Identified as ${identifiedName}. Found on ${sourceName}.`,
      priceMin: priceMin,
      priceMax: priceMax,
      currency: "₹",
      confidence: 95,
      imageUrl: imageSrc,
      shopUrl: shopUrl,
      sources: finalSources
    };

  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
}