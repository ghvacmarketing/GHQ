import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const VECTOR_STORE_NAME = "ghvac-product-knowledge";

let cachedVectorStoreId: string | null = null;

export async function getOrCreateVectorStore(): Promise<string> {
  if (cachedVectorStoreId) {
    return cachedVectorStoreId;
  }

  try {
    const vectorStores = await openai.vectorStores.list();
    const existing = vectorStores.data.find(vs => vs.name === VECTOR_STORE_NAME);
    
    if (existing) {
      cachedVectorStoreId = existing.id;
      console.log(`Using existing vector store: ${existing.id}`);
      return existing.id;
    }

    const vectorStore = await openai.vectorStores.create({
      name: VECTOR_STORE_NAME,
    });
    
    cachedVectorStoreId = vectorStore.id;
    console.log(`Created new vector store: ${vectorStore.id}`);
    return vectorStore.id;
  } catch (error) {
    console.error("Error getting/creating vector store:", error);
    throw error;
  }
}

export async function uploadFileToVectorStore(
  filePath: string,
  fileName: string
): Promise<{ fileId: string; vectorStoreId: string }> {
  const vectorStoreId = await getOrCreateVectorStore();

  const fileStream = fs.createReadStream(filePath);
  
  const file = await openai.files.create({
    file: fileStream,
    purpose: "assistants",
  });

  console.log(`Uploaded file ${fileName} with ID: ${file.id}`);

  await openai.vectorStores.files.create(vectorStoreId, {
    file_id: file.id,
  });

  console.log(`Added file ${file.id} to vector store ${vectorStoreId}`);

  return { fileId: file.id, vectorStoreId };
}

export async function uploadBufferToVectorStore(
  buffer: Buffer,
  fileName: string
): Promise<{ fileId: string; vectorStoreId: string }> {
  const vectorStoreId = await getOrCreateVectorStore();

  const tempPath = path.join("/tmp", `upload_${Date.now()}_${fileName}`);
  fs.writeFileSync(tempPath, buffer);

  try {
    const fileStream = fs.createReadStream(tempPath);
    
    const file = await openai.files.create({
      file: fileStream,
      purpose: "assistants",
    });

    console.log(`Uploaded file ${fileName} with ID: ${file.id}`);

    await openai.vectorStores.files.create(vectorStoreId, {
      file_id: file.id,
    });

    console.log(`Added file ${file.id} to vector store ${vectorStoreId}`);

    return { fileId: file.id, vectorStoreId };
  } finally {
    fs.unlinkSync(tempPath);
  }
}

export async function listVectorStoreFiles(): Promise<Array<{
  id: string;
  filename: string;
  status: string;
  createdAt: number;
}>> {
  try {
    const vectorStoreId = await getOrCreateVectorStore();
    const files = await openai.vectorStores.files.list(vectorStoreId);
    
    const fileDetails = await Promise.all(
      files.data.map(async (vsFile) => {
        try {
          const file = await openai.files.retrieve(vsFile.id);
          return {
            id: vsFile.id,
            filename: file.filename,
            status: vsFile.status,
            createdAt: file.created_at,
          };
        } catch {
          return {
            id: vsFile.id,
            filename: "Unknown",
            status: vsFile.status,
            createdAt: 0,
          };
        }
      })
    );
    
    return fileDetails;
  } catch (error) {
    console.error("Error listing vector store files:", error);
    return [];
  }
}

export async function deleteFileFromVectorStore(fileId: string): Promise<boolean> {
  try {
    const vectorStoreId = await getOrCreateVectorStore();
    
    await openai.vectorStores.files.del(vectorStoreId, fileId);
    await openai.files.del(fileId);
    
    console.log(`Deleted file ${fileId} from vector store`);
    return true;
  } catch (error) {
    console.error("Error deleting file from vector store:", error);
    return false;
  }
}

export async function searchVectorStore(query: string): Promise<string> {
  try {
    const vectorStoreId = await getOrCreateVectorStore();
    
    const files = await openai.vectorStores.files.list(vectorStoreId);
    if (files.data.length === 0) {
      return "";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts relevant product information from the knowledge base. Return only the most relevant product details, specifications, and pricing information that matches the query."
        },
        {
          role: "user",
          content: query
        }
      ],
      tools: [
        {
          type: "file_search",
          file_search: {
            vector_store_ids: [vectorStoreId],
          }
        } as any
      ],
      tool_choice: "auto",
      max_completion_tokens: 1024,
    });

    const content = response.choices[0]?.message?.content || "";
    return content;
  } catch (error) {
    console.error("Error searching vector store:", error);
    return "";
  }
}

export { cachedVectorStoreId };
