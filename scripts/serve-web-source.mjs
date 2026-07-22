import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { extname, join, resolve } from "node:path";

const port = Number(process.env.WEB_PORT ?? 5173);
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:8787";
const rootDir = resolve("apps/web");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function sendFile(filePath, response) {
  const extension = extname(filePath);
  response.statusCode = 200;
  response.setHeader("Content-Type", mimeTypes[extension] ?? "application/octet-stream");
  createReadStream(filePath).pipe(response);
}

function proxyToApi(incomingRequest, response) {
  const requestUrl = new URL(incomingRequest.url ?? "/", apiOrigin);

  const proxyRequest = httpRequest(
    {
      method: incomingRequest.method,
      hostname: requestUrl.hostname,
      port: requestUrl.port || (requestUrl.protocol === "https:" ? 443 : 80),
      path: `${requestUrl.pathname}${requestUrl.search}`,
      headers: {
        ...incomingRequest.headers,
        host: requestUrl.host,
      },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", () => {
    response.statusCode = 502;
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("API unavailable. Make sure the API server is running on port 8787.");
  });

  incomingRequest.pipe(proxyRequest);
}

createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname.startsWith("/api") || pathname === "/health") {
    proxyToApi(request, response);
    return;
  }

  let filePathname = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(rootDir, filePathname);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(filePath, response);
    return;
  }

  sendFile(join(rootDir, "index.html"), response);
}).listen(port, () => {
  console.log(`India Travel Planner UI running on http://localhost:${port}`);
  console.log(`Proxying /api and /health to ${apiOrigin}`);
});
