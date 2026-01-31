interface ProductResult {
  name: string;
  priceMin: number;
  priceMax: number;
  shopUrl: string;
  currency: string;
  sourceName: string;
  confidence: number;
  score?: number;
}

interface ScoredResult {
  item: any;
  score: number;
  priceMin: number;
  priceMax: number;
}

const IMGBB_API_KEY = import.meta.env.VITE_IMGBB_API_KEY || '';
const SEARCHAPI_KEY = import.meta.env.VITE_SEARCHAPI_KEY || '';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

const TRUSTED_DOMAINS = [
  'amazon.in',
  'flipkart.com',
  'myntra.com',
  'croma.com',
  'reliance.com',
  'tatacliq.com',
  'boat-lifestyle.com',
  'samsung.com',
  'apple.com',
];

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

async function cleanNameWithGroq(rawTitle: string): Promise<string> {
  if (!GROQ_API_KEY) {
    console.warn("⚠️ Groq API key missing, using raw title");
    return rawTitle;
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          {
            role: "system",
            content: "You are a product name extractor. Extract ONLY the precise commercial product name from the user's text. Remove words like 'Review', 'Unboxing', 'India', 'Price'. Do not add any conversational text. Return only the product name, nothing else.",
          },
          {
            role: "user",
            content: rawTitle,
          },
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.warn(`⚠️ Groq error: ${data.error.message}`);
      return rawTitle;
    }

    const cleanName = (data.choices?.[0]?.message?.content || rawTitle).trim();
    console.log(`🤖 Groq cleaned: "${cleanName}"`);
    return cleanName;
  } catch (error) {
    console.warn("⚠️ Groq request failed, using raw title:", error);
    return rawTitle;
  }
}

function safeExtractPrice(item: any): { min: number; max: number } {
  const extracted = item.extracted_price;
  
  if (typeof extracted === 'number' && extracted > 0) {
    return { min: Math.round(extracted), max: Math.round(extracted) };
  }

  const priceStr = (item.price || '').toString().trim();
  if (!priceStr) return { min: 0, max: 0 };

  const rangeMatch = priceStr.match(/Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*[-–]\s*Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1].replace(/,/g, ''), 10);
    const max = parseInt(rangeMatch[2].replace(/,/g, ''), 10);
    if (min > 0 && max > 0) {
      console.log(`💰 Price range: ₹${min.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}`);
      return { min, max };
    }
  }

  const singleMatch = priceStr.match(/Rs\.?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i);
  if (singleMatch) {
    const price = parseInt(singleMatch[1].replace(/,/g, ''), 10);
    if (price > 0) {
      console.log(`💰 Price: ₹${price.toLocaleString('en-IN')}`);
      return { min: price, max: price };
    }
  }

  const simpleMatch = priceStr.match(/(\d+)/);
  if (simpleMatch) {
    const price = parseInt(simpleMatch[1], 10);
    if (price > 0) {
      console.log(`💰 Price: ₹${price.toLocaleString('en-IN')}`);
      return { min: price, max: price };
    }
  }

  return { min: 0, max: 0 };
}

function calculateScore(item: any): number {
  let score = 0;
  const link = (item.link || item.url || '').toLowerCase();
  const source = (item.source || '').toLowerCase();

  for (const trusted of TRUSTED_DOMAINS) {
    if (link.includes(trusted) || source.includes(trusted)) {
      score += 50;
      console.log(`  ✅ Trusted domain detected (+50)`);
      break;
    }
  }

  let isBlacklisted = false;
  for (const blacklisted of BLACKLISTED_DOMAINS) {
    if (link.includes(blacklisted) || source.includes(blacklisted)) {
      isBlacklisted = true;
      console.log(`  ❌ Blacklisted domain detected`);
      break;
    }
  }

  if (!isBlacklisted) {
    score += 20;
    console.log(`  ✅ Not blacklisted (+20)`);
  }

  const { min } = safeExtractPrice(item);
  if (min > 0) {
    score += 30;
    console.log(`  ✅ Valid price found (+30)`);
  }

  return score;
}

