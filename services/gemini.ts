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
  'boat-lifestyle.com',
  'samsung.com',
  'apple.com'
];

// Stores to REJECT (non-Indian/untrusted/international)
const BLOCKED_STORES = [
  'alibaba',
  'aliexpress',
  'ubuy',
  'indiamart',
  'ebay',
  'dhgate',
  'wish',
  'gearbest',
  'banggood',
  'aliexpress'
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
 * Clean product name: remove platforms, prices, variants, and critical keywords
 * "Boat Nirvana ion :: Behance" → "Boat Nirvana ion"
 * "Boat Nirvana ion Beast TWS under 1700" → "Boat Nirvana ion"
 * 
 * CRITICAL SANITIZATION: Strip out:
 * - "Review", "YouTube", "Problem", "Issue", "Unboxing"
 * - Variant separators (::, |, -)
 * - Platform names (Amazon, Flipkart, YouTube)
 * - Price markers (₹, Rs., under, etc.)
 */
function cleanProductName(rawName: string): string {
  if (!rawName) return "";

  let text = rawName.trim();

  // CRITICAL: Remove these specific words/phrases (case-insensitive)
  const criticalWords = [
    /\b(Review|YouTube|YouTube Video|Problem|Issue|Unboxing|Teardown|Leaked|Rumor|Fake|Scam)\b/gi,
  ];

  for (const pattern of criticalWords) {
    text = text.replace(pattern, "");
  }

  // Remove everything after :: (variant separator)
  text = text.split("::")[0].trim();

  // Remove everything after these keywords/patterns
  const stopPatterns = [
    /\s*[-–]\s*[a-z].*/i,
    /\s*\|.*/i,
    /\s+amazon.*/i,
    /\s+flipkart.*/i,
    /\s+price\b.*/i,
    /\s+under\b.*/i,
    /\s+₹.*/i,
    /\s+rs.*/i,
  ];

  for (const pattern of stopPatterns) {
    text = text.replace(pattern, "");
  }

  // Clean up multiple spaces
  text = text.replace(/\s+/g, " ");

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
 * Returns true ONLY if the link is from our strict whitelist
 * Returns false for Alibaba, Ubuy, IndiaMart, random international sites, etc.
 * 
 * STRICT WHITELIST APPROACH:
 * ✅ ACCEPT: amazon.in, flipkart.com, myntra.com, croma.com, etc.
 * ❌ REJECT: alibaba.com, ubuy.co.in, indiamart.com, any unlisted site
 */
function isTrustedStore(link: string): boolean {
  if (!link) return false;

  const lowerLink = link.toLowerCase();

  // CRITICAL: REJECT blocked stores IMMEDIATELY
  for (const blocked of BLOCKED_STORES) {
    if (lowerLink.includes(blocked)) {
      console.log(`❌ BLOCKED: Store contains "${blocked}" - rejecting immediately`);
      return false;
    }
  }

  // ACCEPT only if link contains a TRUSTED store domain
  for (const trusted of TRUSTED_STORES) {
    if (lowerLink.includes(trusted)) {
      console.log(`✅ ACCEPTED: Trusted store found "${trusted}"`);
      return true;
    }
  }

  // DEFAULT: REJECT unknown stores (not in our trusted list)
  console.log(`❌ REJECTED: Unknown store - not in trusted list: ${link.substring(0, 60)}...`);
  return false;
}

/**
 * Extract price from a shopping result item
 * Handles multiple formats:
 * - "₹1,799" or "Rs. 1,799" or "Rs 1799"
 * - "1,799" (plain number with comma)
 * - Range: "₹1,499–₹1,999" or "1499 - 1999"
 */
function extractPrice(item: any): { min: number; max: number } {
  const price = item.price || item.extracted_price || "";
  
  if (!price) return { min: 0, max: 0 };

  const priceStr = price.toString().trim();

  // Pattern 1: Price range "₹1499–₹1999" or "1499 - 1999"
  const rangeMatch = priceStr.match(
    /(?:₹|Rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-–—]\s*(?:₹|Rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)/
  );

  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ""), 10);
    const max = parseInt(rangeMatch[2].replace(/,/g, ""), 10);
    if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
      return { min, max };
    }
  }

  // Pattern 2: Single price "₹1,799" or "Rs. 1,799" or "1799"
  const singleMatch = priceStr.match(
    /(?:₹|Rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)\b/
  );
  
  if (singleMatch) {
    const price = parseFloat(singleMatch[1].replace(/,/g, ""));
    if (!isNaN(price) && price > 0) {
      return { min: Math.round(price), max: Math.round(price) };
    }
  }

  return { min: 0, max: 0 };
}

