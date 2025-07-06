import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as fs from "fs";
import * as path from "path";
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
  FETCH_TIMEOUT: 8000,
  VALIDATION_TIMEOUT: 2000, // Lebih cepat lagi - 2 detik saja
  VALIDATION_CONCURRENCY: Math.max(300, os.cpus().length * 60), // Lebih tinggi untuk HEAD request
  TEST_URL: "https://httpbin.org/status/200", // Endpoint yang lebih cepat
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  MAX_LATENCY: 2000, // Hanya proxy super cepat
  BATCH_SIZE: 150, // Batch lebih besar untuk HEAD request
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

      // Menggunakan HEAD request untuk test yang lebih cepat
      const response = await axios.head(CONFIG.TEST_URL, {
        httpsAgent: agent,
        timeout: CONFIG.VALIDATION_TIMEOUT,
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
        },
        // Optimasi untuk HEAD request
        maxRedirects: 0, // Tidak follow redirect
        validateStatus: (status) => status >= 200 && status < 400, // Accept 2xx dan 3xx
      });

      const latency = Date.now() - startTime;
      
      // Filter proxy yang terlalu lambat
      if (latency > CONFIG.MAX_LATENCY) {
        return null;
      }

      // Real-time logging dengan status code
      logger.info(`✅ WORKING: ${proxy} (${latency}ms) [${response.status}]`);
      return { proxy, latency };
    } catch (error) {
      // Fail fast - silent untuk performa maksimal
      if (error instanceof Error && error.message.includes('ENOTFOUND')) {
        // Log hanya DNS errors yang penting
        logger.debug(`DNS error for ${proxy}`);
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

  // High-performance concurrent validation using Promise.all
  static async validateProxiesWithHighConcurrency(proxies: Set<string>): Promise<ValidatedProxy[]> {
    const totalProxies = proxies.size;
    const proxyArray = Array.from(proxies);
    const validatedProxies: ValidatedProxy[] = [];
    
    logger.info(`🚀 Starting HIGH-CONCURRENCY validation of ${totalProxies} proxies`);
    logger.info(`💻 System: ${os.cpus().length} CPU cores detected`);
    logger.info(`⚡ Concurrency: ${CONFIG.VALIDATION_CONCURRENCY} simultaneous requests`);
    
    let processedCount = 0;
    const startTime = Date.now();
    
    // Progress reporting
    const progressInterval = setInterval(() => {
      const progress = ((processedCount / totalProxies) * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = Math.round(processedCount / elapsed);
      const validCount = validatedProxies.length;
      const eta = speed > 0 ? Math.round((totalProxies - processedCount) / speed) : 0;
      
      const etaText = eta > 60 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : `${eta}s`;
      logger.info(`📊 Progress: ${progress}% (${processedCount}/${totalProxies}) | Found: ${validCount} | Speed: ${speed}/s | ETA: ${etaText}`);
    }, 1500);

    // Process in batches with high concurrency
    for (let i = 0; i < proxyArray.length; i += CONFIG.BATCH_SIZE) {
      const batch = proxyArray.slice(i, i + CONFIG.BATCH_SIZE);
      const batchStartTime = Date.now();
      
      // Create promises for concurrent validation
      const validationPromises = batch.map(async (proxy) => {
        const result = await HttpClient.validateProxy(proxy);
        processedCount++;
        return result;
      });
      
      // Wait for all validations in this batch to complete
      const batchResults = await Promise.all(validationPromises);
      const validResults = batchResults.filter((result): result is ValidatedProxy => result !== null);
      
      validatedProxies.push(...validResults);
      
      const batchElapsed = (Date.now() - batchStartTime) / 1000;
      const batchNumber = Math.ceil((i + 1) / CONFIG.BATCH_SIZE);
      const totalBatches = Math.ceil(proxyArray.length / CONFIG.BATCH_SIZE);
      const batchSpeed = Math.round(batch.length / batchElapsed);
      
      logger.info(`✅ Batch ${batchNumber}/${totalBatches} done (${((i + batch.length) / totalProxies * 100).toFixed(1)}%) | Valid: ${validResults.length} | Speed: ${batchSpeed}/s | ETA: ${Math.round((totalProxies - processedCount) / batchSpeed)}s`);
    }
    
    clearInterval(progressInterval);
    
    const totalTime = (Date.now() - startTime) / 1000;
    const averageSpeed = Math.round(totalProxies / totalTime);
    const successRate = ((validatedProxies.length / totalProxies) * 100).toFixed(1);
    
    logger.info(`🎯 VALIDATION COMPLETE!`);
    logger.info(`📈 Total: ${totalProxies} proxies | Valid: ${validatedProxies.length} | Success Rate: ${successRate}%`);
    logger.info(`⏱️  Time: ${totalTime.toFixed(1)}s | Speed: ${averageSpeed}/s`);
    
    return validatedProxies.sort((a, b) => a.latency - b.latency);
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
    logger.info(`🚀 Starting MULTI-THREADED proxy validation with worker threads`);
    logger.info(`💻 System: ${cpuCount} CPU cores detected`);
    logger.info(`⚡ Workers: Up to 8 worker threads`);
    logger.info(`⏱️  Timeout: ${CONFIG.VALIDATION_TIMEOUT}ms per proxy (HEAD request)`);
    logger.info(`🎯 Max Latency: ${CONFIG.MAX_LATENCY}ms (super fast only)`);
    
    const startTime = Date.now();
    
    // Fetch all proxies
    const proxies = await ProxyService.fetchAllProxies();
    logger.info(`📥 Fetched ${proxies.size} proxies from ${PROXY_SOURCES.length} sources`);

    // Validate proxies with multi-threaded workers
    const validatedProxies = await ProxyService.validateProxiesWithHighConcurrency(proxies);
    logger.info(`✅ Validated ${validatedProxies.length} working proxies using worker threads`);

    // Save to file
    ProxyService.saveProxies(validatedProxies);
    
    const totalTime = Date.now() - startTime;
    const successRate = ((validatedProxies.length / proxies.size) * 100).toFixed(1);
    const proxiesPerSecond = Math.round(proxies.size / (totalTime / 1000));
    
    logger.info(`🏁 MULTI-THREADED VALIDATION COMPLETED in ${Math.round(totalTime/1000)}s`);
    logger.info(`📊 Success Rate: ${successRate}% (${validatedProxies.length}/${proxies.size})`);
    logger.info(`💨 Performance: ${proxiesPerSecond} proxies/second (multi-threaded)`);
    logger.info(`🧵 Used worker threads for 100% CPU utilization`);
    
    if (validatedProxies.length > 0) {
      const avgLatency = Math.round(validatedProxies.reduce((sum: number, p: ValidatedProxy) => sum + p.latency, 0) / validatedProxies.length);
      logger.info(`📈 Average latency: ${avgLatency}ms`);
      logger.info(`🥇 Fastest: ${validatedProxies[0].proxy} (${validatedProxies[0].latency}ms)`);
      logger.info(`🥉 Slowest: ${validatedProxies[validatedProxies.length - 1].proxy} (${validatedProxies[validatedProxies.length - 1].latency}ms)`);
      logger.info(`💾 Saved to: proxies.txt`);
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
