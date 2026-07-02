import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { requireCrmAuth } from "../../crm-auth";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB max
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

/**
 * Register object storage routes for file uploads.
 *
 * This provides routes for the presigned URL upload flow:
 * 1. POST /api/uploads/request-url - Get a presigned URL for uploading (requires CRM auth)
 * 2. The client then uploads directly to the presigned URL
 *
 * Security:
 * - Upload endpoint requires CRM authentication
 * - File size and MIME type validation
 * - Object serving is protected for private directories
 */
export function registerObjectStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  /**
   * Request a presigned URL for file upload.
   * Requires CRM authentication.
   *
   * Request body (JSON):
   * {
   *   "name": "filename.jpg",
   *   "size": 12345,
   *   "contentType": "image/jpeg"
   * }
   *
   * Response:
   * {
   *   "uploadURL": "https://storage.googleapis.com/...",
   *   "objectPath": "/objects/uploads/uuid"
   * }
   */
  app.post("/api/uploads/request-url", requireCrmAuth, async (req: Request, res: Response) => {
    try {
      const { name, size, contentType } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Missing required field: name",
        });
      }

      // Validate file size
      if (size && size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        });
      }

      // Validate content type
      if (contentType && !ALLOWED_MIME_TYPES.includes(contentType)) {
        return res.status(400).json({
          error: "File type not allowed",
          allowedTypes: ALLOWED_MIME_TYPES,
        });
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();

      // Extract object path from the presigned URL for later reference
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json({
        uploadURL,
        objectPath,
        // Echo back the metadata for client convenience
        metadata: { name, size, contentType },
      });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  /**
   * Local-filesystem upload target (off Replit only). The presigned-URL flow's
   * "uploadURL" points here in local mode; the browser PUTs the raw file and we
   * write it to disk. Write-once by random id, size/type validated.
   */
  app.put(
    "/api/uploads/local/:id",
    express.raw({ type: () => true, limit: MAX_FILE_SIZE }),
    async (req: Request, res: Response) => {
      try {
        if (!objectStorageService.isLocal()) {
          return res.status(404).json({ error: "Not found" });
        }
        const id = req.params.id;
        if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) {
          return res.status(400).json({ error: "Invalid upload id" });
        }
        const body = req.body as Buffer;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          return res.status(400).json({ error: "Empty upload" });
        }
        const contentType = (req.headers["content-type"] as string) || "application/octet-stream";
        await objectStorageService.saveUpload(id, body, contentType);
        res.status(200).json({ ok: true });
      } catch (error) {
        console.error("Error saving upload:", error);
        res.status(500).json({ error: "Failed to save upload" });
      }
    },
  );

  /**
   * Serve uploaded objects (local disk or object storage).
   *
   * GET /objects/:objectPath(*)
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      await objectStorageService.serveObject(req.path, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