async function searchGoogleShopping(productName: string): Promise<any[]> {
  const shoppingUrl = new URL("https://www.searchapi.io/api/v1/search");
  shoppingUrl.searchParams.append("engine", "google_shopping");
  shoppingUrl.searchParams.append("api_key", SEARCHAPI_KEY);
  shoppingUrl.searchParams.append("q", productName);
  shoppingUrl.searchParams.append("gl", "in");
  shoppingUrl.searchParams.append("hl", "en");
  shoppingUrl.searchParams.append("currency", "INR");
  shoppingUrl.searchParams.append("num", "30");

  const response = await fetch(shoppingUrl.toString());
  const data = await response.json();

  if (data.error) throw new Error(`Shopping API error: ${data.error}`);

  const results = data.shopping_results || [];
  console.log(`Found ${results.length} shopping results\n`);
  return results;
}

export async function identifyProduct(imageSrc: string): Promise<ProductResult> {
  try {
    if (!IMGBB_API_KEY || !SEARCHAPI_KEY) {
      throw new Error("Missing API keys: VITE_IMGBB_API_KEY, VITE_SEARCHAPI_KEY required");
    }

    console.log("\n╔════════════════════════════════════════╗");
    console.log("║   SCAN & PRICE - AI PRODUCT FINDER   ║");
    console.log("╚════════════════════════════════════════╝\n");

    console.log("📸 STEP 1: Uploading image...");
    const imageUrl = await uploadToImgBB(imageSrc);

    console.log("\n🔍 STEP 2A: Google Lens visual identification...");
    const rawTitle = await identifyWithGoogleLens(imageUrl);

    console.log("\n🤖 STEP 2B: Groq intelligent name cleaning...");
    const cleanProductName = await cleanNameWithGroq(rawTitle);

    console.log("\n🛍️ STEP 3: Searching Google Shopping...");
    const allResults = await searchGoogleShopping(cleanProductName);

    if (allResults.length === 0) {
      throw new Error("No shopping results found for this product");
    }

    console.log("⭐ STEP 4: Scoring & ranking candidates...\n");

    const scoredResults: ScoredResult[] = [];

    for (let i = 0; i < allResults.length; i++) {
      const item = allResults[i];
      console.log(`Result ${i + 1}: ${item.source || 'Unknown'}`);

      const score = calculateScore(item);
      const { min, max } = safeExtractPrice(item);

      console.log(`  Final Score: ${score}\n`);

      if (score > 0) {
        scoredResults.push({
          item,
          score,
          priceMin: min,
          priceMax: max,
        });
      }
    }

    scoredResults.sort((a, b) => b.score - a.score);

    if (scoredResults.length === 0) {
      throw new Error("No valid products found. Try a different product.");
    }

    const bestCandidate = scoredResults[0];
    const { item, score, priceMin, priceMax } = bestCandidate;

    const result: ProductResult = {
      name: cleanProductName,
      priceMin,
      priceMax,
      shopUrl: item.link || item.url || '',
      currency: '₹',
      sourceName: item.source || 'Unknown',
      confidence: Math.min(95, 50 + Math.floor(score / 2)),
      score,
    };

    console.log("🏆 BEST CANDIDATE SELECTED!");
    console.log(`   Name: ${result.name}`);
    console.log(`   Price: ₹${result.priceMin}${result.priceMax > result.priceMin ? ` - ₹${result.priceMax}` : ''}`);
    console.log(`   Store: ${result.sourceName}`);
    console.log(`   Score: ${score}`);
    console.log(`   Confidence: ${result.confidence}%\n`);

    return result;
  } catch (error) {
    console.error("❌ ERROR:", error);
    throw error;
  }
}

export default identifyProduct;
