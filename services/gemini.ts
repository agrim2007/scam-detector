/**
 * SCAN & PRICE: Complete Project Brain
 * ====================================
 * 
 * Robust product identification and price discovery for Indian e-commerce
 * 
 * 4-STEP PROCESS:
 * 1. Upload image to ImgBB
 * 2. Use Google Lens to identify product (with aggressive sanitization)
 * 3. Search Google Shopping for trusted Indian stores only
 * 4. Extract price and stock status
 */

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

interface ProductResult {
  name: string;                    // Cleaned product name (e.g., "Boat Nirvana Ion")
  priceMin: number;                // Minimum price in INR
  priceMax: number;                // Maximum price in INR (same as min if single price)
  shopUrl: string;                 // Direct link to product on trusted store
  currency: string;                // Always "₹" (Indian Rupee)
  sourceName: string;              // Store name (e.g., "Amazon.in", "Flipkart")
  inStock: boolean;                // Is product currently in stock?
  priceAvailable: boolean;         // Did we successfully extract a price?
  confidence: number;              // Confidence score (0-100)
}

// ============================================================================
// API KEYS & CONFIGURATION
// ============================================================================

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY;
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY;

// STRICT WHITELIST: Only these 9 trusted Indian e-commerce stores
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

// BLOCKLIST: Immediately reject these stores (non-Indian/untrusted)
const BLOCKED_STORES = [
  'alibaba',
  'aliexpress',
  'ubuy',
  'indiamart',
  'indiamart.com',
  'ebay',
  'ebay.com',
  'dhgate',
  'wish',
  'gearbest',
  'banggood',
  'fasttech',
  'lazada',
  'shopee',
];

// Keywords that indicate out-of-stock status
const OUT_OF_STOCK_KEYWORDS = [
  'out of stock',
  'out-of-stock',
  'out of stock',
  'unavailable',
  'discontinued',
  'no longer available',
  'not available',
  'sold out',
  'notify me',
  'backorder',
  'back order',
  'preorder',
  'coming soon',
];

// ============================================================================
// STEP 1: UPLOAD IMAGE TO IMGBB
// ============================================================================

/**
 * Upload base64 image to ImgBB and return public URL
 * ImgBB provides 600-second (10-minute) expiration for free
 */
async function uploadToImgBB(base64Image: string): Promise<string> {
  try {
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
    if (!data.success) {
      throw new Error("ImgBB upload failed");
    }

    console.log("✅ Image uploaded to ImgBB");
    return data.data.url;
  } catch (error) {
    console.error("❌ ImgBB upload error:", error);
    throw new Error("Failed to upload image");
  }
}

// ============================================================================
// STEP 2A: IDENTIFY PRODUCT WITH GOOGLE LENS
// ============================================================================

/**
 * Use Google Lens to visually identify the product
 * Returns the raw title from visual matches
 */
async function identifyWithGoogleLens(imageUrl: string): Promise<string> {
  try {
    const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
    lensUrl.searchParams.append("engine", "google_lens");
    lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    lensUrl.searchParams.append("url", imageUrl);
    lensUrl.searchParams.append("gl", "in");

    const response = await fetch(lensUrl.toString());
    const data = await response.json();

    if (data.error) {
      throw new Error(`Google Lens API error: ${data.error}`);
    }

    const visualMatches = data.visual_matches || [];
    if (visualMatches.length === 0) {
      throw new Error("No visual matches found");
    }

    const rawTitle = visualMatches[0].title || "Unknown Product";
    console.log(`🔍 Raw identification: "${rawTitle}"`);
    return rawTitle;
  } catch (error) {
    console.error("❌ Google Lens error:", error);
    throw error;
  }
}

// ============================================================================
// STEP 2B: AGGRESSIVE PRODUCT NAME SANITIZATION
// ============================================================================

/**
 * ROBUST NAME CLEANER: Transform raw product titles into clean names
 * 
 * Removes:
 * - Video/Content keywords: "Review", "Unboxing", "YouTube", "Video", "Teardown"
 * - Problem words: "Problem", "Issue", "Error", "Fix", "Hack"
 * - Vendor/Platform markers: "Amazon", "Flipkart", "Online", "Deal"
 * - Variant indicators: "Behance", "::", "|", "–", etc.
 * - Price markers: "₹", "Rs", "under", "for", "only"
 * - Rumors/Leaks: "Leaked", "Rumor", "Fake", "Scam"
 * 
 * Examples:
 * "Boat Nirvana Ion :: Behance" → "Boat Nirvana Ion"
 * "iPhone 15 Review YouTube" → "iPhone 15"
 * "Samsung Galaxy S24 Review Video Price ₹79999" → "Samsung Galaxy S24"
 * "OnePlus 12 Unboxing Problem Fixed" → "OnePlus 12"
 * "Mi 13 - Best Features for 2024" → "Mi 13"
 */
