// services/gemini.ts
// Scan & Price: Product Identification + Price Discovery
// 2-Step Process with STRICT Trusted Store Filtering
// 
// Step 1: Use Google Lens to identify product name from image
// Step 2: Use Google Shopping to find prices ONLY from trusted Indian stores
// 
// TRUSTED STORES ONLY: Amazon, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, etc.
// NO Alibaba, Ubuy, or random international sites

interface ProductResult {
  name: string;
  priceMin: number;
  priceMax: number;
  shopUrl: string;
  currency: string;
  sourceName: string;
  confidence: number;
}

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

// STRICT: Only these trusted Indian e-commerce stores
const TRUSTED_STORES = [
  'amazon.in',
  'flipkart.com',
  'myntra.com',
  'croma.com',
  'reliance.com',
  'tatacliq.com',
  'ajio.com',
  'meesho.com',
  'boat-lifestyle.com',
  'samsung.com',
  'apple.com',
  'oneplus.com',
  'realme.com'
];

// Stores to REJECT (non-Indian/untrusted)
const BLOCKED_STORES = [
  'alibaba',
  'aliexpress',
  'ebay',
  'ubuy',
  'dhgate',
  'wish',
  'gearbest',
  'banggood'
];

/**
 * Step 0: Upload image to ImgBB and get public URL
 */
async function uploadToImgBB(base64Image: string): Promise<string> {
  const formData = new FormData();
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
  formData.append("image", cleanBase64);

  const response = await fetch(
    `https://api.imgbb.com/1/upload?expiration=600&key=${IMGBB_API_KEY}`,
    {
      method: "POST",
      body: formData,
    }
  );

  const data = await response.json();
  if (!data.success) throw new Error("Failed to upload image to ImgBB.");
  return data.data.url;
}

/**
 * Step 1: Use Google Lens to visually identify product name
 */
async function identifyProductWithLens(publicImageUrl: string): Promise<string> {
  const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
  lensUrl.searchParams.append("engine", "google_lens");
  lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  lensUrl.searchParams.append("url", publicImageUrl);
  lensUrl.searchParams.append("gl", "in");

  const response = await fetch(lensUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Google Lens Error: ${data.error}`);

  const visualMatches = data.visual_matches || [];
  if (visualMatches.length === 0) {
    throw new Error("Could not visually identify product.");
  }

  const rawTitle = visualMatches[0].title || "Unknown Product";
  const cleanName = cleanProductName(rawTitle);
  
  console.log(`🔍 Identified: "${cleanName}"`);
  return cleanName;
}

/**
 * Clean product name: remove platforms, prices, variants
 * "Boat Nirvana ion :: Behance" → "Boat Nirvana ion"
 * "Boat Nirvana ion Beast TWS under 1700" → "Boat Nirvana ion"
 */
function cleanProductName(rawName: string): string {
  if (!rawName) return "";

  let text = rawName.trim();

  // Remove everything after :: (variant separator)
  text = text.split("::")[0].trim();

  // Remove everything after these keywords
  const stopPatterns = [
    /\s*[-–]\s*[a-z].*/i,
    /\s*\|.*/i,
    /\s+youtube\b.*/i,
    /\s+amazon.*/i,
    /\s+flipkart.*/i,
    /\s+price\b.*/i,
    /\s+review\b.*/i,
    /\s+under\b.*/i,
    /\s+₹.*/i,
    /\s+rs.*/i,
  ];

  for (const pattern of stopPatterns) {
    text = text.replace(pattern, "");
  }

  // Keep only first 2-4 meaningful words (brand + model)
  const words = text.trim().split(/\s+/);
  const meaningful = words.slice(0, 4).filter(w => !/^\d+$/.test(w));

  return meaningful.join(" ").trim() || rawName;
}

/**
 * Step 2: Search Google Shopping for the product in India
 * Returns ALL results (we'll filter for trusted stores next)
 */
async function searchGoogleShopping(productName: string): Promise<any[]> {
  const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
  searchUrl.searchParams.append("engine", "google_shopping");
  searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  searchUrl.searchParams.append("q", productName);
  searchUrl.searchParams.append("gl", "in"); // India
  searchUrl.searchParams.append("hl", "en");
  searchUrl.searchParams.append("currency", "INR");
  searchUrl.searchParams.append("num", "20");

  const response = await fetch(searchUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Shopping Search Error: ${data.error}`);
  return data.shopping_results || [];
}

