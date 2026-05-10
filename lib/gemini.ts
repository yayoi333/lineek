import { GoogleGenAI } from "@google/genai";

export async function translateMeta(
  jaName: string,
  jaDesc: string
): Promise<{ enName: string; enDesc: string }> {
  // Try to get API key from process.env (Node/AI Studio) or import.meta.env (Vite)
  // @ts-ignore
  const apiKey = process.env.API_KEY || (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY);
  
  if (!apiKey) {
    throw new Error("APIキーが見つかりません。環境変数(API_KEY または VITE_GEMINI_API_KEY)を設定してください。");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Use the recommended model for text tasks
  const MODEL_NAME = "gemini-3-flash-preview";

  async function translateText(text: string): Promise<string> {
    if (!text || text.trim() === "") return "";
    
    // Strict prompt to ensure only raw translation text is returned
    const prompt = `You are a professional translator.
Translate the following Japanese into natural English.

Strict Rules:
1. Output ONLY the English translation.
2. Do not include the original text.
3. Do not include any brackets [], tags <>, labels, or notes.
4. Do not wrap the output in quotes.
5. If the input is empty or nonsensical, return an empty string.

Text to translate:
${text}`;

    try {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: {
            parts: [{ text: prompt }]
          },
          config: {
            temperature: 0.1,
            maxOutputTokens: 512,
          }
        });

        // 1. Try standard text property
        if (response.text) {
            return response.text.trim();
        } 
        // 2. Try candidates parsing
        else if (response.candidates && response.candidates.length > 0) {
             const parts = response.candidates[0].content?.parts;
             if (parts && parts.length > 0 && parts[0].text) {
                 return parts[0].text.trim();
             }
        }
        
        return "";
    } catch (error: any) {
        console.warn(`Translation failed for text: "${text.substring(0, 10)}..."`, error);
        throw new Error(`Gemini API Error: ${error.message || 'Unknown error'}`);
    }
  }

  try {
    const [enName, enDesc] = await Promise.all([
        translateText(jaName),
        translateText(jaDesc)
    ]);

    return { enName, enDesc };

  } catch (error) {
    console.error("translateMeta fatal error:", error);
    throw error;
  }
}