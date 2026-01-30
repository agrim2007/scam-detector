// services/gemini.ts
// Uses SearchApi.io (2-Step Smart System) with Deep Price Parser 🧠
// Robustly extracts prices from complex nested API responses.
// Handles price ranges, multiple formats (₹, Rs., INR), and various field structures.

interface PriceResult {
  min: number;
  max: number;
  original: string;
  confidence: number;
}

interface ProductResult {
  name: string;
  priceMin: number;
  priceMax: number;
  shopUrl: string;
  currency: string;
  confidence: number;
  imageUrl?: string;
  sources: Array<{
    web: {
      uri: string;
      title: string;
      price: string;
    };
  }>;
}

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

// Trusted stores in India
const TRUSTED_SHOPS = [
  'amazon', 'flipkart', 'myntra', 'croma', 'reliance', 'tatacliq',
  'meesho', 'ajio', 'boat', 'samsung', 'apple', 'oneplus', 'realme'
];

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
 * Aggressively clean product name by:
 * 1. Finding and extracting ONLY the core product identifier
 * 2. Removing ALL noise: platforms, prices, keywords, separators
 * 3. Extracting just the brand + model (first few meaningful words)
 * 
 * Example: "Boat Nirvana ion Beast TWS under 1700/-- YouTube" → "Boat Nirvana ion"
 * Example: "boAt Nirvana ion :: Behance" → "boAt Nirvana ion"
 */
function cleanProductName(rawName: string): string {
  if (!rawName) return "";

  let text = rawName.trim();

  // PASS 0: Remove everything after double colons "::" (variant separator)
  text = text.split("::")[0].trim();

  // PASS 1: Remove everything after these keywords/patterns (aggressive)
  const cutOffPatterns = [
    /\s*[-–]\s*[a-z].*$/i,  // " - anything" (treat dash as separator)
    /\s*\|\s*.*$/i,         // " | anything" (pipe separator)
    /\s*[()]\s*.*$/i,       // " ( anything"
    /\s+youtube\b.*$/i,
    /\s+amazon.*$/i,
    /\s+flipkart.*$/i,
    /\s+behance.*$/i,
    /\s+price\b.*$/i,
    /\s+review\b.*$/i,
    /\s+unboxing\b.*$/i,
    /\s+best\b.*$/i,
    /\s+under\b.*$/i,
    /\s+₹.*$/i,
    /\s+rs[.,]?.*$/i,
    /\s+inr.*$/i,
    /\s+usd.*$/i,
    /\d+\s*\/\s*[-–].*$/,  // "number/--" patterns
  ];

  for (const pattern of cutOffPatterns) {
    text = text.replace(pattern, "");
  }

  // PASS 2: Extract only brand + meaningful words (stop at noise)
  // Keep only the first 3-4 meaningful words (brand + 2-3 model words)
  const words = text.trim().split(/\s+/);
  const meaningfulWords = [];
  
  for (let i = 0; i < words.length && meaningfulWords.length < 4; i++) {
    const word = words[i];
    
    // Skip pure numbers, symbols, price indicators
    if (/^\d+$/.test(word)) continue;  // Skip pure numbers
    if (/^[₹$]/.test(word)) continue;  // Skip currency
    if (/^(under|below|from|at|price|review|unboxing|youtube|behance|edition|variant|model|v\d+)$/i.test(word)) break; // Stop here
    
    meaningfulWords.push(word);
  }

  const cleaned = meaningfulWords.join(" ").trim();

  // If we got something reasonable (at least brand + 1 word), return it
  if (cleaned.length >= 5 && cleaned.split(" ").length >= 2) {
    return cleaned;
  }

  // Final fallback: just return the text as-is trimmed
  return text.trim() || rawName;
}

// Step 1: Visual identification using Google Lens
async function identifyProductVisually(publicImageUrl: string): Promise<string> {
  const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
  lensUrl.searchParams.append("engine", "google_lens");
  lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  lensUrl.searchParams.append("url", publicImageUrl);
  lensUrl.searchParams.append("gl", "in");
  lensUrl.searchParams.append("q", ".");

  const lensResponse = await fetch(lensUrl.toString());
  const lensData = await lensResponse.json();

  if (lensData.error) throw new Error(`Google Lens Error: ${lensData.error}`);

  const visualMatches = lensData.visual_matches || [];
  if (visualMatches.length === 0) {
    throw new Error("Could not visually identify product from image.");
  }

  const rawTitle = visualMatches[0].title || "Unknown Product";
  const cleanedName = cleanProductName(rawTitle);
  
  console.log(`Raw title: "${rawTitle}"`);
  console.log(`Cleaned name: "${cleanedName}"`);

  return cleanedName;
}

