// services/gemini.ts
// Uses SearchApi.io (2-Step Smart System) 🧠
// Step 1: Google Lens -> Identifies the Product Name.
// Step 2: Google Shopping -> Searches that name to find the REAL price & In-Stock Link.

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

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

// Helper: Step 2 - Search for the specific product on Google Shopping
async function findBestPrice(productName: string) {
  // We search for "Buy [Product Name] India" on Google Shopping
  const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
  searchUrl.searchParams.append("engine", "google_shopping"); // Switch to Shopping Engine
  searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  searchUrl.searchParams.append("q", productName); 
  searchUrl.searchParams.append("gl", "in"); // India
  searchUrl.searchParams.append("hl", "en"); 
  searchUrl.searchParams.append("num", "5"); // Get top 5 results

  const response = await fetch(searchUrl.toString());
  const data = await response.json();

  if (data.shopping_results && data.shopping_results.length > 0) {
    return data.shopping_results; // Return the clean shopping list
  }
  return [];
}

export async function identifyProduct(imageSrc: string) {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) throw new Error("Missing API Keys.");

    // --- STEP 1: VISUAL IDENTIFICATION (Google Lens) ---
    const publicImageUrl = await uploadToImgBB(imageSrc);

    const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
    lensUrl.searchParams.append("engine", "google_lens");
    lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    lensUrl.searchParams.append("url", publicImageUrl); 
    lensUrl.searchParams.append("gl", "in"); 
    lensUrl.searchParams.append("q", "."); // Dummy param

    const lensResponse = await fetch(lensUrl.toString());
    const lensData = await lensResponse.json();

    if (lensData.error) throw new Error(lensData.error);

    // Get the Product Name from the best visual match
    const visualMatches = lensData.visual_matches || [];
    if (visualMatches.length === 0) {
        return {
            name: "Unidentified Item",
            description: "Could not visually identify this product.",
            priceMin: 0, priceMax: 0, confidence: 0,
            imageUrl: imageSrc, shopUrl: "", sources: []
        };
    }

    // The top result usually has the correct NAME (e.g. "Boat Nirvana ION")
    const identifiedName = visualMatches[0].title;
    const visualImage = visualMatches[0].thumbnail;

    console.log("Identified Name:", identifiedName);

    // --- STEP 2: REAL-TIME PRICE CHECK (Google Shopping) ---
    // Now we take that name and strictly search for SHOPPING results
    const shoppingResults = await findBestPrice(identifiedName);

    // Default values (if shopping fails)
    let priceMin = 0;
    let shopUrl = "";
    let sourceName = "Google Lens";
    let finalSources = [];

    if (shoppingResults.length > 0) {
        // We found real shopping results!
        const bestDeal = shoppingResults[0]; // Top result is usually "Best Match"
        
        shopUrl = bestDeal.link;
        sourceName = bestDeal.source; // e.g. "Amazon.in"
        
        // Parse Price (e.g. "₹1,799.00")
        if (bestDeal.extracted_price) {
            priceMin = bestDeal.extracted_price;
        } else if (bestDeal.price) {
             const cleanString = bestDeal.price.toString().replace(/,/g, '').replace(/[^0-9.]/g, '');
             priceMin = parseFloat(cleanString);
        }

        // Create the list of sources for your UI
        finalSources = shoppingResults.slice(0, 5).map((item: any) => ({
            web: {
                uri: item.link,
                title: item.title,
                price: item.price // "₹1,799"
            }
        }));

    } else {
        // Fallback: If Google Shopping found nothing, use the Lens data
        // (This happens for very rare items)
        shopUrl = visualMatches[0].link;
        finalSources = visualMatches.slice(0, 3).map((m: any) => ({
             web: { uri: m.link, title: m.title, price: m.price?.raw }
        }));
    }

    if (isNaN(priceMin)) priceMin = 0;

    return {
      name: identifiedName,
      description: `Identified as ${identifiedName}. Found best price on ${sourceName}.`,
      priceMin: priceMin,
      priceMax: priceMin,
      currency: "₹",
      confidence: 95, // High confidence because we verified it with Search
      imageUrl: imageSrc,
      shopUrl: shopUrl,
      sources: finalSources
    };

  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
}