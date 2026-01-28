export interface ProductResult {
  id?: string;
  name: string;
  description: string;
  priceMin: number;
  priceMax: number;
  confidence: number;
  imageUrl: string;
  shopUrl: string;
  sources?: Array<{
    web?: { uri: string; title: string };
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