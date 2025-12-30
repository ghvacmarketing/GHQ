import type { Express, Request, Response, NextFunction } from "express";
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
   * Serve uploaded objects.
   *
   * GET /objects/:objectPath(*)
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}

