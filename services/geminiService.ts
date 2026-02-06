
import { GoogleGenAI, Type } from "@google/genai";

const HYBRID_SCANNER_PROMPT = `
Você é o motor de visão computacional da REIS Industrial.
Sua tarefa é analisar imagens de etiquetas de ativos, muitas vezes capturadas à distância, com desfoque ou pouca luz.

REGRAS DE EXTRAÇÃO:
1. Identifique o ID Único: Procure por sequências alfanuméricas (Ex: REIS-1234, R-99). 
2. Se o texto estiver parcialmente ilegível, use o contexto visual para sugerir o ID mais provável baseado no padrão REIS.
3. Identifique o tipo de antena RFID visível (Inlay UHF, HF Espiral, NFC Round).
4. Descreva o estado físico da etiqueta (Nova, Desgastada, Danificada).

FORMATO DE RESPOSTA: JSON rigoroso.
`;

export const analyzeTagVisually = async (base64Image: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analise esta etiqueta industrial REIS. Se houver desfoque, tente reconstruir o ID." },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image
              }
            }
          ]
        }
      ],
      config: {
        systemInstruction: HYBRID_SCANNER_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "ID identificado (ex: REIS-4502)" },
            tagType: { type: Type.STRING, description: "Tipo de hardware RFID detectado visualmente" },
            condition: { type: Type.STRING, enum: ["excelente", "bom", "desgastado", "critico"] },
            confidence: { type: Type.NUMBER, description: "Nível de certeza de 0 a 1" },
            visualData: { type: Type.STRING, description: "Descrição técnica do ativo" }
          },
          required: ["id", "tagType", "condition"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Erro na análise visual profunda:", error);
    throw error;
  }
};
