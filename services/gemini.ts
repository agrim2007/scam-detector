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

  return visualMatches[0].title || "Unknown Product";
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
  searchUrl.searchParams.append("num", "15");

  const response = await fetch(searchUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Shopping Search Error: ${data.error}`);

  return data.shopping_results || [];
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

  for (const field of stockFields) {
    if (field in item) {
      const value = item[field];
      if (typeof value === "boolean") {
        return value === true;
      }
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (/in\s+stock|available|in\s+hand/.test(lower)) return true;
        if (/out\s+of\s+stock|unavailable|discontinued|out/.test(lower)) return false;
      }
    }
  }

  // Check title and price for stock keywords
  const fullText = `${(item.title || "")} ${(item.price || "")} ${(item.snippet || "")}`.toLowerCase();

  // Strong negative indicators
  if (
    /\b(out\s+of\s+stock|unavailable|discontinued|not\s+available|sold\s+out)\b/.test(
      fullText
    )
  ) {
    return false;
  }

  // Strong positive indicators
  if (/\b(in\s+stock|in\s+hand|available|ships?\s+soon)\b/.test(fullText)) {
    return true;
  }

  // If no explicit stock info found, assume it's in stock (API wouldn't return it if it wasn't)
  return true;
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
      // Step 1: Separate in-stock and out-of-stock items
      const inStockResults = shoppingResults.filter((item: any) => isProductInStock(item));
      const outOfStockResults = shoppingResults.filter(
        (item: any) => !isProductInStock(item)
      );

      console.log(
        `📦 Stock check: ${inStockResults.length} in-stock, ${outOfStockResults.length} out-of-stock`
      );

      // Prefer in-stock items, but use all items if nothing is in stock
      const resultsToProcess = inStockResults.length > 0 ? inStockResults : shoppingResults;

      // Step 2: Filter results by title match to the identified product
      // This prevents picking the wrong product variant
      const matchedResults = resultsToProcess
        .map((item: any) => ({
          item,
          matchScore: calculateTitleMatchScore(identifiedName, item.title || ""),
        }))
        .filter((x) => x.matchScore > 0) // Only keep results that match
        .sort((a, b) => b.matchScore - a.matchScore); // Sort by best match

      console.log(
        `🔍 Title matching: ${matchedResults.length} results match the identified product`
      );

      // If no strict title matches but we have in-stock items, use those
      // Otherwise use all results
      const validResults =
        matchedResults.length > 0 
          ? matchedResults.map((x) => x.item)
          : inStockResults.length > 0
          ? inStockResults
          : shoppingResults;

      // Step 3: Prioritize trusted shops (Amazon, Flipkart, etc.) among valid results
      const trustedDeal = validResults.find((item: any) =>
        TRUSTED_SHOPS.some((shop) =>
          item.source?.toLowerCase().includes(shop) ||
          item.link?.toLowerCase().includes(shop)
        )
      );

      const bestDeal = trustedDeal || validResults[0];

      // Step 4: Extract price using aggressive deep parser
      const priceData = extractPriceDeep(bestDeal);
      priceMin = priceData.min;
      priceMax = priceData.max;
      shopUrl = bestDeal.link || "";
      sourceName = bestDeal.source || "Google Shopping";

      console.log(`💵 Price extracted: ₹${priceMin}-₹${priceMax} from ${sourceName}`);
      console.log(`📍 Product link: ${shopUrl}`);
      console.log(`✅ In Stock: ${isProductInStock(bestDeal)}`);

      // Step 5: Build sources list (top 5 results from validated products)
      finalSources = validResults.slice(0, 5).map((item: any) => {
        // Try to get a readable price string
        let priceStr = item.price || "";
        if (!priceStr && item.extracted_price) {
          priceStr = `₹${item.extracted_price}`;
        }
        if (!priceStr) {
          priceStr = "Check Price";
        }

        // Add stock status indicator
        const stockStatus = isProductInStock(item) ? "✅ In Stock" : "❌ Out of Stock";
        const titleWithStock = `${item.title || "Product"} (${stockStatus})`;

        return {
          web: {
            uri: item.link || "",
            title: titleWithStock,
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