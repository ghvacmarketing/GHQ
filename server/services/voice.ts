import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class VoiceService {
  async transcribeWithContext(audioBuffer: Buffer, filename: string, context?: string): Promise<{ summary: string }> {
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

      const transcribedText = transcription.text.trim();

      // Check if transcription is meaningful (at least 10 characters and contains actual words)
      if (!transcribedText || transcribedText.length < 10) {
        return {
          summary: "NO_AUDIO_DETECTED"
        };
      }

      // If context is provided, use it to better format the response
      if (context) {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You are helping format spoken input for a specific field. The user is speaking to fill in: "${context}". Your job is to clean up their speech, fix grammar, and format it appropriately for that field. Keep it concise and natural. Just return the cleaned-up text without any extra commentary.`
            },
            {
              role: "user",
              content: transcribedText
            },
          ],
          max_tokens: 200,
          temperature: 0.3,
        });

        const formatted = response.choices[0]?.message?.content?.trim() || transcribedText;
        return { summary: formatted };
      }

      // Return raw transcription if no context
      return { summary: transcribedText };

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

      const transcribedText = transcription.text.trim();

      // Check if transcription is meaningful (at least 10 characters and contains actual words)
      if (!transcribedText || transcribedText.length < 10) {
        return {
          summary: "NO_AUDIO_DETECTED"
        };
      }

      // Use AI to intelligently summarize the findings
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You're helping an HVAC technician organize their job observations. Create concise bullet points summarizing what they found and observed. Group related items together. Fix grammar and make it professional. Do NOT add any recommendations, solutions, or next steps - only summarize what they actually observed or found. If the input is unclear, silence, or doesn't contain actual observations, respond with exactly: NO_CONTENT"
          },
          {
            role: "user",
            content: `Summarize these observations into clear bullet points:\n\n"${transcribedText}"`
          },
        ],
        max_tokens: 120,
        temperature: 0.3,
      });

      const summary = response.choices[0]?.message?.content?.trim() || "NO_CONTENT";
      
      // If GPT indicates no meaningful content, return special flag
      if (summary === "NO_CONTENT" || summary === "NO_AUDIO_DETECTED") {
        return {
          summary: "NO_AUDIO_DETECTED"
        };
      }
      
      return {
        summary: summary
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