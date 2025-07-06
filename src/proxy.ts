import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import pino from "pino";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as os from "os";

// Types
export interface ValidatedProxy {
  proxy: string;
  latency: number;
}

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG = {
  FETCH_TIMEOUT: 10000,
  VALIDATION_TIMEOUT: 3000,
  VALIDATION_CONCURRENCY: Math.max(200, os.cpus().length * 50), // Dynamic based on CPU cores
  TEST_URL: "https://httpbin.org/ip",
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  MAX_LATENCY: 3000,
  BATCH_SIZE: 100, // Process in smaller batches for better progress tracking
} as const;

const PROXY_SOURCES = [
  "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt",
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://www.proxy-list.download/api/v1/get?type=http",
  "https://www.proxy-list.download/api/v1/get?type=https",
  "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",
  "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",
  "https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt",
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
export class ProxyUtils {
  static isValidPort(port: string): boolean {
    const portNum = Number(port);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  }

  static formatProxy(host: string, port: string): string {
    return `${host}:${port}`;
  }

  static isValidIP(ip: string): boolean {
    // Simplified IP validation - basic check for format
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    
    return parts.every(part => {
      const num = parseInt(part, 10);
      return !isNaN(num) && num >= 0 && num <= 255;
    });
  }

  static parseProxyLine(line: string): string | null {
    const cleanedLine = line.trim();
    if (!cleanedLine?.includes(":")) return null;

    const proxy = cleanedLine.split(" ")[0];
    if (!proxy) return null;

    const [host, port] = proxy.split(":");
    if (!host || !port || !this.isValidPort(port)) return null;
    
    // Pre-filter invalid IPs to improve accuracy
    if (!this.isValidIP(host)) return null;

    return this.formatProxy(host, port);
  }

  static generateFileContent(proxies: ValidatedProxy[]): string {
    const timestamp = new Date().toISOString();
    return [
      `# Proxy List - Updated: ${timestamp}`,
      `# Total proxies: ${proxies.length}`,
      `# Average latency: ${Math.round(proxies.reduce((sum, p) => sum + p.latency, 0) / proxies.length)}ms`,
      "",
      ...proxies.map((p) => `${p.proxy}  # ${p.latency}ms`),
    ].join("\n");
  }
}

// HTTP Client
export class HttpClient {
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
    try {
      const response = await this.makeRequest(url);
      return response.data;
    } catch (error) {
      logger.debug(`Failed to fetch ${url}: ${(error as Error).message}`);
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
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
        },
      });

      const latency = Date.now() - startTime;
      
      // Filter out proxies that are too slow
      if (latency > CONFIG.MAX_LATENCY) {
        return null;
      }

      // Real-time logging when proxy is found
      logger.info(`✅ WORKING: ${proxy} (${latency}ms)`);
      return { proxy, latency };
    } catch (error) {
      // Fail fast - log only critical errors, ignore timeouts/connection errors
      if (error instanceof Error && !error.message.includes('timeout') && !error.message.includes('ECONNREFUSED')) {
        logger.debug(`Proxy ${proxy} error: ${error.message}`);
      }
      return null;
    }
  }
}

// Proxy Service
export class ProxyService {
  private static parseProxyList(content: string): Set<string> {
    if (!content) return new Set();

    const proxies = new Set<string>();
    const lines = content.split("\n");
    
    for (const line of lines) {
      const proxy = ProxyUtils.parseProxyLine(line);
      if (proxy) {
        proxies.add(proxy);
      }
    }

    return proxies;
  }

  static async fetchAllProxies(): Promise<Set<string>> {
    logger.info("Fetching proxies from all sources");
    const allProxies = new Set<string>();
    
    // Fetch from all sources in parallel
    const fetchTasks = PROXY_SOURCES.map(async (url) => {
      const content = await HttpClient.fetchUrl(url);
      if (content) {
        return this.parseProxyList(content);
      }
      return new Set<string>();
    });

    const results = await Promise.all(fetchTasks);
    
    // Combine all results
    results.forEach(proxies => {
      proxies.forEach(proxy => allProxies.add(proxy));
    });
    
    logger.info(`Fetched ${allProxies.size} unique proxies from ${PROXY_SOURCES.length} sources`);
    return allProxies;
  }

