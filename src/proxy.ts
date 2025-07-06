import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import pino from "pino";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Types
interface ValidatedProxy {
  proxy: string;
  latency: number;
}

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG = {
  FETCH_TIMEOUT: 20000,
  VALIDATION_TIMEOUT: 6000,
  VALIDATION_CONCURRENCY: 50, // Reduced from 1000 for better stability
  TEST_URL: "https://www.google.com",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
} as const;

const PROXY_SOURCES = [
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://www.proxy-list.download/api/v1/get?type=http",
  "https://www.proxy-list.download/api/v1/get?type=https",
] as const;

// Logger setup
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

// Utility functions
class ProxyUtils {
  static isValidPort(port: string): boolean {
    const portNum = Number(port);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  }

  static formatProxy(host: string, port: string): string {
    return `${host}:${port}`;
  }

  static parseProxyLine(line: string): string | null {
    const cleanedLine = line.trim();
    if (!cleanedLine?.includes(":")) return null;

    const proxy = cleanedLine.split(" ")[0];
    if (!proxy) return null;

    const [host, port] = proxy.split(":");
    if (!host || !port || !this.isValidPort(port)) return null;

    return this.formatProxy(host, port);
  }

  static generateFileContent(proxies: ValidatedProxy[]): string {
    const timestamp = new Date().toISOString();
    return [
      `# Proxy List - Updated: ${timestamp}`,
      `# Total proxies: ${proxies.length}`,
      "",
      ...proxies.map((p) => `${p.proxy}  # ${p.latency}ms`),
    ].join("\n");
  }
}

// HTTP Client
class HttpClient {
  private static async makeRequest(url: string, options: any = {}): Promise<any> {
    return axios.get(url, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
      },
      timeout: CONFIG.FETCH_TIMEOUT,
      ...options,
    });
  }

  static async fetchUrl(url: string): Promise<string | null> {
    logger.info(`Fetching URL: ${url}`);
    try {
      const response = await this.makeRequest(url);
      logger.info(`Successfully fetched: ${url}`);
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Failed to fetch ${url}`);
      return null;
    }
  }

  static async validateProxy(proxy: string): Promise<ValidatedProxy | null> {
    const [host, port] = proxy.split(":");
    if (!host || !port) return null;

    try {
      const agent = new HttpsProxyAgent(`http://${proxy}`);
      const startTime = Date.now();

      await axios.head(CONFIG.TEST_URL, {
        httpsAgent: agent,
        timeout: CONFIG.VALIDATION_TIMEOUT,
      });

      const latency = Date.now() - startTime;
      logger.info(`Proxy ${proxy} validated - latency: ${latency}ms`);
      return { proxy, latency };
    } catch (error) {
      logger.debug(`Proxy ${proxy} validation failed: ${(error as Error).message}`);
      return null;
    }
  }
}

// Proxy Service
class ProxyService {
  private static parseProxyList(content: string): Set<string> {
    logger.info("Parsing proxy list content");
    if (!content) return new Set();

    const proxies = new Set<string>();
    const lines = content.split("\n");
    
    for (const line of lines) {
      const proxy = ProxyUtils.parseProxyLine(line);
      if (proxy) {
        proxies.add(proxy);
      }
    }

    logger.info(`Parsed ${proxies.size} unique proxies`);
    return proxies;
  }

  static async fetchAllProxies(): Promise<Set<string>> {
    logger.info("Fetching proxies from all sources");
    const allProxies = new Set<string>();
    
    for (const url of PROXY_SOURCES) {
      const content = await HttpClient.fetchUrl(url);
      if (content) {
        const proxies = this.parseProxyList(content);
        proxies.forEach(proxy => allProxies.add(proxy));
      }
    }
    
    logger.info(`Fetched total of ${allProxies.size} unique proxies`);
    return allProxies;
  }

  static async validateProxies(proxies: Set<string>): Promise<ValidatedProxy[]> {
    logger.info(`Starting validation of ${proxies.size} proxies`);
    const validatedProxies: ValidatedProxy[] = [];
    const proxyArray = Array.from(proxies);
    const limit = pLimit(CONFIG.VALIDATION_CONCURRENCY);

    const validationTasks = proxyArray.map((proxy) =>
      limit(async () => {
        const result = await HttpClient.validateProxy(proxy);
        if (result) {
          validatedProxies.push(result);
        }
      })
    );

    await Promise.all(validationTasks);

    // Sort by latency (fastest first)
    validatedProxies.sort((a, b) => a.latency - b.latency);
    logger.info(`Validated ${validatedProxies.length} working proxies`);
    
    return validatedProxies;
  }

  static saveProxies(proxies: ValidatedProxy[]): void {
    if (proxies.length === 0) {
      logger.warn("No proxies to save!");
      return;
    }

    const filePath = path.resolve(__dirname, "../proxies.txt");
    const fileContent = ProxyUtils.generateFileContent(proxies);

    fs.writeFileSync(filePath, fileContent, "utf-8");
    logger.info(`Saved ${proxies.length} proxies to proxies.txt`);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    logger.info("Starting proxy fetching and validation process");
    
    // Fetch all proxies from sources
    const proxies = await ProxyService.fetchAllProxies();
    logger.info(`Fetched ${proxies.size} unique proxies`);

    // Validate proxies
    const validatedProxies = await ProxyService.validateProxies(proxies);
    logger.info(`Validated ${validatedProxies.length} working proxies`);

    // Save to file
    ProxyService.saveProxies(validatedProxies);
    logger.info("Process completed successfully");
  } catch (error) {
    logger.error({ err: error }, "Error in main function");
    process.exit(1);
  }
}

// Execute main function
main().catch((error) => {
  logger.error({ err: error }, "Unhandled error in main function");
  process.exit(1);
});
