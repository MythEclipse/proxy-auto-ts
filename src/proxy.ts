import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import pino from "pino";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

const sources = [
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://www.proxy-list.download/api/v1/get?type=http",
  "https://www.proxy-list.download/api/v1/get?type=https",
];

// Fungsi untuk mengambil URL dengan timeout 6 detik
async function fetchUrl(url: string): Promise<string | null> {
  logger.info(`Fetching URL: ${url}`);
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
      timeout: 20000, // Timeout 6 detik
    });
    logger.info(`Fetched URL successfully: ${url}`);
    return response.data;
  } catch (error) {
    logger.error({ err: error }, `Error fetching ${url}`);
    return null;
  }
}

// Parse proxy list dan simpan dalam Set
function parseProxyList(content: string, proxies: Set<string>): void {
  logger.info(`Parsing proxy list content`);
  if (!content) return;

  const lines = content.split("\n");
  for (const line of lines) {
    const cleanedLine = line.trim();
    if (cleanedLine && cleanedLine.includes(":")) {
      const proxy = cleanedLine.split(" ")[0];
      if (proxy) {
        const [host, port] = proxy.split(":");
        if (
          host &&
          port &&
          !isNaN(Number(port)) &&
          Number(port) >= 1 &&
          Number(port) <= 65535
        ) {
          proxies.add(`${host}:${port}`);
        }
      }
    }
  }
  logger.info(`Parsed ${proxies.size} proxies`);
}

// Validasi proxy dengan timeout 6 detik
async function validateProxy(proxy: string): Promise<{ proxy: string; latency: number } | null> {
  try {
    const [host, port] = proxy.split(":");
    if (!host || !port) return null;

    const agent = new HttpsProxyAgent(`http://${host}:${port}`);
    const startTime = Date.now();

    await axios.head("https://www.google.com", {
      httpsAgent: agent,
      timeout: 6000, // Timeout 6 detik
    });

    const latency = Date.now() - startTime;
    logger.info(`Proxy ${proxy} is valid with latency ${latency}ms`);
    return { proxy, latency };
  } catch (error) {
    logger.error(`Proxy ${proxy} is invalid`);
    return null;
  }
}

// Validasi proxy dalam batch
async function validateProxies(proxies: Set<string>): Promise<{ proxy: string; latency: number }[]> {
  logger.info(`Validating ${proxies.size} proxies`);
  const validatedProxies: { proxy: string; latency: number }[] = [];
  const proxyArray = Array.from(proxies);
  const limit = pLimit(1000); // Batasi koneksi simultan

  const validationTasks = proxyArray.map((proxy) =>
    limit(async () => {
      const result = await validateProxy(proxy);
      if (result) validatedProxies.push(result);
    })
  );

  await Promise.all(validationTasks);

  // Urutkan berdasarkan latensi terkecil
  return validatedProxies.sort((a, b) => a.latency - b.latency);
}

// Ambil semua proxy dari sumber
async function fetchAllProxies(): Promise<Set<string>> {
  logger.info(`Fetching all proxies from sources`);
  const proxies = new Set<string>();
  for (const url of sources) {
    const content = await fetchUrl(url);
    if (content) {
      parseProxyList(content, proxies);
    }
  }
  logger.info(`Fetched a total of ${proxies.size} proxies`);
  return proxies;
}

// Simpan proxy ke file dengan informasi latensi
function saveProxies(proxies: { proxy: string; latency: number }[]): void {
  if (proxies.length === 0) {
    logger.warn("No proxies found to save!");
    return;
  }

  const timestamp = new Date().toISOString();
  const filePath = path.resolve(__dirname, "../proxies.txt");

  const fileContent = [
    `# Proxy List - Updated: ${timestamp}`,
    `# Total proxies: ${proxies.length}`,
    "",
    ...proxies.map((p) => `${p.proxy}  # ${p.latency}ms`),
  ].join("\n");

  fs.writeFileSync(filePath, fileContent, "utf-8");
  logger.info(`Saved ${proxies.length} proxies to proxies.txt`);
}

// Main function untuk menjalankan semua proses
async function main() {
  logger.info(`Starting proxy fetching and validation process`);
  const proxies = await fetchAllProxies();
  logger.info(`Fetched ${proxies.size} proxies.`);

  const validatedProxies = await validateProxies(proxies);
  logger.info(`Validated ${validatedProxies.length} proxies.`);

  saveProxies(validatedProxies);
  logger.info(`Process completed successfully`);
}

main().catch((error) => logger.error({ err: error }, "Error in main function"));
