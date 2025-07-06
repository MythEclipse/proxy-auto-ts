import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import * as fs from "fs";
import * as path from "path";
import pino from "pino";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as os from "os";
import { Worker } from "worker_threads";

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

  // Multi-threaded worker-based validation
  static async validateProxiesWithWorkers(proxies: Set<string>): Promise<ValidatedProxy[]> {
    const totalProxies = proxies.size;
    const numWorkers = Math.min(8, Math.max(1, os.cpus().length)); // Limit to 8 workers for efficiency
    
    logger.info(`🚀 Starting MULTI-THREADED validation of ${totalProxies} proxies using ${numWorkers} worker threads`);
    logger.info(`💻 System: ${os.cpus().length} CPU cores detected`);
    logger.info(`⚡ Each worker handles ~${Math.ceil(totalProxies / numWorkers)} proxies`);
    
    const proxyArray = Array.from(proxies);
    const batchSize = Math.ceil(proxyArray.length / numWorkers);
    const validatedProxies: ValidatedProxy[] = [];
    
    let processedCount = 0;
    const startTime = Date.now();
    
    // Progress reporting
    const progressInterval = setInterval(() => {
      const progress = ((processedCount / totalProxies) * 100).toFixed(1);
      const speed = Math.round(processedCount / ((Date.now() - startTime) / 1000));
      const validCount = validatedProxies.length;
      
      const remainingProxies = totalProxies - processedCount;
      const estimatedSeconds = speed > 0 ? Math.round(remainingProxies / speed) : 0;
      const estimatedMinutes = Math.floor(estimatedSeconds / 60);
      const remainingSeconds = estimatedSeconds % 60;
      
      const etaText = estimatedMinutes > 0 
        ? `${estimatedMinutes}m ${remainingSeconds}s` 
        : `${remainingSeconds}s`;
      
      logger.info(`📊 Worker Progress: ${progress}% (${processedCount}/${totalProxies}) | Found: ${validCount} | Speed: ${speed}/s | ETA: ${etaText}`);
    }, 1500);

    const workerPromises = [];
    
    for (let i = 0; i < numWorkers; i++) {
      const batch = proxyArray.slice(i * batchSize, (i + 1) * batchSize);
      if (batch.length === 0) continue;
      
      const workerPromise = new Promise<ValidatedProxy[]>((resolve) => {
        const workerScript = path.resolve(__dirname, "proxyWorker.js");
        const worker = new Worker(workerScript, {
          workerData: {
            proxies: batch,
            url: CONFIG.TEST_URL,
            timeout: CONFIG.VALIDATION_TIMEOUT,
            userAgents: [CONFIG.USER_AGENT]
          }
        });

        const workerResults: ValidatedProxy[] = [];

        worker.on("message", (msg) => {
          if (msg.type === 'progress') {
            // Add valid proxies from this batch
            const validProxies = msg.results.filter((r: any) => r.status === 200 && r.latency <= CONFIG.MAX_LATENCY);
            validProxies.forEach((r: any) => {
              workerResults.push({ proxy: r.proxy, latency: r.latency });
              validatedProxies.push({ proxy: r.proxy, latency: r.latency });
              logger.info(`✅ WORKING: ${r.proxy} (${r.latency}ms) [${r.status}] - Worker ${i + 1}`);
            });
            
            processedCount += msg.results.length;
          } else if (msg.type === 'complete') {
            // Final batch from worker
            const validProxies = msg.results.filter((r: any) => r.status === 200 && r.latency <= CONFIG.MAX_LATENCY);
            validProxies.forEach((r: any) => {
              if (!workerResults.find(existing => existing.proxy === r.proxy)) {
                workerResults.push({ proxy: r.proxy, latency: r.latency });
                validatedProxies.push({ proxy: r.proxy, latency: r.latency });
                logger.info(`✅ WORKING: ${r.proxy} (${r.latency}ms) [${r.status}] - Worker ${i + 1}`);
              }
            });
            
            processedCount += msg.results.length;
            resolve(workerResults);
          }
        });

        worker.on("error", (err) => {
          logger.error(`Worker ${i + 1} error:`, err);
          resolve(workerResults);
        });

        worker.on("exit", (code) => {
          if (code !== 0) {
            logger.warn(`Worker ${i + 1} exited with code ${code}`);
          }
          resolve(workerResults);
        });
      });

      workerPromises.push(workerPromise);
    }

    // Wait for all workers to complete
    await Promise.all(workerPromises);
    clearInterval(progressInterval);
    
    // Remove duplicates and sort by latency
    const uniqueProxies = new Map<string, ValidatedProxy>();
    validatedProxies.forEach(proxy => {
      const existing = uniqueProxies.get(proxy.proxy);
      if (!existing || proxy.latency < existing.latency) {
        uniqueProxies.set(proxy.proxy, proxy);
      }
    });

    const finalProxies = Array.from(uniqueProxies.values());
    finalProxies.sort((a, b) => a.latency - b.latency);
    
    logger.info(`🎯 Multi-threaded validation completed: ${finalProxies.length} unique working proxies`);
    return finalProxies;
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
    const validatedProxies = await ProxyService.validateProxiesWithWorkers(proxies);
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
      const avgLatency = Math.round(validatedProxies.reduce((sum, p) => sum + p.latency, 0) / validatedProxies.length);
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
