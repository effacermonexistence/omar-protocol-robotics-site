const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const cleanPath = decoded === "/" ? "/index.html" : decoded;
  const absolutePath = path.resolve(ROOT, `.${cleanPath}`);

  if (!absolutePath.startsWith(ROOT + path.sep) && absolutePath !== ROOT) {
    return null;
  }

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
    return absolutePath;
  }

  if (!path.extname(cleanPath)) {
    return path.join(ROOT, "index.html");
  }

  return null;
}

function sendFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const isHtml = ext === ".html";
  const headers = {
    "Accept-Ranges": "bytes",
    "Cache-Control": isHtml ? "no-store" : "public, max-age=31536000, immutable",
    "Content-Type": TYPES[ext] || "application/octet-stream"
  };

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;
    if (start > end || start >= stat.size || end >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      ...headers,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": stat.size });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const filePath = resolvePath(url.pathname);

    if (!filePath) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    sendFile(req, res, filePath);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Internal server error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Omar Protocol robotics site listening on ${PORT}`);
});
