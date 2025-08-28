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

      // Step 2: Summarize transcription into bullet points using faster model
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Faster, cheaper model for simple summarization
        messages: [
          {
            role: "system",
            content: `Convert HVAC technician voice notes to bullet points. Only include what the technician actually observed or said - no assumptions, recommendations, or additions unless specifically mentioned.

Format as JSON with 'summary' field containing bullet points:
• What was found/observed
• Issues mentioned
• Only include recommendations if technician specifically stated them

Keep it brief and factual.`
          },
          {
            role: "user",
            content: transcribedText,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 150, // Reduced for faster processing
        temperature: 0.1, // Very low for factual accuracy
      });

      const result = JSON.parse(response.choices[0].message.content || '{"summary": "Unable to process voice notes"}');
      
      return {
        summary: result.summary || "Unable to process voice notes"
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