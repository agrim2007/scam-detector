interface ProductResult {
  name: string;
  priceMin: number;
  priceMax: number;
  shopUrl: string;
  currency: string;
  sourceName: string;
  confidence: number;
}

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || '';
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY || '';

const BLACKLISTED_DOMAINS = [
  'alibaba',
  'aliexpress',
  'indiamart',
  'ubuy',
  'made-in-china',
  'desertcart',
  'dhgate',
  'ebay',
  'wish',
  'gearbest',
  'banggood',
  'fasttech',
  'lazada',
  'shopee',
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
  if (!data.success) throw new Error("ImgBB upload failed");

  console.log("✅ Image uploaded to ImgBB");
  return data.data.url;
}

async function identifyWithGoogleLens(imageUrl: string): Promise<string> {
  const lensUrl = new URL("https://www.searchapi.io/api/v1/search");
  lensUrl.searchParams.append("engine", "google_lens");
  lensUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  lensUrl.searchParams.append("url", imageUrl);
  lensUrl.searchParams.append("gl", "in");

  const response = await fetch(lensUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Google Lens error: ${data.error}`);

  const visualMatches = data.visual_matches || [];
  if (visualMatches.length === 0) throw new Error("No visual matches found");

  const rawTitle = visualMatches[0].title || "Unknown Product";
  console.log(`🔍 Raw identification: "${rawTitle}"`);
  return rawTitle;
}

function sanitizeProductName(rawTitle: string): string {
  if (!rawTitle?.trim()) return "Unknown Product";

  let text = rawTitle.trim();

  const unwantedKeywords = [
    'review', 'reviews', 'video', 'youtube', 'unboxing', 'unbox',
    'problem', 'issue', 'fix', 'hype', 'hyped', 'why', 'how', 'what',
    'amazon', 'flipkart', 'online', 'deal', 'offer', 'shop', 'store',
    'leaked', 'rumor', 'fake', 'scam', 'best', 'top', 'ultimate',
    'new', 'latest', 'available', 'india', 'indian', 'for', 'the', 'a', 'an',
    'vs', 'comparison', 'channel', 'tech', 'teardown', 'specs', 'features',
  ];

  const pattern = new RegExp(`\\b(${unwantedKeywords.join('|')})\\b`, 'gi');
  text = text.replace(pattern, '');

  text = text.split('::')[0];
  text = text.split('|')[0];
  text = text.split('–')[0];
  text = text.split('-')[0];

  text = text.replace(/[₹$€£]\s*[\d,]+/g, '');
  text = text.replace(/\b\d+\s*(rs|rupees?)\b/gi, '');

  text = text.replace(/\s+/g, ' ').trim();

  const words = text.split(/\s+/)
    .filter(word => word.length > 1 && !/^\d+$/.test(word))
    .slice(0, 5);

  const cleanName = words.join(' ').trim();
  console.log(`✅ Sanitized: "${cleanName}"`);
  return cleanName || "Unknown Product";
}

function safeExtractPrice(item: any): { min: number; max: number } {
  const extracted = item.extracted_price;
  
  if (typeof extracted === 'number' && extracted > 0) {
    return { min: Math.round(extracted), max: Math.round(extracted) };
  }

  const priceStr = (item.price || '').toString().trim();
  if (!priceStr) return { min: 0, max: 0 };

  const rangeMatch = priceStr.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-–]\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
    const max = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    if (min > 0 && max > 0) {
      console.log(`💰 Price range: ₹${min} - ₹${max}`);
      return { min, max };
    }
  }

  const singleMatch = priceStr.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (singleMatch) {
    const price = parseInt(singleMatch[1].replace(/,/g, ''), 10);
    if (price > 0) {
      console.log(`💰 Price: ₹${price}`);
      return { min: price, max: price };
    }
  }

  return { min: 0, max: 0 };
}

function isValidDomain(link: string): boolean {
  if (!link) return false;

  const lowerLink = link.toLowerCase();

  for (const blocked of BLACKLISTED_DOMAINS) {
    if (lowerLink.includes(blocked)) {
      console.log(`  ❌ BLOCKED: "${blocked}" detected`);
      return false;
    }
  }

  console.log(`  ✅ ACCEPTED: ${link.substring(0, 50)}...`);
  return true;
}

export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API keys: Check VITE_IMGBB_API_KEY and VITE_SEARCHAPI_KEY");
    }

    console.log("\n╔════════════════════════════════════════╗");
    console.log("║   SCAN & PRICE - PRODUCT FINDER      ║");
    console.log("╚════════════════════════════════════════╝\n");

    console.log("📸 STEP 1: Uploading image...");
    const imageUrl = await uploadToImgBB(imageSrc);

    console.log("🔍 STEP 2A: Google Lens identification...");
    const rawTitle = await identifyWithGoogleLens(imageUrl);

    console.log("🧹 STEP 2B: Sanitizing product name...");
    const cleanProductName = sanitizeProductName(rawTitle);

    console.log("🛍️ STEP 3: Searching Google Shopping...");
    const shoppingUrl = new URL("https://www.searchapi.io/api/v1/search");
    shoppingUrl.searchParams.append("engine", "google_shopping");
    shoppingUrl.searchParams.append("api_key", SEARCHAPI_KEY);
    shoppingUrl.searchParams.append("q", cleanProductName);
    shoppingUrl.searchParams.append("gl", "in");
    shoppingUrl.searchParams.append("hl", "en");
    shoppingUrl.searchParams.append("currency", "INR");
    shoppingUrl.searchParams.append("num", "20");

    const shoppingResponse = await fetch(shoppingUrl.toString());
    const shoppingData = await shoppingResponse.json();

    if (shoppingData.error) throw new Error(`Shopping API error: ${shoppingData.error}`);

    const results = shoppingData.shopping_results || [];
    console.log(`Found ${results.length} results\n`);

    console.log("🔐 STEP 4: Filtering by domain...");
    for (const item of results) {
      const link = item.link || item.url || '';
      const source = item.source || 'Unknown';

      if (!isValidDomain(link)) continue;

      const { min, max } = safeExtractPrice(item);

      if (min > 0) {
        const result: ProductResult = {
          name: cleanProductName,
          priceMin: min,
          priceMax: max,
          shopUrl: link,
          currency: '₹',
          sourceName: source,
          confidence: 85,
        };

        console.log("\n✅ SUCCESS!");
        console.log(`   Name: ${result.name}`);
        console.log(`   Price: ₹${result.priceMin}`);
        console.log(`   Store: ${result.sourceName}\n`);

        return result;
      }
    }

    throw new Error("No products found with valid prices. Try a different product.");
  } catch (error) {
    console.error("❌ ERROR:", error);
    throw error;
  }
}

export default identifyProduct;