/**
 * CRITICAL: Check if a store link is from a TRUSTED Indian store
 * Returns true ONLY if the link is from our trusted list
 * Returns false for Alibaba, Ubuy, random international sites, etc.
 */
function isTrustedStore(link: string): boolean {
  if (!link) return false;

  const lowerLink = link.toLowerCase();

  // REJECT blocked stores immediately
  for (const blocked of BLOCKED_STORES) {
    if (lowerLink.includes(blocked)) {
      console.log(`❌ Blocked store detected: ${blocked}`);
      return false;
    }
  }

  // ACCEPT only trusted stores
  for (const trusted of TRUSTED_STORES) {
    if (lowerLink.includes(trusted)) {
      console.log(`✅ Trusted store found: ${trusted}`);
      return true;
    }
  }

  console.log(`⚠️ Unknown store (not trusted): ${link.substring(0, 50)}`);
  return false;
}

/**
 * Extract price from a shopping result item
 * Handles: "₹1,799", "Rs. 1,799", "1799", ranges like "1499-1999"
 */
function extractPrice(item: any): { min: number; max: number } {
  const price = item.price || item.extracted_price || "";
  
  if (!price) return { min: 0, max: 0 };

  const priceStr = price.toString().trim();

  // Try to match price range: "₹1499-₹1999" or "1499 - 1999"
  const rangeMatch = priceStr.match(
    /(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*)\s*[-–]\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*)/i
  );

  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
    const max = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max };
    }
  }

  // Try single price: "₹1,799" or "Rs. 1,799"
  const singleMatch = priceStr.match(/(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*(?:\.\d{2})?)/);
  
  if (singleMatch) {
    const price = parseFloat(singleMatch[1].replace(/,/g, ""));
    if (!isNaN(price) && price > 0) {
      return { min: Math.round(price), max: Math.round(price) };
    }
  }

  return { min: 0, max: 0 };
}

/**
 * MAIN FUNCTION: Scan product and find lowest price from TRUSTED stores only
 */
export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API Keys");
    }

    console.log("📸 Step 0: Uploading image to ImgBB...");
    const publicImageUrl = await uploadToImgBB(imageSrc);

    console.log("🔍 Step 1: Identifying product with Google Lens...");
    const productName = await identifyProductWithLens(publicImageUrl);

    console.log("🛍️ Step 2: Searching Google Shopping (India)...");
    const allResults = await searchGoogleShopping(productName);
    console.log(`   Found ${allResults.length} total results`);

    console.log("🔐 Step 3: STRICT filtering - only TRUSTED stores");
    // CRITICAL: Find the FIRST result from a trusted store
    // Skip all Alibaba, Ubuy, and untrusted sites
    let bestDeal = null;
    let sourceName = "";
    let trustedCount = 0;

    for (const item of allResults) {
      const link = item.link || "";
      const source = item.source || "Unknown";

      // Check if this is a trusted store
      if (isTrustedStore(link)) {
        if (!bestDeal) {
          bestDeal = item;
          sourceName = source;
          console.log(`   ✅ Selected: ${source}`);
        }
        trustedCount++;
      }
    }

    console.log(`   📊 Found ${trustedCount} results from trusted stores`);

    if (!bestDeal) {
      throw new Error("No results from TRUSTED stores (Amazon, Flipkart, etc.) found. Try a different product.");
    }

    console.log("💰 Step 4: Extracting price...");
    const priceData = extractPrice(bestDeal);
    const { min: priceMin, max: priceMax } = priceData;

    if (priceMin === 0) {
      console.warn("⚠️ Warning: Could not extract valid price");
    } else {
      console.log(`   💵 Price: ₹${priceMin.toLocaleString('en-IN')}`);
    }

    return {
      name: productName,
      priceMin,
      priceMax,
      shopUrl: bestDeal.link || "",
      currency: "₹",
      sourceName,
      confidence: 95,
    };
  } catch (error) {
    console.error("❌ Error:", error);
    throw error;
  }
}
