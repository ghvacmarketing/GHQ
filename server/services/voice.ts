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

  async formatText(text: string, cleanupLevel: number): Promise<{ steps: Array<{ stepNumber: number; instruction: string }> }> {
    try {
      const cleanupInstructions = this.getCleanupInstructions(cleanupLevel);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are helping an HVAC technician format process steps. Parse the provided text and convert it into a numbered list of clear, actionable steps.

${cleanupInstructions}

Return ONLY a JSON array of steps in this exact format:
[
  {"stepNumber": 1, "instruction": "First step text"},
  {"stepNumber": 2, "instruction": "Second step text"}
]

Do not include any markdown, explanations, or extra text - just the raw JSON array.`
          },
          {
            role: "user",
            content: text
          },
        ],
        max_tokens: 1500,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim() || "[]";
      
      // Parse the JSON response
      let steps = JSON.parse(content);
      
      // Ensure proper step numbering
      steps = steps.map((step: any, index: number) => ({
        stepNumber: index + 1,
        instruction: step.instruction || step.text || String(step)
      }));

      return { steps };

    } catch (error) {
      console.error('Error formatting text:', error);
      throw new Error('Failed to format text into steps');
    }
  }

  async transcribeFullProcess(audioBuffer: Buffer, filename: string, cleanupLevel: number): Promise<{
    name: string;
    description: string;
    category: string;
    steps: Array<{ stepNumber: number; instruction: string }>;
  }> {
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

      // Check if transcription is meaningful
      if (!transcribedText || transcribedText.length < 20) {
        throw new Error('NO_AUDIO_DETECTED');
      }

      // Step 2: Use AI to extract structured process data
      const cleanupInstructions = this.getCleanupInstructions(cleanupLevel);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are helping an HVAC technician create a structured process from their spoken description. Extract the following information from their speech:

1. Process Name (a short, clear title)
2. Description (brief summary of what the process does)
3. Category (should be one of: Maintenance, Repair, Installation, Troubleshooting, Safety, or Other)
4. Steps (numbered list of instructions)

${cleanupInstructions}

Return ONLY a JSON object in this exact format:
{
  "name": "Process name here",
  "description": "Brief description here",
  "category": "Category name",
  "steps": [
    {"stepNumber": 1, "instruction": "First step"},
    {"stepNumber": 2, "instruction": "Second step"}
  ]
}

Do not include any markdown, explanations, or extra text - just the raw JSON object.`
          },
          {
            role: "user",
            content: `Extract process information from this transcription:\n\n${transcribedText}`
          },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content?.trim() || "{}";
      
      // Parse the JSON response
      const processData = JSON.parse(content);
      
      // Ensure proper step numbering
      if (processData.steps && Array.isArray(processData.steps)) {
        processData.steps = processData.steps.map((step: any, index: number) => ({
          stepNumber: index + 1,
          instruction: step.instruction || step.text || String(step)
        }));
      } else {
        processData.steps = [];
      }

      return {
        name: processData.name || "Untitled Process",
        description: processData.description || "",
        category: processData.category || "Other",
        steps: processData.steps
      };

    } catch (error) {
      console.error('Error processing full process recording:', error);
      if (error instanceof Error && error.message === 'NO_AUDIO_DETECTED') {
        throw error;
      }
      throw new Error('Failed to process voice recording');
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  private getCleanupInstructions(level: number): string {
    switch (level) {
      case 1:
        return "Level 1 - Minimal cleanup: Just split into clear steps and fix obvious typos. Keep the original wording and style as much as possible.";
      case 2:
        return "Level 2 - Light cleanup: Fix grammar and make steps clear, but keep casual language and the technician's natural voice.";
      case 3:
        return "Level 3 - Moderate cleanup: Fix grammar, standardize format, make instructions clear and concise. Use professional but approachable language.";
      case 4:
        return "Level 4 - Heavy cleanup: Polish language to be professional and technical. Make steps very clear and well-organized. Remove unnecessary words.";
      case 5:
        return "Level 5 - Maximum polish: Create highly professional, concise steps with proper technical terminology. Optimize for clarity and brevity.";
      default:
        return "Level 3 - Moderate cleanup: Fix grammar, standardize format, make instructions clear and concise. Use professional but approachable language.";
    }
  }
}

export const voiceService = new VoiceService();