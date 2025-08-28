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

      // Option 1: Just return transcribed text formatted as bullet points (fastest)
      const sentences = transcribedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
      const simpleBullets = sentences.map(s => `• ${s.trim()}`).join('\n');
      
      // If transcription is short and clear, return it directly
      if (transcribedText.length < 300) {
        return {
          summary: simpleBullets || `• ${transcribedText}`
        };
      }

      // Option 2: Only use AI for longer, complex transcriptions
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Even faster model for basic text formatting
        messages: [
          {
            role: "user",
            content: `Format as bullet points, no additions: "${transcribedText}"`
          },
        ],
        max_tokens: 80,
        temperature: 0,
      });

      const aiFormatted = response.choices[0]?.message?.content || simpleBullets;
      
      return {
        summary: aiFormatted.includes('•') ? aiFormatted : `• ${aiFormatted}`
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