interface ProductResult {
  name: string;
  priceMin: number;
  priceMax: number;
  shopUrl: string;
  currency: string;
  sourceName: string;
  inStock: boolean;
  priceAvailable: boolean;
  confidence: number;
}

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || '';
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

console.log('🔑 Environment Variables Check:');
console.log(`   VITE_IMGBB_API_KEY: ${IMGBB_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`   VITE_SEARCHAPI_KEY: ${SEARCHAPI_KEY ? '✅ LOADED' : '❌ MISSING'}`);
console.log(`   VITE_GROQ_API_KEY: ${GROQ_API_KEY ? '✅ LOADED' : '❌ MISSING'}`);


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

const OUT_OF_STOCK_KEYWORDS = [
  'out of stock',
  'out-of-stock',
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

async function identifyWithGroq(rawLensTitle: string): Promise<string> {
  try {
    if (!GROQ_API_KEY) {
      console.warn("⚠️ Groq API key not found, using Google Lens result");
      return rawLensTitle;
    }

    const prompt = `You are an expert product identifier. Given this raw product identification from Google Lens, extract the EXACT product name only.

Raw identification: "${rawLensTitle}"

RULES:
1. Return ONLY the clean product name (2-5 words max)
2. Remove: review, unboxing, youtube, video, problem, issue, price, cost, deal
3. Remove: variant indicators (::, |, -, etc.)
4. Keep ONLY: Brand name + Model/Product name
5. Remove numbers at the end (years, prices)
6. Return NOTHING else, just the product name

RESPONSE: Return only the clean product name, nothing else.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.warn(`⚠️ Groq error: ${data.error.message}, using Google Lens result`);
      return rawLensTitle;
    }

    const cleanName = (data.choices?.[0]?.message?.content || rawLensTitle).trim();
    console.log(`🤖 Groq AI identified: "${cleanName}"`);
    return cleanName;
  } catch (error) {
    console.warn("⚠️ Groq identification failed, falling back to Google Lens:", error);
    return rawLensTitle;
  }
}

function sanitizeProductName(rawTitle: string): string {
  if (!rawTitle || rawTitle.trim().length === 0) {
    return "Unknown Product";
  }

  let text = rawTitle.trim();

  const criticalKeywords = [
    'review', 'reviews', 'video', 'youtube', 'unboxing', 'teardown', 'unbox',
    'channel', 'tech', 'unboxed', 'vs', 'comparison',
    'problem', 'issue', 'error', 'fix', 'hack', 'solution', 'guide',
    'hype', 'hyped', 'why', 'how', 'what', 'which', 'where', 'when',
    'so', 'much', 'more', 'less', 'most', 'very',
    'amazon', 'flipkart', 'online', 'deal', 'offer', 'shop', 'store',
    'leaked', 'leak', 'rumor', 'rumoured', 'rumored', 'fake', 'scam', 'hoax',
    'best', 'top', 'ultimate', 'new', 'latest', 'upcoming', 'original',
    'available', 'in', 'india', 'indian', 'for', 'the', 'a', 'an',
    'specs', 'features', 'pricing',
    'official', 'authentic', 'real', 'true', 'first', 'full', 'complete',
  ];

  const keywordPattern = new RegExp(
    `\\b(${criticalKeywords.join('|')})\\b`,
    'gi'
  );
  text = text.replace(keywordPattern, '');

  text = text.split('::')[0];
  text = text.split('|')[0];
  text = text.split('–')[0];
  text = text.split('-')[0];

  text = text.replace(/[₹$€£]\s*[\d,]+/g, '');
  text = text.replace(/\brs\.?\s*[\d,]+\b/gi, '');
  text = text.replace(/\bfor\s+[₹$€£]?[\d,]+\b/gi, '');
  text = text.replace(/\bunder\s+[\d,]+\b/gi, '');

  text = text.replace(/\s+/g, ' ').trim();

  const words = text.split(/\s+/)
    .filter(word => {
      return word.length > 1 && !/^\d+$/.test(word);
    })
    .slice(0, 5);

  const cleanName = words.join(' ').trim();

  if (!cleanName) {
    console.warn(`⚠️ Name too aggressively cleaned. Original: "${rawTitle}"`);
    return rawTitle.split(/[:|–-]/)[0].trim() || "Unknown Product";
  }

  console.log(`✅ Cleaned: "${cleanName}"`);
  return cleanName;
}

