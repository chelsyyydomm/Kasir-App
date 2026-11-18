import { GoogleGenAI } from '@google/genai';

export function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export const GEMINI_ASSISTANT_MODEL = 'gemini-4-hydrogen';