/**
 * MAIN FUNCTION: Identify -> Sanitize -> Strict Search -> Extract Price
 * 
 * Step 1: Visual ID (Google Lens)
 *   - Upload image to ImgBB
 *   - Use Google Lens to identify product name
 *   - CRITICAL SANITIZATION: Strip "Review", "YouTube", "Problem", "Issue", "Unboxing"
 * 
 * Step 2: Trusted Shopping Search (Google Shopping)
 *   - Search with `engine=google_shopping`, `gl=in`, `hl=en`, `currency=INR`
 *   - STRICT WHITELIST FILTERING: Only accept amazon.in, flipkart.com, etc.
 *   - BLOCK immediately: Alibaba, Ubuy, IndiaMart
 * 
 * Step 3: Find Trusted Store Result
 *   - Iterate through results
 *   - Skip any non-whitelisted stores
 *   - Select first result from trusted store
 * 
 * Step 4: Price Extraction
 *   - Extract price from trusted store result
 *   - Handle ₹, Rs., ranges, and various formats
 * 
 * Returns: ProductResult with name, priceMin, priceMax, shopUrl, currency, sourceName
 */
export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API Keys (VITE_IMGBB_API_KEY or VITE_SEARCHAPI_KEY)");
    }

    // STEP 1: Visual ID with Google Lens
    console.log("📸 STEP 1: Visual ID - Uploading image to ImgBB...");
    const publicImageUrl = await uploadToImgBB(imageSrc);
    console.log("   ✅ Image uploaded:", publicImageUrl.substring(0, 50) + "...");

    console.log("🔍 STEP 1B: Identifying product name with Google Lens...");
    const productName = await identifyProductWithLens(publicImageUrl);
    console.log(`   ✅ Identified product: "${productName}"`);

    // STEP 2: Trusted Shopping Search
    console.log("🛍️ STEP 2: Trusted Shopping Search (Google Shopping - India only)...");
    const allResults = await searchGoogleShopping(productName);
    console.log(`   📊 Found ${allResults.length} total results from Google Shopping`);

    // STEP 3: STRICT Whitelist Filtering
    console.log("🔐 STEP 3: STRICT Whitelist Filtering");
    console.log("   Looking for ONLY: Amazon, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, Boat, Samsung, Apple");
    console.log("   BLOCKING: Alibaba, Ubuy, IndiaMart, and any non-whitelisted stores");
    
    let bestDeal = null;
    let sourceName = "";
    let trustedCount = 0;
    let blockedCount = 0;

    for (const item of allResults) {
      const link = item.link || "";
      const source = item.source || "Unknown";

      // Check if this is a TRUSTED store
      if (isTrustedStore(link)) {
        if (!bestDeal) {
          bestDeal = item;
          sourceName = source;
          console.log(`   ✅ SELECTED: ${source}`);
        }
        trustedCount++;
      } else {
        // Check if it was blocked
        if (BLOCKED_STORES.some(store => link.toLowerCase().includes(store))) {
          blockedCount++;
        }
      }
    }

    console.log(`   📈 Summary: ${trustedCount} from trusted stores, ${blockedCount} blocked`);

    if (!bestDeal) {
      throw new Error(
        `❌ FAILED: No results from trusted stores (Amazon.in, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, Boat, Samsung, Apple). ` +
        `Try a different product or more common brand.`
      );
    }

    // STEP 4: Extract Price
    console.log("💰 STEP 4: Extracting price from trusted store...");
    const priceData = extractPrice(bestDeal);
    const { min: priceMin, max: priceMax } = priceData;

    if (priceMin === 0) {
      console.warn("   ⚠️ Warning: Could not extract price from this result");
      throw new Error("No price information available for this product from trusted store.");
    }

    console.log(`   ✅ Price extracted: ₹${priceMin.toLocaleString('en-IN')}`);

    const result: ProductResult = {
      name: productName,
      priceMin,
      priceMax,
      shopUrl: bestDeal.link || "",
      currency: "₹",
      sourceName,
      confidence: 90,
    };

    console.log("✅ SUCCESS: Product identification complete");
    console.log(`   Name: ${result.name}`);
    console.log(`   Price: ₹${result.priceMin.toLocaleString('en-IN')}`);
    console.log(`   Store: ${result.sourceName}`);
    console.log(`   Link: ${result.shopUrl.substring(0, 60)}...`);

    return result;
  } catch (error) {
    console.error("❌ ERROR:", error);
    throw error;
  }
}
