import { GoogleGenAI, Type } from "@google/genai";
import { SchemaMapping } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export const analyzeXMLSchema = async (xmlSnippet: string): Promise<SchemaMapping> => {
  // 1. Fast-path: Robust Sage EAS Log detection
  // Checks for common Sage tags: <log>, <entry>, <zczc>, or specific header info
  const lowerSnippet = xmlSnippet.toLowerCase();
  if (
    (lowerSnippet.includes('<log>') && lowerSnippet.includes('<entry>')) ||
    lowerSnippet.includes('<zczc>') || 
    lowerSnippet.includes('sage')
  ) {
    console.log("Detected Sage EAS Log format. Using specialized compliance processor.");
    return {
      rootElement: 'log',
      rowElement: 'entry',
      dateField: 'date',
      fieldsToExport: [], // Not used in strict Sage mode
      isSage: true
    };
  }

  if (!apiKey) {
    // Fallback if no API key, just try to return a generic mapping to avoid crash
    return {
      rootElement: 'root',
      rowElement: 'row',
      dateField: 'date',
      fieldsToExport: ['date', 'details']
    };
  }

  const model = 'gemini-2.5-flash';
  
  const prompt = `
    Analyze the following XML snippet.
    I need to parse this into a flat table.
    
    1. Identify the 'rootElement' (the container tag).
    2. Identify the 'rowElement' (the repeating tag representing a record).
    3. Identify the most likely 'dateField' (key inside the row) that represents the transaction date (look for YYYY-MM-DD or similar formats).
    4. List all relevant 'fieldsToExport' found in the row that should be columns in an Excel file.

    XML Snippet:
    \`\`\`xml
    ${xmlSnippet}
    \`\`\`
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rootElement: { type: Type.STRING, description: "The name of the root/list tag" },
            rowElement: { type: Type.STRING, description: "The name of the repeating item tag" },
            dateField: { type: Type.STRING, description: "The key of the date field within a row" },
            fieldsToExport: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of tag names within a row to be used as columns"
            }
          },
          required: ["rootElement", "rowElement", "dateField", "fieldsToExport"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as SchemaMapping;
  } catch (error) {
    console.error("Gemini Analysis Failed", error);
    throw error;
  }
};