async function searchGoogleShopping(productName: string): Promise<any[]> {
  try {
    const searchUrl = new URL("https://www.searchapi.io/api/v1/search");
    searchUrl.searchParams.append("engine", "google_shopping");
    searchUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    searchUrl.searchParams.append("q", productName);
    searchUrl.searchParams.append("gl", "in");
    searchUrl.searchParams.append("hl", "en");
    searchUrl.searchParams.append("currency", "INR");
    searchUrl.searchParams.append("num", "20");

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

function isTrustedStore(link: string): boolean {
  if (!link) return false;

  const lowerLink = link.toLowerCase();

  for (const blocked of BLOCKED_STORES) {
    if (lowerLink.includes(blocked)) {
      console.log(`  ❌ BLOCKED: "${blocked}" detected - REJECTING`);
      return false;
    }
  }

  for (const trusted of TRUSTED_STORES) {
    if (lowerLink.includes(trusted)) {
      console.log(`  ✅ TRUSTED: "${trusted}" - ACCEPTING`);
      return true;
    }
  }

  console.log(`  ❌ UNKNOWN: Not in trusted list - REJECTING`);
  return false;
}

function detectStockStatus(item: any): boolean {
  const title = (item.title || '').toLowerCase();
  for (const keyword of OUT_OF_STOCK_KEYWORDS) {
    if (title.includes(keyword.toLowerCase())) {
      console.log(`    ⚠️ Out-of-stock detected in title: "${keyword}"`);
      return false;
    }
  }

  const status = (item.status || '').toLowerCase();
  if (status.includes('out of stock') || status.includes('unavailable') || status.includes('discontinued')) {
    console.log(`    ⚠️ Out-of-stock detected in status`);
    return false;
  }

  const price = item.price || item.extracted_price;
  if (price && price > 0) {
    console.log(`    ✅ Price found: assumed IN STOCK`);
    return true;
  }

  console.log(`    ❓ No price and no explicit stock status`);
  return false;
}

function extractPrice(item: any): { min: number; max: number } {
  const price = item.price || item.extracted_price || '';
  
  if (!price) {
    return { min: 0, max: 0 };
  }

  const priceStr = price.toString().trim();

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

export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      const missing = [];
      if (!IMGBB_API_KEY) missing.push('VITE_IMGBB_API_KEY');
      if (!SEARCHAPI_KEY) missing.push('VITE_SEARCHAPI_KEY');
      throw new Error(`Missing required API keys: ${missing.join(', ')}. Check Vercel Environment Variables.`);
    }

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║        SCAN & PRICE - AI-POWERED PRODUCT IDENTIFICATION      ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    console.log("📸 STEP 1: Uploading image to ImgBB...");
    const imageUrl = await uploadToImgBB(imageSrc);

    console.log("\n🔍 STEP 2A: Google Lens visual identification...");
    const rawTitle = await identifyWithGoogleLens(imageUrl);

    console.log("\n🤖 STEP 2B: AI-powered product identification with Groq...");
    const productName = await identifyWithGroq(rawTitle);

    console.log("\n🧹 STEP 2C: Final sanitization (safety check)...");
    const cleanProductName = sanitizeProductName(productName);

    console.log("\n🛍️ STEP 3: Searching Google Shopping (India only)...");
    const allResults = await searchGoogleShopping(cleanProductName);

    if (allResults.length === 0) {
      throw new Error("No shopping results found for this product");
    }

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

      if (!isTrustedStore(link)) {
        continue;
      }

      trustedCount++;

      const inStock = detectStockStatus(item);
      console.log(`    📦 Stock: ${inStock ? '✅ IN STOCK' : '❌ OUT OF STOCK'}`);

      if (!inStock) {
        console.log(`       Skipping out-of-stock item`);
        continue;
      }

      inStockCount++;

      const { min, max } = extractPrice(item);
      const hasPrice = min > 0;

      console.log(`    💵 Price available: ${hasPrice ? '✅ YES' : '❌ NO'}`);

      if (!bestDeal && hasPrice) {
        bestDeal = item;
        bestStoreName = source;
        console.log(`    🎯 SELECTED THIS RESULT!\n`);
      }
    }

    console.log(`📊 Summary: ${trustedCount} from trusted stores, ${inStockCount} in stock`);

    if (!bestDeal) {
      throw new Error(
        `❌ No in-stock products from trusted stores found.\n` +
        `Try scanning a more common/popular product.\n` +
        `Trusted stores: Amazon.in, Flipkart, Myntra, Croma, Reliance, Tata CLiQ, Boat, Samsung, Apple`
      );
    }

    console.log("\n💰 STEP 4: Extracting price...");
    const { min: priceMin, max: priceMax } = extractPrice(bestDeal);
    const priceAvailable = priceMin > 0;
    const inStock = detectStockStatus(bestDeal);

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
