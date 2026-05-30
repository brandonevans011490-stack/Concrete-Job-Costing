const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 8080);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cleanPath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const requested = cleanPath || "index.html";
  const target = path.resolve(root, requested);

  if (!target.startsWith(root)) {
    send(res, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      fs.readFile(path.join(root, "index.html"), (fallbackErr, fallback) => {
        if (fallbackErr) {
          send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
          return;
        }
        send(res, 200, { "Content-Type": types[".html"] }, fallback);
      });
      return;
    }

    const ext = path.extname(target).toLowerCase();
    send(res, 200, {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    }, data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Concrete Job Costing is running at http://127.0.0.1:${port}`);
});
