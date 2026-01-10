import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const VECTOR_STORE_NAME = "ghvac-product-knowledge";

let cachedVectorStoreId: string | null = null;

let vectorStoreUnavailable = false;

export async function getOrCreateVectorStore(): Promise<string> {
  if (cachedVectorStoreId) {
    return cachedVectorStoreId;
  }

  if (vectorStoreUnavailable) {
    throw new Error("Vector store API not available in this environment");
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
  } catch (error: any) {
    if (error?.status === 405) {
      vectorStoreUnavailable = true;
      console.log("Vector store API not supported in this environment - knowledge base features disabled");
    } else {
      console.error("Error getting/creating vector store:", error);
    }
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
  if (vectorStoreUnavailable) {
    return [];
  }
  
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
    
    await openai.vectorStores.files.delete(vectorStoreId, fileId);
    await openai.files.delete(fileId);
    
    console.log(`Deleted file ${fileId} from vector store`);
    return true;
  } catch (error) {
    console.error("Error deleting file from vector store:", error);
    return false;
  }
}

export async function searchVectorStore(query: string): Promise<string> {
  if (vectorStoreUnavailable) {
    return "";
  }
  
  try {
    const vectorStoreId = await getOrCreateVectorStore();
    
    const files = await openai.vectorStores.files.list(vectorStoreId);
    if (files.data.length === 0) {
      console.log("Vector store is empty, skipping search");
      return "";
    }

    console.log(`Searching vector store ${vectorStoreId} for: ${query.substring(0, 100)}...`);

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: `Extract the most relevant product details, specifications, rebates, and selling points for: ${query}`,
      tools: [
        {
          type: "file_search",
          vector_store_ids: [vectorStoreId],
          max_num_results: 5,
        } as any
      ],
    });

    const outputText = (response as any).output_text || "";
    console.log(`Vector store search returned ${outputText.length} chars`);
    return outputText;
  } catch (error) {
    console.error("Error searching vector store:", error);
    throw error;
  }
}

export async function seedVectorStoreWithSalesBook(): Promise<boolean> {
  // First, check if vector store is available by trying to get/create it
  try {
    await getOrCreateVectorStore();
  } catch (error) {
    // If we get here, vectorStoreUnavailable should now be set
    if (vectorStoreUnavailable) {
      return false;
    }
    throw error;
  }
  
  try {
    const files = await listVectorStoreFiles();
    if (files.length > 0) {
      console.log("Vector store already has files, skipping seed.");
      return true;
    }

    const salesBookPath = path.join(process.cwd(), "attached_assets", "Chandler_Sales_Book_1766587153181.pdf");
    
    if (!fs.existsSync(salesBookPath)) {
      console.log("Sales book PDF not found, skipping seed.");
      return false;
    }

    console.log("Seeding vector store with sales book...");
    await uploadFileToVectorStore(salesBookPath, "Chandler_Sales_Book.pdf");
    console.log("Sales book uploaded successfully to vector store.");
    return true;
  } catch (error) {
    console.error("Error seeding vector store:", error);
    return false;
  }
}

export async function uploadCRMKnowledgeBase(): Promise<boolean> {
  if (vectorStoreUnavailable) {
    console.log("Vector store unavailable, skipping CRM knowledge base upload.");
    return false;
  }

  try {
    await getOrCreateVectorStore();
    
    const files = await listVectorStoreFiles();
    const hasKnowledgeBase = files.some(f => f.filename.includes("crm-knowledge-base"));
    
    if (hasKnowledgeBase) {
      console.log("CRM knowledge base already in vector store.");
      return true;
    }

    const kbPath = path.join(process.cwd(), "server", "data", "crm-knowledge-base.md");
    
    if (!fs.existsSync(kbPath)) {
      console.log("CRM knowledge base file not found.");
      return false;
    }

    console.log("Uploading CRM knowledge base to vector store...");
    await uploadFileToVectorStore(kbPath, "crm-knowledge-base.md");
    console.log("CRM knowledge base uploaded successfully.");
    return true;
  } catch (error) {
    console.error("Error uploading CRM knowledge base:", error);
    return false;
  }
}

export function isVectorStoreUnavailable(): boolean {
  return vectorStoreUnavailable;
}

export { cachedVectorStoreId };