function sanitizeProductName(rawTitle: string): string {
  if (!rawTitle || rawTitle.trim().length === 0) {
    return "Unknown Product";
  }

  let text = rawTitle.trim();

  // ===== REMOVE CRITICAL KEYWORDS (case-insensitive, whole word only) =====
  const criticalKeywords = [
    // Content/Video keywords
    'review', 'reviews', 'video', 'youtube', 'unboxing', 'teardown', 'unbox',
    'channel', 'tech', 'unboxed', 'vs', 'comparison',
    // Problem words & filler
    'problem', 'issue', 'error', 'fix', 'hack', 'solution', 'guide',
    'hype', 'hyped', 'why', 'how', 'what', 'which', 'where', 'when',
    'so', 'much', 'more', 'less', 'most', 'very',
    // Platform/vendor markers
    'amazon', 'flipkart', 'online', 'deal', 'offer', 'shop', 'store',
    // Rumors/Fakes
    'leaked', 'leak', 'rumor', 'rumoured', 'rumored', 'fake', 'scam', 'hoax',
    // Other irrelevant
    'best', 'top', 'ultimate', 'new', 'latest', 'upcoming', 'original',
    'available', 'in', 'india', 'indian', 'for', 'the', 'a', 'an',
    'specs', 'features', 'pricing',
    'official', 'authentic', 'real', 'true', 'first', 'full', 'complete',
  ];

  // Build regex to remove these words (whole word only)
  const keywordPattern = new RegExp(
    `\\b(${criticalKeywords.join('|')})\\b`,
    'gi'
  );
  text = text.replace(keywordPattern, '');

  // ===== REMOVE VARIANT SEPARATORS & EXTRA TEXT =====
  // "Product :: Variant" → "Product"
  text = text.split('::')[0];

  // "Product | Variant" → "Product"
  text = text.split('|')[0];

  // "Product – Description" → "Product"
  text = text.split('–')[0];
  text = text.split('-')[0];

  // ===== REMOVE PRICE MARKERS =====
  // "Product ₹5000" → "Product"
  text = text.replace(/[₹$€£]\s*[\d,]+/g, '');
  
  // "Product Rs. 5000" or "Product Rs 5000"
  text = text.replace(/\brs\.?\s*[\d,]+\b/gi, '');
  
  // "Product for ₹5000" → "Product"
  text = text.replace(/\bfor\s+[₹$€£]?[\d,]+\b/gi, '');

  // "Product under 5000" → "Product"
  text = text.replace(/\bunder\s+[\d,]+\b/gi, '');

  // ===== CLEAN UP WHITESPACE =====
  text = text.replace(/\s+/g, ' ').trim();

  // ===== EXTRACT MEANINGFUL WORDS =====
  // Keep first 2-5 words (typically: Brand + Model [+ variant])
  // Skip single-letter words and pure numbers
  const words = text.split(/\s+/)
    .filter(word => {
      // Skip if: single letter, pure number, too short
      return word.length > 1 && !/^\d+$/.test(word);
    })
    .slice(0, 5); // First 5 meaningful words

  const cleanName = words.join(' ').trim();

  // Fallback if completely emptied
  if (!cleanName) {
    console.warn(`⚠️ Name too aggressively cleaned. Original: "${rawTitle}"`);
    return rawTitle.split(/[:|–-]/)[0].trim() || "Unknown Product";
  }

  console.log(`✅ Cleaned: "${cleanName}"`);
  return cleanName;
}

// ============================================================================
// STEP 3: SEARCH GOOGLE SHOPPING (INDIA)
// ============================================================================

/**
 * Search Google Shopping for product in India
 * Returns all results - we'll filter for trusted stores next
 */
async function searchGoogleShopping(productName: string): Promise<any[]> {
  try {
    const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
    searchUrl.searchParams.append("engine", "google_shopping");
    searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    searchUrl.searchParams.append("q", productName);
    searchUrl.searchParams.append("gl", "in");      // India
    searchUrl.searchParams.append("hl", "en");      // English
    searchUrl.searchParams.append("currency", "INR"); // Indian Rupee
    searchUrl.searchParams.append("num", "20");     // First 20 results

    const response = await fetch(searchUrl.toString());
    const data = await response.json();

    if (data.error) {
      throw new Error(`Google Shopping API error: ${data.error}`);
    }

    const results = data.shopping_results || [];
    console.log(`🛍️ Found ${results.length} shopping results`);
    return results;
  } catch (error) {
    console.error("❌ Google Shopping search error:", error);
    throw error;
  }
}