  static async validateProxies(proxies: Set<string>): Promise<ValidatedProxy[]> {
    const totalProxies = proxies.size;
    logger.info(`🚀 Starting validation of ${totalProxies} proxies with ${CONFIG.VALIDATION_CONCURRENCY} concurrent threads`);
    
    const validatedProxies: ValidatedProxy[] = [];
    const proxyArray = Array.from(proxies);
    let processedCount = 0;
    let validCount = 0;
    
    // Progress reporting
    const progressInterval = setInterval(() => {
      const progress = ((processedCount / totalProxies) * 100).toFixed(1);
      logger.info(`📊 Progress: ${progress}% (${processedCount}/${totalProxies}) | Found: ${validCount} working proxies`);
    }, 2000);

    // Process in batches with high concurrency
    const batchSize = CONFIG.BATCH_SIZE;
    const batches = [];
    
    for (let i = 0; i < proxyArray.length; i += batchSize) {
      batches.push(proxyArray.slice(i, i + batchSize));
    }

    logger.info(`📦 Processing ${batches.length} batches of ${batchSize} proxies each`);
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const limit = pLimit(CONFIG.VALIDATION_CONCURRENCY);
      
      const validationTasks = batch.map((proxy) =>
        limit(async () => {
          const result = await HttpClient.validateProxy(proxy);
          processedCount++;
          
          if (result) {
            validatedProxies.push(result);
            validCount++;
          }
          
          return result;
        })
      );

      await Promise.all(validationTasks);
      
      // Batch completion log
      const batchProgress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
      logger.info(`✅ Batch ${batchIndex + 1}/${batches.length} done (${batchProgress}%) | Valid: ${validCount}`);
    }

    clearInterval(progressInterval);

    // Sort by latency (fastest first) and remove duplicates
    const uniqueProxies = new Map<string, ValidatedProxy>();
    validatedProxies.forEach(proxy => {
      const existing = uniqueProxies.get(proxy.proxy);
      if (!existing || proxy.latency < existing.latency) {
        uniqueProxies.set(proxy.proxy, proxy);
      }
    });

    const finalProxies = Array.from(uniqueProxies.values());
    finalProxies.sort((a, b) => a.latency - b.latency);
    
    logger.info(`🎯 Final result: ${finalProxies.length} unique working proxies`);
    return finalProxies;
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
    const cpuCount = os.cpus().length;
    logger.info(`🚀 Starting MULTI-THREADED proxy validation`);
    logger.info(`💻 System: ${cpuCount} CPU cores detected`);
    logger.info(`⚡ Concurrency: ${CONFIG.VALIDATION_CONCURRENCY} threads`);
    logger.info(`⏱️  Timeout: ${CONFIG.VALIDATION_TIMEOUT}ms per proxy`);
    
    const startTime = Date.now();
    
    // Fetch all proxies
    const proxies = await ProxyService.fetchAllProxies();
    logger.info(`📥 Fetched ${proxies.size} proxies from ${PROXY_SOURCES.length} sources`);

    // Validate proxies with multi-threading
    const validatedProxies = await ProxyService.validateProxies(proxies);
    logger.info(`✅ Validated ${validatedProxies.length} working proxies`);

    // Save to file
    ProxyService.saveProxies(validatedProxies);
    
    const totalTime = Date.now() - startTime;
    const successRate = ((validatedProxies.length / proxies.size) * 100).toFixed(1);
    const proxiesPerSecond = Math.round(proxies.size / (totalTime / 1000));
    
    logger.info(`🏁 COMPLETED in ${Math.round(totalTime/1000)}s`);
    logger.info(`📊 Success Rate: ${successRate}% (${validatedProxies.length}/${proxies.size})`);
    logger.info(`⚡ Performance: ${proxiesPerSecond} proxies/second`);
    
    if (validatedProxies.length > 0) {
      const avgLatency = Math.round(validatedProxies.reduce((sum, p) => sum + p.latency, 0) / validatedProxies.length);
      logger.info(`📈 Average latency: ${avgLatency}ms`);
      logger.info(`🥇 Fastest: ${validatedProxies[0].proxy} (${validatedProxies[0].latency}ms)`);
      logger.info(`🥉 Slowest: ${validatedProxies[validatedProxies.length - 1].proxy} (${validatedProxies[validatedProxies.length - 1].latency}ms)`);
    }
  } catch (error) {
    logger.error({ err: error }, "❌ Error in main function");
    process.exit(1);
  }
}

// Execute main function
main().catch((error) => {
  logger.error({ err: error }, "Unhandled error in main function");
  process.exit(1);
});
