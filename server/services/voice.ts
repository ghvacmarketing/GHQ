import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class VoiceService {
  async transcribeAndSummarize(audioBuffer: Buffer, filename: string): Promise<{ summary: string }> {
    // Save audio file temporarily
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempFilePath = path.join(tempDir, `${randomUUID()}-${filename}`);
    fs.writeFileSync(tempFilePath, audioBuffer);

    try {
      // Step 1: Transcribe audio to text
      const audioReadStream = fs.createReadStream(tempFilePath);
      const transcription = await openai.audio.transcriptions.create({
        file: audioReadStream,
        model: "whisper-1",
      });

      const transcribedText = transcription.text;

      // Simple cleanup only - no analysis or recommendations
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Fast model for text cleanup
        messages: [
          {
            role: "user",
            content: `Fix grammar and format as bullet points. Do NOT add recommendations. Only clean up what was said:

"${transcribedText}"

Return only bullet points of what was stated.`
          },
        ],
        max_tokens: 100, // Short and fast
        temperature: 0, // No creativity, just cleanup
      });

      const cleanedText = response.choices[0]?.message?.content || `• ${transcribedText}`;
      
      return {
        summary: cleanedText.includes('•') ? cleanedText : `• ${cleanedText}`
      };

    } catch (error) {
      console.error('Error processing voice recording:', error);
      throw new Error('Failed to process voice recording');
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }
}

export const voiceService = new VoiceService();