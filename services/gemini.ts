// services/gemini.ts
// Uses SearchApi.io (Google Lens) - INDIA PRICE FIX 🇮🇳
// Fixes "$0" bug by handling "₹" symbols and commas correctly.

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

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
  if (!data.success) throw new Error("Failed to upload image.");
  return data.data.url; 
}

export async function identifyProduct(imageSrc: string) {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) throw new Error("Missing API Keys.");

    // 1. Upload
    const publicImageUrl = await uploadToImgBB(imageSrc);

    // 2. Search
    const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
    searchUrl.searchParams.append("engine", "google_lens");
    searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    searchUrl.searchParams.append("url", publicImageUrl); 
    searchUrl.searchParams.append("gl", "in"); // India
    searchUrl.searchParams.append("hl", "en"); 
    searchUrl.searchParams.append("q", "price"); // Force price in results

    const response = await fetch(searchUrl.toString());
    const data = await response.json();

    if (data.error) throw new Error(data.error);

    // 3. DEBUG: Check what we actually got
    console.log("API RESULTS:", data.visual_matches);

    // 4. FIND PRICE
    const visualMatches = data.visual_matches || [];
    let bestMatch: any = null;

    // Filter A: Must have price
    const matchesWithPrice = visualMatches.filter((m: any) => m.price);

    // Filter B: Prefer Trusted Store
    const trustedMatch = matchesWithPrice.find((m: any) => 
        TRUSTED_SHOPS.some(shop => m.source?.toLowerCase().includes(shop))
    );

    // Select the winner (Trusted -> Any Price -> Top Result)
    bestMatch = trustedMatch || matchesWithPrice[0] || visualMatches[0];

    // 5. PARSE DATA
    let productName = "Unidentified Item";
    let priceMin = 0;
    let shopUrl = "";
    let sourceName = "Web";

    if (bestMatch) {
        productName = bestMatch.title;
        shopUrl = bestMatch.link;
        sourceName = bestMatch.source;

        if (bestMatch.price) {
            // Get raw string (e.g. "₹1,299.00" or "Rs. 450")
            const rawString = bestMatch.price.value || bestMatch.price.raw || bestMatch.price.extracted_value;
            console.log("Raw Price Found:", rawString); // Debug log

            if (rawString) {
                // CLEANUP: 
                // 1. Remove commas (1,299 -> 1299)
                // 2. Remove non-digits/dots
                const cleanString = rawString.toString().replace(/,/g, '').replace(/[^0-9.]/g, '');
                priceMin = parseFloat(cleanString);
            }
        }
    }

    // Safety: If parsing failed (NaN), set to 0
    if (isNaN(priceMin)) priceMin = 0;

    return {
      name: productName,
      description: `Found on ${sourceName}`,
      priceMin: priceMin,
      priceMax: priceMin,
      currency: "₹", // Force Frontend to show Rupee
      confidence: bestMatch ? 90 : 0,
      imageUrl: imageSrc,
      shopUrl: shopUrl || publicImageUrl,
      sources: matchesWithPrice.slice(0, 3).map((match: any) => ({
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