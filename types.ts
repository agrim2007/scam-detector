export interface ProductResult {
  id?: string;
  name: string;
  description?: string;
  priceMin: number;
  priceMax: number;
  confidence: number;
  imageUrl?: string;
  shopUrl: string;
  currency?: string;           // Currency symbol (₹, $, etc.)
  sourceName?: string;         // Store name (Amazon.in, Flipkart, etc.)
  inStock?: boolean;           // Is product in stock? (NEW)
  priceAvailable?: boolean;    // Was a price successfully extracted? (NEW)
  sources?: Array<{
    web?: { uri: string; title: string; price?: string };
  }>;
}

export interface CameraViewProps {
  onCapture: (imageSrc: string) => void;
}

export interface ResultCardProps {
  result: ProductResult | null;
  loading: boolean;
  capturedImage: string;
  onReset: () => void;
}