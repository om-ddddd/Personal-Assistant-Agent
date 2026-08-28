import dotenv from "dotenv";
dotenv.config();

export const EMBEDDING_DIMENSION = parseInt(process.env.NVIDIA_EMBEDDING_DIM || "2048", 10);
export const EMBEDDING_MODEL_NAME = process.env.NVIDIA_EMBEDDING_MODEL || "nvidia/nemotron-3-embed-1b";

/**
 * Generate high-dimensional vector embeddings using NVIDIA NIM API.
 * 
 * @param text The string to embed.
 * @param inputType "passage" when indexing/saving documents, "query" when searching.
 * @returns Array of floating-point numbers representing the 2048-dimensional vector.
 */
export async function embedText(
  text: string,
  inputType: "passage" | "query" = "passage"
): Promise<number[]> {
  const cleanText = text.trim();
  if (!cleanText) {
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";

  if (!apiKey) {
    throw new Error("Missing NVIDIA_API_KEY in environment configuration.");
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL_NAME,
      input: [cleanText],
      input_type: inputType,
      encoding_format: "float",
      truncate: "NONE",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NVIDIA Embeddings API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  if (!data.data || !data.data[0] || !Array.isArray(data.data[0].embedding)) {
    throw new Error("Invalid response format received from NVIDIA Embeddings API.");
  }

  return data.data[0].embedding;
}
