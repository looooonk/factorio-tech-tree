import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";

const baseDir = path.join(process.cwd(), "data", "tech_images");

function resolveImagePath(rawPath: string) {
  const normalized = path.normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.join(process.cwd(), normalized);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return resolved;
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get("path");
  if (!rawPath) {
    return new Response("Missing path", { status: 400 });
  }

  const resolved = resolveImagePath(rawPath);
  if (!resolved) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const file = await fs.readFile(resolved);
    return new Response(file, {
      headers: {
        "Content-Type": contentTypeFor(resolved),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