// ============================================================================
// STEP 3A: STRICT WHITELIST FILTERING
// ============================================================================

/**
 * CRITICAL: Check if a store link is TRUSTED
 * 
 * Returns TRUE ONLY if:
 * - Link contains a whitelisted trusted store domain
 * 
 * Returns FALSE if:
 * - Link contains a blocked/untrusted store
 * - Link is from unknown/random site (not in whitelist)
 * 
 * This is the GUARDIAN that prevents Alibaba, Ubuy, etc.
 */
function isTrustedStore(link: string): boolean {
  if (!link) return false;

  const lowerLink = link.toLowerCase();

  // IMMEDIATE REJECTION: Blocked stores
  for (const blocked of BLOCKED_STORES) {
    if (lowerLink.includes(blocked)) {
      console.log(`  ❌ BLOCKED: "${blocked}" detected - REJECTING`);
      return false;
    }
  }

  // WHITELIST CHECK: Only accept known good stores
  for (const trusted of TRUSTED_STORES) {
    if (lowerLink.includes(trusted)) {
      console.log(`  ✅ TRUSTED: "${trusted}" - ACCEPTING`);
      return true;
    }
  }

  // DEFAULT: Unknown store - REJECT (safer than accept)
  console.log(`  ❌ UNKNOWN: Not in trusted list - REJECTING`);
  return false;
}

// ============================================================================
// STEP 3B: STOCK STATUS DETECTION
// ============================================================================

/**
 * Detect if a product is in stock based on:
 * 1. Presence of price (if price exists, usually in stock)
 * 2. Explicit availability text in title/description
 * 3. Out-of-stock keywords in title
 * 
 * STRICT: If any out-of-stock indicator is found, return FALSE
 */
function detectStockStatus(item: any): boolean {
  // Check title for out-of-stock keywords FIRST (most important)
  const title = (item.title || '').toLowerCase();
  for (const keyword of OUT_OF_STOCK_KEYWORDS) {
    if (title.includes(keyword.toLowerCase())) {
      console.log(`    ⚠️ Out-of-stock detected in title: "${keyword}"`);
      return false; // Explicitly out of stock
    }
  }

  // Check status/availability field if exists
  const status = (item.status || '').toLowerCase();
  if (status.includes('out of stock') || status.includes('unavailable') || status.includes('discontinued')) {
    console.log(`    ⚠️ Out-of-stock detected in status`);
    return false;
  }

  // If price exists and no out-of-stock keywords, likely in stock
  const price = item.price || item.extracted_price;
  if (price && price > 0) {
    console.log(`    ✅ Price found: assumed IN STOCK`);
    return true;
  }

  // No price but also no out-of-stock keywords: uncertain, default to FALSE
  console.log(`    ❓ No price and no explicit stock status`);
  return false;
}

// ============================================================================
// STEP 4A: PRICE EXTRACTION
// ============================================================================

/**
 * Extract price from shopping result item
 * Handles multiple formats:
 * - "₹1,799" or "Rs. 1,799" (single price)
 * - "1,799" (plain number)
 * - "₹1,499 – ₹1,999" (price range)
 * - "Rs 1499 - Rs 1999" (range with text)
 */