// Step 2: Search for prices on Google Shopping (India market)
async function findBestPrice(productName: string): Promise<any[]> {
  const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
  searchUrl.searchParams.append("engine", "google_shopping");
  searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  searchUrl.searchParams.append("q", productName);
  searchUrl.searchParams.append("gl", "in"); // India
  searchUrl.searchParams.append("hl", "en");
  searchUrl.searchParams.append("currency", "INR");
  searchUrl.searchParams.append("num", "20"); // Get more results for better filtering

  const response = await fetch(searchUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Shopping Search Error: ${data.error}`);

  const allResults = data.shopping_results || [];
  
  // Filter results: only keep Indian results with INR prices
  const indianResults = allResults.filter((item: any) => isIndianResult(item));
  
  console.log(`🌍 Geographic filter: ${indianResults.length}/${allResults.length} results are from India`);

  return indianResults.length > 0 ? indianResults : allResults; // Fallback to all if no Indian results
}

/**
 * Detect currency type from price string
 * Returns: 'INR', 'USD', 'EUR', or 'UNKNOWN'
 */
function detectCurrency(priceStr: string): string {
  if (!priceStr) return "UNKNOWN";

  const lower = priceStr.toLowerCase();

  // INR indicators
  if (/₹|rs\.?|inr|rupee/i.test(priceStr)) return "INR";

  // USD indicators
  if (/\$|usd|dollar/i.test(priceStr)) return "USD";

  // EUR indicators
  if (/€|eur|euro/i.test(priceStr)) return "EUR";

  // GBP indicators
  if (/£|gbp|pound/i.test(priceStr)) return "GBP";

  return "UNKNOWN";
}

/**
 * Check if a result is from India (by domain and currency)
 * Returns true only if:
 * - Link is from Indian domain (.in, amazon.in, flipkart.in, etc.)
 * - OR price is in INR
 * Returns false if:
 * - Price is in foreign currency (€, $, £)
 * - Link is from non-Indian domain
 */
function isIndianResult(item: any): boolean {
  if (!item) return false;

  const link = (item.link || "").toLowerCase();
  const priceStr = (item.price || "").toString();
  const title = (item.title || "").toLowerCase();

  // Check for non-Indian currencies (strong negative indicator)
  const currency = detectCurrency(priceStr);
  if (currency === "USD" || currency === "EUR" || currency === "GBP") {
    return false; // Reject foreign currencies
  }

  // Check for Indian domain patterns
  const indianDomains = [
    ".in/",           // .in domain
    "amazon.in",      // Amazon India
    "flipkart.com",   // Flipkart (primary India)
    "flipkart.in",
    "myntra.com",     // Myntra
    "ajio.com",       // AJIO
    "croma.com",      // Croma
    "reliance.com",   // Reliance
    "meesho.com",     // Meesho
    "shopsy.in",      // Shopsy
  ];

  const hasIndianDomain = indianDomains.some((domain) => link.includes(domain));

  // Check for non-Indian domains (strong negative)
  const nonIndianDomains = [
    ".sk/",          // Slovakia
    ".cz/",          // Czech
    ".eu",           // Europe
    ".de",           // Germany
    ".fr",           // France
    ".uk",           // UK
    ".us",           // USA
    ".com.br",       // Brazil
    "ebay.",         // eBay (usually international)
  ];

  const hasNonIndianDomain = nonIndianDomains.some((domain) => link.includes(domain));

  // If has non-Indian domain, reject it
  if (hasNonIndianDomain) {
    return false;
  }

  // Prefer Indian domains, but accept if has INR price
  if (hasIndianDomain) {
    return true;
  }

  // Accept if explicitly has INR in price
  if (currency === "INR") {
    return true;
  }

  // If no explicit indicator, reject to be safe
  return false;
}

/**
 * DEEP PRICE PARSER: Aggressively extracts price from ANY field
 * - Handles nested objects recursively
 * - Extracts from detected_values, extracted_price, price, and custom fields
 * - Parses price ranges (₹1499-₹1999 → min: 1499, max: 1999)
 * - Cleans various formats: "Rs. 1,799", "INR 1799.00", "₹ 1,799"
 * - Returns lowest price found with confidence score
 */
function extractPriceDeep(item: any, visited = new Set<any>()): PriceResult {
  const result: PriceResult = {
    min: 0,
    max: 0,
    original: "",
    confidence: 0,
  };

  if (!item || typeof item !== "object" || visited.has(item)) {
    return result;
  }
  visited.add(item);

  // List of field names to check in priority order
  const fieldNames = [
    "extracted_price",
    "price",
    "detected_price",
    "detected_values",
    "amount",
    "value",
    "priceAmount",
    "pricing",
    "cost",
    "rate",
  ];

  // Priority 1: Direct numeric fields
  for (const field of fieldNames) {
    if (field in item && typeof item[field] === "number" && item[field] > 0) {
      result.min = Math.round(item[field]);
      result.max = result.min;
      result.original = item[field].toString();
      result.confidence = 95;
      return result;
    }
  }

  // Priority 2: String fields (with cleaning)
  for (const field of fieldNames) {
    if (field in item && typeof item[field] === "string") {
      const cleaned = cleanAndParsePriceString(item[field]);
      if (cleaned.min > 0) {
        result.min = cleaned.min;
        result.max = cleaned.max;
        result.original = item[field];
        result.confidence = 85;
        return result;
      }
    }
  }

  // Priority 3: Nested objects (detected_values is usually an array)
  if (item.detected_values && Array.isArray(item.detected_values)) {
    for (const value of item.detected_values) {
      if (value && typeof value === "object") {
        const nested = extractPriceDeep(value, visited);
        if (nested.min > 0) {
          result.min = nested.min;
          result.max = nested.max;
          result.original = nested.original;
          result.confidence = 80;
          return result;
        }
      } else if (typeof value === "string") {
        const cleaned = cleanAndParsePriceString(value);
        if (cleaned.min > 0) {
          result.min = cleaned.min;
          result.max = cleaned.max;
          result.original = value;
          result.confidence = 80;
          return result;
        }
      }
    }
  }

  // Priority 4: Recursively search ALL object values
  for (const key in item) {
    if (Object.prototype.hasOwnProperty.call(item, key) && !visited.has(item[key])) {
      const value = item[key];

      // Skip common non-price fields
      if (
        [
          "id",
          "title",
          "link",
          "source",
          "image",
          "rating",
          "reviews",
          "url",
          "snippet",
          "description",
        ].includes(key.toLowerCase())
      ) {
        continue;
      }

      if (typeof value === "object") {
        const nested = extractPriceDeep(value, visited);
        if (nested.min > 0) {
          result.min = nested.min;
          result.max = nested.max;
          result.original = nested.original;
          result.confidence = Math.max(0, nested.confidence - 5); // Slight confidence penalty for deep nesting
          return result;
        }
      } else if (typeof value === "string" && value.length < 100) {
        // Check strings that might contain prices
        const cleaned = cleanAndParsePriceString(value);
        if (cleaned.min > 0) {
          result.min = cleaned.min;
          result.max = cleaned.max;
          result.original = value;
          result.confidence = 70;
          return result;
        }
      }
    }
  }

  return result;
}

/**
 * Clean and parse price strings in various formats:
 * "₹1,799" → 1799
 * "Rs. 1,799" → 1799
 * "INR 1799.00" → 1799
 * "1499-1999" → { min: 1499, max: 1999 }
 * "₹1,499 - ₹1,999" → { min: 1499, max: 1999 }
 */
function cleanAndParsePriceString(str: string): { min: number; max: number } {
  const result = { min: 0, max: 0 };

  if (!str || typeof str !== "string") return result;

  // Remove extra whitespace
  str = str.trim();

  // Check for "Out of Stock" or similar (but don't fail completely)
  if (/out\s+of\s+stock|unavailable|discontinued/i.test(str)) {
    return result;
  }

  // Detect price ranges: "₹1499-₹1999" or "1499 - 1999"
  const rangeMatch = str.match(
    /(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*(?:\.\d{2})?)\s*[-–]\s*(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*(?:\.\d{2})?)/i
  );

  if (rangeMatch) {
    const min = parseFloat(rangeMatch[1].replace(/,/g, ""));
    const max = parseFloat(rangeMatch[2].replace(/,/g, ""));
    if (!isNaN(min) && !isNaN(max) && min > 0) {
      result.min = Math.round(min);
      result.max = Math.round(max);
      return result;
    }
  }

  // Single price: "₹1,799" or "Rs. 1,799" or "1799"
  const singleMatch = str.match(/(?:₹|Rs\.?|INR)?\s*(\d+(?:,?\d+)*(?:\.\d{2})?)/);

  if (singleMatch) {
    const price = parseFloat(singleMatch[1].replace(/,/g, ""));
    if (!isNaN(price) && price > 0) {
      result.min = Math.round(price);
      result.max = Math.round(price);
      return result;
    }
  }

  return result;
}

/**
 * Check if a product is in stock by examining multiple fields
 * Returns true if product appears to be in stock
 * NOTE: Only returns FALSE for strong negative indicators
 * Defaults to TRUE for items with valid prices (to avoid false "out of stock" reports)
 */
function isProductInStock(item: any): boolean {
  if (!item) return false;

  // Check for explicit stock status fields
  const stockFields = [
    "availability",
    "in_stock",
    "stock_status",
    "status",
    "inStock",
    "stockStatus",
  ];

  // Track if we found explicit stock info
  let foundExplicitStatus = false;

  for (const field of stockFields) {
    if (field in item) {
      const value = item[field];
      foundExplicitStatus = true;

      if (typeof value === "boolean") {
        return value === true;
      }
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (/in\s+stock|available|in\s+hand|ready/.test(lower)) return true;
        if (/out\s+of\s+stock|unavailable|discontinued|out|sold\s+out/.test(lower))
          return false;
      }
    }
  }

  // Check title and price for stock keywords
  const fullText = `${(item.title || "")} ${(item.price || "")} ${(item.snippet || "")}`.toLowerCase();

  // Strong negative indicators ONLY (very strict)
  if (/\b(out\s+of\s+stock|sold\s+out|unavailable)\b/.test(fullText)) {
    return false;
  }

  // If we have a valid price, assume it's in stock (APIs don't usually return prices for out-of-stock items)
  const priceData = extractPriceDeep(item);
  if (priceData.min > 0) {
    return true;
  }

  // If no explicit status was found and no price, default to true (lenient approach)
  return !foundExplicitStatus;
}

/**
 * Score a result based on: PRICE (most important), title match, location (India), and trusted shop
 * Higher score = better result
 * PRIORITY: Price > Location (India) > Title Match > Trusted Shop > Stock Status
 */
function scoreResult(
  item: any,
  identifiedName: string,
  isTrustedShop: boolean
): number {
  let score = 0;

  // Geographic location: +80 points bonus for India-based results (CRITICAL!)
  if (isIndianResult(item)) {
    score += 80;
  } else {
    score -= 100; // HEAVY penalty for non-Indian results
  }

  // Price availability: +100 points max (HIGHEST PRIORITY!)
  const priceData = extractPriceDeep(item);
  if (priceData.min > 0) {
    score += 100;  // Massive bonus for having a valid price
    
    // Extra bonus for high-confidence price extraction
    if (priceData.confidence >= 90) {
      score += 20;
    } else if (priceData.confidence >= 80) {
      score += 10;
    }
  } else {
    score -= 50; // Heavy penalty for no price
  }

  // Title match: +30 points max (SECOND PRIORITY)
  const titleScore = calculateTitleMatchScore(identifiedName, item.title || "");
  score += (titleScore / 100) * 30;

  // Trusted shop: +20 points bonus (THIRD PRIORITY)
  if (isTrustedShop) {
    score += 20;
  }

  // Stock status: +10 points (LOWEST PRIORITY - only if we have a price)
  if (priceData.min > 0) {
    if (isProductInStock(item)) {
      score += 10;
    } else {
      score -= 5; // Small penalty for out of stock, but not disqualifying
    }
  }

  return score;
}

/**
 * Validate that a search result title matches the identified product name
 * Returns a match score (0-100): 100 = perfect match, 0 = no match
 * This prevents picking links for similar but different products
 */
function calculateTitleMatchScore(identifiedName: string, resultTitle: string): number {
  if (!resultTitle) return 0;

  const identified = identifiedName.toLowerCase().trim();
  const result = resultTitle.toLowerCase().trim();

  // Exact match
  if (identified === result) return 100;

  // Extract key words (brand + model/variant)
  // e.g., "Boat Nirvana ION" → ["boat", "nirvana", "ion"]
  const identifiedWords = identified.split(/\s+/).filter((w) => w.length > 2);
  const resultWords = result.split(/\s+/).filter((w) => w.length > 2);

  // Count how many key words from identified product are in the result
  const matchedWords = identifiedWords.filter((word) =>
    resultWords.some((rw) => rw.includes(word) || word.includes(rw))
  );

  // Must match at least the brand (first word) and something else, or have 80%+ word match
  const matchRatio = matchedWords.length / identifiedWords.length;

  // Very strict: at least 2 key components must match
  if (matchedWords.length < 2) return 0;

  // 100% word match
  if (matchRatio >= 1) return 95;

  // 75%+ word match
  if (matchRatio >= 0.75) return 85;

  // 50%+ word match
  if (matchRatio >= 0.5) return 70;

  return 0;
}

/**
 * Main function: Identify product and find its lowest price in India
 * 1. Upload image to ImgBB
 * 2. Use Google Lens to identify product name
 * 3. Search for prices on Google Shopping (India, INR)
 * 4. Deep parse prices from complex API responses
 */
export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API Keys: VITE_IMGBB_API_KEY and VITE_SEARCHAPI_KEY");
    }

    // --- STEP 1: UPLOAD IMAGE TO IMGBB ---
    console.log("📸 Uploading image to ImgBB...");
    const publicImageUrl = await uploadToImgBB(imageSrc);
    console.log("✅ Image uploaded:", publicImageUrl);

    // --- STEP 2: VISUAL IDENTIFICATION (GOOGLE LENS) ---
    console.log("🔍 Identifying product visually...");
    const identifiedName = await identifyProductVisually(publicImageUrl);
    console.log("✅ Identified:", identifiedName);

    // --- STEP 3: SEARCH FOR PRICES (GOOGLE SHOPPING) ---
    console.log("💰 Searching for prices in India...");
    const shoppingResults = await findBestPrice(identifiedName);
    console.log(`✅ Found ${shoppingResults.length} results`);

    // --- STEP 4: EXTRACT BEST PRICE WITH DEEP PARSER ---
    let priceMin = 0;
    let priceMax = 0;
    let shopUrl = "";
    let sourceName = "Unknown";
    let finalSources: Array<{ web: { uri: string; title: string; price: string } }> = [];

    if (shoppingResults.length > 0) {
      // Step 1: Filter for title-matching results (less strict - accept 50%+ matches)
      const matchedResults = shoppingResults
        .map((item: any) => ({
          item,
          matchScore: calculateTitleMatchScore(identifiedName, item.title || ""),
        }))
        .filter((x) => x.matchScore > 0) // Keep any match
        .sort((a, b) => b.matchScore - a.matchScore)
        .map((x) => x.item);

      console.log(`🔍 Title matching: ${matchedResults.length}/${shoppingResults.length} results match the identified product`);

      // Use matched results if we have them, otherwise use all
      const resultsToScore = matchedResults.length > 0 ? matchedResults : shoppingResults;

      // Step 2: Score all results (PRIORITIZES: India location > Price > Title > Shop)
      const scoredResults = resultsToScore
        .map((item: any) => {
          const isTrusted = TRUSTED_SHOPS.some((shop) =>
            item.source?.toLowerCase().includes(shop) ||
            item.link?.toLowerCase().includes(shop)
          );
          const priceData = extractPriceDeep(item);
          const isIndian = isIndianResult(item);
          const currency = detectCurrency(item.price || "");
          
          return {
            item,
            score: scoreResult(item, identifiedName, isTrusted),
            inStock: isProductInStock(item),
            hasPrice: priceData.min > 0,
            price: priceData.min,
            trusted: isTrusted,
            isIndian,
            currency,
          };
        })
        .sort((a, b) => b.score - a.score); // Sort by best score

      // Step 3: Separate items with prices vs without
      const resultsWithPrice = scoredResults.filter((r) => r.hasPrice);
      const resultsWithoutPrice = scoredResults.filter((r) => !r.hasPrice);

      // Step 3b: Further separate Indian results with prices
      const indianWithPrice = resultsWithPrice.filter((r) => r.isIndian);
      const nonIndianWithPrice = resultsWithPrice.filter((r) => !r.isIndian);

      console.log(`📊 Results breakdown:`);
      console.log(`   🇮🇳 Indian results with INR price: ${indianWithPrice.length}`);
      console.log(`   🌍 Non-Indian results with other currency: ${nonIndianWithPrice.length}`);
      console.log(`   ❌ No price: ${resultsWithoutPrice.length}`);
      
      console.log("📊 Top 3 results by score:");
      scoredResults.slice(0, 3).forEach((r, idx) => {
        const location = r.isIndian ? "🇮🇳 India" : "🌍 Other";
        console.log(
          `  ${idx + 1}. Score: ${r.score.toFixed(1)} | ${location} | Currency: ${r.currency} | Price: ${
            r.hasPrice ? `✅ ₹${r.price}` : "❌"
          } | ${r.item.title?.substring(0, 40)}`
        );
      });

      // PRIORITY: Always prefer Indian results with prices over non-Indian ones
      const bestDeal = indianWithPrice[0]?.item || resultsWithPrice[0]?.item || scoredResults[0]?.item;

      if (!bestDeal) {
        throw new Error("No valid products found after scoring.");
      }

      // Step 4: Extract price using aggressive deep parser
      const priceData = extractPriceDeep(bestDeal);
      priceMin = priceData.min;
      priceMax = priceData.max;
      shopUrl = bestDeal.link || "";
      sourceName = bestDeal.source || "Google Shopping";

      console.log(`💵 Price extracted: ₹${priceMin}-₹${priceMax} from ${sourceName}`);
      console.log(`📍 Product link: ${shopUrl}`);
      console.log(`✅ In Stock: ${isProductInStock(bestDeal)}`);

      // Step 5: Build sources list - PRIORITIZE INDIAN RESULTS WITH PRICES
      // First priority: Indian results with prices
      const prioritySources = indianWithPrice.map((r) => r.item).slice(0, 5);
      
      // Second priority: All results with prices (including non-Indian as fallback)
      const fallbackSources = resultsWithPrice
        .filter((r) => !prioritySources.some((p) => p === r.item))
        .map((r) => r.item)
        .slice(0, 3);

      // Combine: prioritize Indian, then add other results
      const sourcesToShow = [...prioritySources, ...fallbackSources];

      console.log(`ℹ️ Showing ${sourcesToShow.length} store options (${prioritySources.length} from India, ${fallbackSources.length} other)`);
      
      finalSources = sourcesToShow.map((item: any) => {
        let priceStr = item.price || "";
        if (!priceStr && item.extracted_price) {
          priceStr = `₹${item.extracted_price}`;
        }
        if (!priceStr) {
          const deepPrice = extractPriceDeep(item);
          if (deepPrice.min > 0) {
            priceStr = `₹${deepPrice.min}`;
            if (deepPrice.max > deepPrice.min) {
              priceStr += `-₹${deepPrice.max}`;
            }
          } else {
            priceStr = "Check Price";
          }
        }

        return {
          web: {
            uri: item.link || "",
            title: item.title || "Product",
            price: priceStr,
          },
        };
      });
    } else {
      // No shopping results - still identify product, but no price
      console.log("⚠️ No shopping results found. Will require user to check price manually.");
      shopUrl = "";
      sourceName = "No results";
      finalSources = [];
    }

    return {
      name: identifiedName,
      priceMin,
      priceMax,
      shopUrl,
      currency: "₹",
      confidence: priceMin > 0 ? 90 : 60,
      imageUrl: imageSrc,
      sources: finalSources,
    };
  } catch (error) {
    console.error("❌ Analysis Error:", error);
    throw error;
  }
}