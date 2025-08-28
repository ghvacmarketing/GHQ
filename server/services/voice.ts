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

      // Step 2: Summarize transcription into bullet points
      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `You are an HVAC technician assistant. Convert the following voice notes into clear, concise bullet points about the job findings, issues, and recommendations. 

Format the response as JSON with a 'summary' field containing bullet points using markdown format like this:
• Finding 1
• Issue 2
• Recommendation 3

Focus on technical details, part conditions, system performance, and any repairs or replacements needed.`
          },
          {
            role: "user",
            content: transcribedText,
          },
        ],
        response_format: { type: "json_object" },
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