function extractPrice(item: any): { min: number; max: number } {
  const price = item.price || item.extracted_price || '';
  
  if (!price) {
    return { min: 0, max: 0 };
  }

  const priceStr = price.toString().trim();

  // ===== PATTERN 1: Price Range =====
  // Matches: "₹1,499–₹1,999" or "Rs 1499 - Rs 1999" or "1499 - 1999"
  const rangePattern = /(?:₹|rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-–—]\s*(?:₹|rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
  const rangeMatch = priceStr.match(rangePattern);

  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
    const max = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    
    if (!isNaN(min) && !isNaN(max) && min > 0 && max > 0) {
      console.log(`    💰 Extracted range: ₹${min} - ₹${max}`);
      return { min, max };
    }
  }

  // ===== PATTERN 2: Single Price =====
  // Matches: "₹1,799" or "Rs. 1,799" or "1,799"
  const singlePattern = /(?:₹|rs\.?\s*)?(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
  const singleMatch = priceStr.match(singlePattern);

  if (singleMatch) {
    const priceValue = parseFloat(singleMatch[1].replace(/,/g, ''));
    
    if (!isNaN(priceValue) && priceValue > 0) {
      console.log(`    💰 Extracted price: ₹${priceValue.toLocaleString('en-IN')}`);
      return { min: Math.round(priceValue), max: Math.round(priceValue) };
    }
  }

  return { min: 0, max: 0 };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * MAIN FUNCTION: Complete product identification workflow
 * 
 * Input: base64 image of product
 * Output: ProductResult with name, price, store, stock status
 * 
 * Process:
 * 1. Upload image to ImgBB
 * 2. Use Google Lens to identify product
 * 3. Aggressively clean product name
 * 4. Search Google Shopping (India)
 * 5. Filter for ONLY trusted stores
 * 6. Find first in-stock result with price
 * 7. Extract price and return result
 */
export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    // Validate API keys
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API keys: VITE_IMGBB_API_KEY or VITE_SEARCHAPI_KEY");
    }

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║           SCAN & PRICE - PRODUCT IDENTIFICATION            ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // ===== STEP 1: Upload Image =====
    console.log("📸 STEP 1: Uploading image to ImgBB...");
    const imageUrl = await uploadToImgBB(imageSrc);

    // ===== STEP 2A: Identify with Google Lens =====
    console.log("\n🔍 STEP 2A: Identifying product with Google Lens...");
    const rawTitle = await identifyWithGoogleLens(imageUrl);

    // ===== STEP 2B: Sanitize Product Name =====
    console.log("\n🧹 STEP 2B: Sanitizing product name (aggressive cleaning)...");
    const cleanProductName = sanitizeProductName(rawTitle);

    // ===== STEP 3: Search Google Shopping =====
    console.log("\n🛍️ STEP 3: Searching Google Shopping (India only)...");
    const allResults = await searchGoogleShopping(cleanProductName);

    if (allResults.length === 0) {
      throw new Error("No shopping results found for this product");
    }

    // ===== STEP 3A: Filter for Trusted Stores =====
    console.log("\n🔐 STEP 3A: STRICT whitelist filtering...");
    console.log("   ✅ ACCEPTING: Amazon.in, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, Boat, Samsung, Apple");
    console.log("   ❌ BLOCKING: Alibaba, Ubuy, IndiaMart, eBay, and unknown stores\n");

    let bestDeal = null;
    let bestStoreName = '';
    let trustedCount = 0;
    let inStockCount = 0;

    for (let i = 0; i < allResults.length; i++) {
      const item = allResults[i];
      const link = item.link || '';
      const source = item.source || 'Unknown';

      // Check if trusted store
      if (!isTrustedStore(link)) {
        continue; // Skip untrusted/blocked stores
      }

      trustedCount++;

      // Check stock status
      const inStock = detectStockStatus(item);
      console.log(`    📦 Stock: ${inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);

      if (!inStock) {
        console.log(`       Skipping out-of-stock item`);
        continue;
      }

      inStockCount++;

      // Extract price
      const { min, max } = extractPrice(item);
      const hasPrice = min > 0;

      console.log(`    💵 Price available: ${hasPrice ? '✅ YES' : '❌ NO'}`);

      // Select first in-stock item from trusted store with price
      if (!bestDeal && hasPrice) {
        bestDeal = item;
        bestStoreName = source;
        console.log(`    🎯 SELECTED THIS RESULT!\n`);
      }
    }

    console.log(`📊 Summary: ${trustedCount} from trusted stores, ${inStockCount} in stock`);

    // ===== ERROR: No suitable result found =====
    if (!bestDeal) {
      throw new Error(
        `❌ No in-stock products from trusted stores found.\n` +
        `Try scanning a more common/popular product.\n` +
        `Trusted stores: Amazon.in, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, Boat, Samsung, Apple`
      );
    }

    // ===== STEP 4A: Extract Final Price =====
    console.log("\n💰 STEP 4: Extracting price...");
    const { min: priceMin, max: priceMax } = extractPrice(bestDeal);
    const priceAvailable = priceMin > 0;
    const inStock = detectStockStatus(bestDeal);

    // ===== BUILD RESULT =====
    const result: ProductResult = {
      name: cleanProductName,
      priceMin,
      priceMax,
      shopUrl: bestDeal.link || '',
      currency: '₹',
      sourceName: bestStoreName,
      inStock,
      priceAvailable,
      confidence: 85,
    };

    // ===== SUCCESS SUMMARY =====
    console.log("\n✅ SUCCESS! Product identified:\n");
    console.log(`   📝 Name: ${result.name}`);
    console.log(`   💵 Price: ${priceAvailable ? `₹${result.priceMin.toLocaleString('en-IN')}` : 'Not available'}`);
    console.log(`   📦 Stock: ${result.inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);
    console.log(`   🏪 Store: ${result.sourceName}`);
    console.log(`   🔗 Link: ${result.shopUrl.substring(0, 70)}...\n`);

    return result;
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    throw error;
  }
}

export default identifyProduct;
