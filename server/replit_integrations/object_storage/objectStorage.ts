import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ── Storage backends ───────────────────────────────────────────────────────
// On Replit, files live in GCS via the sidecar (REPL_ID is set). Everywhere else
// — local dev and any cloud/VPS deployment — files are stored in the app's Neon
// database (object_store table), so uploads work wherever the app is launched
// with no extra service/credentials. Object paths encode the backend:
//   /objects/db/<key>     -> Neon (object_store row)
//   /objects/local/<id>   -> local disk (legacy fallback, still readable)
//   /objects/<other>      -> Replit GCS
const DB_PREFIX = "/objects/db/";
const LOCAL_PREFIX = "/objects/local/";
const LOCAL_OBJECT_DIR = path.join(process.cwd(), "uploads", "objects");

// True when NOT running on Replit → use the Neon-backed object store.
function useDbStorage(): boolean {
  return !process.env.REPL_ID;
}
function idFromPath(objectPath: string, prefix: string): string {
  return objectPath.slice(prefix.length).split(/[?#]/)[0];
}
function localFiles(id: string) {
  return { data: path.join(LOCAL_OBJECT_DIR, id), meta: path.join(LOCAL_OBJECT_DIR, `${id}.type`) };
}

// ── Neon object_store helpers ──────────────────────────────────────────────
async function dbSave(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO object_store (key, content_type, data, size)
    VALUES (${key}, ${contentType}, ${buffer}, ${buffer.length})
    ON CONFLICT (key) DO UPDATE
      SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, size = EXCLUDED.size
  `);
}
async function dbRead(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  const r = await db.execute(sql`SELECT content_type, data FROM object_store WHERE key = ${key} LIMIT 1`);
  const row = (r as any).rows?.[0];
  if (!row) return null;
  const data = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  return { data, contentType: row.content_type || "application/octet-stream" };
}

// The object storage client is used to interact with the object storage service.
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // True when uploads are handled by the app (Neon DB / local disk) rather than
  // Replit GCS — i.e. the browser PUTs to our own /api/uploads/local/<id> route.
  isLocal(): boolean {
    return useDbStorage();
  }

  // Persist raw bytes for an upload id (called by the PUT upload route).
  // Off Replit this writes to Neon; the returned scheme is chosen by the caller.
  async saveUpload(id: string, buffer: Buffer, contentType: string): Promise<void> {
    if (useDbStorage()) {
      await dbSave(id, buffer, contentType || "application/octet-stream");
      return;
    }
    // (Only reached if explicitly using disk.) Write to local disk.
    fs.mkdirSync(LOCAL_OBJECT_DIR, { recursive: true });
    const { data, meta } = localFiles(id);
    fs.writeFileSync(data, buffer);
    fs.writeFileSync(meta, contentType || "application/octet-stream");
  }

  // Read the raw bytes of an object (Neon DB, local disk, or GCS) by /objects/... path.
  async readObjectBytes(objectPath: string): Promise<Buffer> {
    if (objectPath.startsWith(DB_PREFIX)) {
      const obj = await dbRead(idFromPath(objectPath, DB_PREFIX));
      if (!obj) throw new ObjectNotFoundError();
      return obj.data;
    }
    if (objectPath.startsWith(LOCAL_PREFIX)) {
      const { data } = localFiles(idFromPath(objectPath, LOCAL_PREFIX));
      if (!fs.existsSync(data)) throw new ObjectNotFoundError();
      return fs.readFileSync(data);
    }
    const file = await this.getObjectEntityFile(objectPath);
    const [buf] = await file.download();
    return buf;
  }

  // Write raw bytes to storage (server-side) and return the /objects/... path.
  async writeObject(buffer: Buffer, contentType: string): Promise<string> {
    if (useDbStorage()) {
      const id = randomUUID();
      await dbSave(id, buffer, contentType || "application/octet-stream");
      return `${DB_PREFIX}${id}`;
    }
    const uploadURL = await this.getObjectEntityUploadURL();
    const res = await fetch(uploadURL, { method: "PUT", body: buffer, headers: { "Content-Type": contentType } });
    if (!res.ok) throw new Error(`Failed to write object (status ${res.status})`);
    return this.normalizeObjectEntityPath(uploadURL);
  }

  // Serve an object (Neon DB, local disk, or GCS) to an Express response.
  async serveObject(objectPath: string, res: Response, cacheTtlSec: number = 3600): Promise<void> {
    if (objectPath.startsWith(DB_PREFIX)) {
      const obj = await dbRead(idFromPath(objectPath, DB_PREFIX));
      if (!obj) throw new ObjectNotFoundError();
      res.set({
        "Content-Type": obj.contentType,
        "Content-Length": String(obj.data.length),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });
      res.end(obj.data);
      return;
    }
    if (objectPath.startsWith(LOCAL_PREFIX)) {
      const { data, meta } = localFiles(idFromPath(objectPath, LOCAL_PREFIX));
      if (!fs.existsSync(data)) throw new ObjectNotFoundError();
      const contentType = fs.existsSync(meta) ? fs.readFileSync(meta, "utf-8").trim() : "application/octet-stream";
      const stat = fs.statSync(data);
      res.set({
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });
      fs.createReadStream(data).pipe(res);
      return;
    }
    const file = await this.getObjectEntityFile(objectPath);
    await this.downloadObject(file, res, cacheTtlSec);
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    if (this.isLocal()) {
      // Relative, same-origin URL the browser PUTs the file to (server-mediated).
      return `/api/uploads/local/${randomUUID()}`;
    }
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    // Server-mediated upload URL ("/api/uploads/local/<id>") -> object path.
    // Off Replit the bytes are stored in Neon, so it maps to /objects/db/<id>.
    const localMatch = rawPath.match(/\/api\/uploads\/local\/([^/?#]+)/);
    if (localMatch) {
      return `${useDbStorage() ? DB_PREFIX : LOCAL_PREFIX}${localMatch[1]}`;
    }
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

