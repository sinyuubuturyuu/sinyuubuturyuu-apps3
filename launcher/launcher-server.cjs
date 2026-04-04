const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const rootDir = __dirname;
const requestedPort = Number(process.argv[2] || process.env.PORT || 8080);
const host = "0.0.0.0";
const maxPortAttempts = 20;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".ico", "image/x-icon"]
]);

function send(response, statusCode, headers, body) {
  response.writeHead(statusCode, headers);
  response.end(body);
}

function safeResolve(requestPath) {
  const decodedPath = decodeURIComponent((requestPath || "/").split("?")[0]);
  const normalizedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const resolvedPath = path.resolve(rootDir, "." + normalizedPath);

  if (!resolvedPath.startsWith(rootDir)) {
    return null;
  }

  return resolvedPath;
}

function serveJson(response, payload) {
  send(
    response,
    200,
    {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    JSON.stringify(payload, null, 2)
  );
}

function pickLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    if (!addresses) {
      continue;
    }

    for (const address of addresses) {
      const family = typeof address.family === "string" ? address.family : String(address.family);
      if (family !== "IPv4" || address.internal) {
        continue;
      }

      return address.address;
    }
  }

  return null;
}

const server = http.createServer((request, response) => {
  if ((request.url || "").startsWith("/__launcher/meta")) {
    const address = server.address();
    const activePort = address && typeof address === "object" ? address.port : requestedPort;
    const lanAddress = pickLanAddress();
    const localhostOrigin = `http://127.0.0.1:${activePort}`;
    const preferredOrigin = lanAddress ? `http://${lanAddress}:${activePort}` : localhostOrigin;

    serveJson(response, {
      port: activePort,
      bindHost: host,
      lanAddress,
      localhostOrigin,
      preferredOrigin,
      mobileAppPath: "/sinyuubuturyuu/index.html",
      pcAppPath: "/sinyuubuturyuu-pc/index.html"
    });
    return;
  }

  const resolvedPath = safeResolve(request.url || "/");
  if (!resolvedPath) {
    send(response, 403, { "Content-Type": "text/plain; charset=utf-8" }, "Forbidden");
    return;
  }

  fs.stat(resolvedPath, (statError, stats) => {
    if (statError) {
      send(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
      return;
    }

    const filePath = stats.isDirectory() ? path.join(resolvedPath, "index.html") : resolvedPath;
    fs.readFile(filePath, (readError, data) => {
      if (readError) {
        send(response, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes.get(extension) || "application/octet-stream";
      send(response, 200, { "Content-Type": contentType, "Cache-Control": "no-store" }, data);
    });
  });
});

function startServer(port, attemptsRemaining) {
  server.once("error", (error) => {
    if (error && error.code === "EADDRINUSE" && attemptsRemaining > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use. Retrying on ${nextPort}...`);
      startServer(nextPort, attemptsRemaining - 1);
      return;
    }

    throw error;
  });

  server.listen(port, host, () => {
    const address = server.address();
    const activePort = address && typeof address === "object" ? address.port : port;
    const localhostUrl = `http://127.0.0.1:${activePort}`;
    const lanAddress = pickLanAddress();
    console.log(`Launcher server running at ${localhostUrl}`);
    if (lanAddress) {
      console.log(`LAN access URL: http://${lanAddress}:${activePort}`);
    }
    console.log(`VSCode task ready: ${localhostUrl}`);
  });
}

startServer(requestedPort, maxPortAttempts);
