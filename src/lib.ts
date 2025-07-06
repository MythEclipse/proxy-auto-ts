import axios, { AxiosResponse } from "axios";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";
import os from "os";
import path from "path";
import { Worker } from "worker_threads";
// Helper for running proxy validation in worker threads
function runProxyValidationInWorkers(proxies: string[], url: string, timeout: number, userAgents: string[], workerScript: string): Promise<{proxy: string, latency: number, status: number|null}[]> {
  return new Promise((resolve) => {
    const numCores = Math.min(8, Math.max(1, os.cpus().length)); // Limit to 8 workers for efficiency
    const batchSize = Math.ceil(proxies.length / numCores);
    let completed = 0;
    let results: {proxy: string, latency: number, status: number|null}[] = [];
    const startTime = Date.now();
    let totalProcessed = 0;

    function logProgress() {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = totalProcessed / (elapsed || 1);
      const eta = speed > 0 ? (proxies.length - totalProcessed) / speed : 0;
      const validCount = results.filter(r => r.status === 200).length;
      
      process.stdout.write(`\r📊 Worker Progress: ${((totalProcessed / proxies.length) * 100).toFixed(1)}% (${totalProcessed}/${proxies.length}) | Found: ${validCount} | Speed: ${speed.toFixed(1)}/s | ETA: ${eta.toFixed(1)}s   `);
    }

    for (let i = 0; i < numCores; i++) {
      const batch = proxies.slice(i * batchSize, (i + 1) * batchSize);
      if (batch.length === 0) {
        completed++;
        continue;
      }

      const worker = new Worker(workerScript, {
        workerData: {
          proxies: batch,
          url,
          timeout,
          userAgents
        }
      });

      worker.on("message", (msg) => {
        if (msg.type === 'progress') {
          results = results.concat(msg.results);
          totalProcessed += msg.results.length;
          logProgress();
        } else if (msg.type === 'complete') {
          // Final results from this worker
          const newResults = msg.results.filter((r: any) => !results.some(existing => existing.proxy === r.proxy));
          results = results.concat(newResults);
          totalProcessed += newResults.length;
          logProgress();
          
          completed++;
          if (completed >= numCores) {
            process.stdout.write("\n");
            resolve(results);
          }
        }
      });

      worker.on("error", () => {
        completed++;
        if (completed >= numCores) {
          process.stdout.write("\n");
          resolve(results);
        }
      });

      worker.on("exit", () => {
        completed++;
        if (completed >= numCores) {
          process.stdout.write("\n");
          resolve(results);
        }
      });
    }

    // Handle case where no workers are created
    if (numCores === 0 || completed === numCores) {
      resolve(results);
    }
  });
}

// Types
export interface ProxyFetchResult {
  data: any;
  proxy: string;
  latency: number;
}

export interface ProxyManagerConfig {
  timeout?: number;
  validationTimeout?: number;
  fallbackUrls?: string[];
  userAgents?: string[];
  proxyListPath?: string;
}

// Default configuration
const DEFAULT_CONFIG = {
  TIMEOUT: 15000,
  VALIDATION_TIMEOUT: 8000,
  FALLBACK_URLS: [
    "https://httpbin.org/ip",
    "https://api.ipify.org?format=json",
    "https://jsonip.com",
    "https://ifconfig.me/ip"
  ],
  USER_AGENTS: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  ]
};

/**
 * ProxyManager - A comprehensive proxy management library
 * 
 * @example
 * ```typescript
 * import { ProxyManager } from 'proxy-auto-ts';
 * 
 * const proxyManager = new ProxyManager();
 * await proxyManager.initialize(); // Initialize proxy list
 * const result = await proxyManager.fetchWithProxy('https://httpbin.org/ip');
 * console.log(result.data);
 * ```
 * 
 * @example
 * ```typescript
 * // Auto-initialization on first use
 * const proxyManager = new ProxyManager();
 * const result = await proxyManager.fetchWithProxy('https://httpbin.org/ip');
 * console.log(result.data);
 * ```
 */
export class ProxyManager {
  private proxies: string[] = [];
  private readonly config: Required<ProxyManagerConfig>;
  private initialized: boolean = false;

  constructor(config: ProxyManagerConfig = {}) {
    this.config = {
      timeout: config.timeout ?? DEFAULT_CONFIG.TIMEOUT,
      validationTimeout: config.validationTimeout ?? DEFAULT_CONFIG.VALIDATION_TIMEOUT,
      fallbackUrls: config.fallbackUrls ?? [...DEFAULT_CONFIG.FALLBACK_URLS],
      userAgents: config.userAgents ?? [...DEFAULT_CONFIG.USER_AGENTS],
      proxyListPath: config.proxyListPath ?? "https://raw.githubusercontent.com/MythEclipse/proxy-auto-ts/main/proxies.txt"
    };
  }

  /**
   * Initialize the proxy manager by loading proxies
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.loadProxies();
      this.initialized = true;
    }
  }

  /**
   * Ensure proxy manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Load proxies from file or URL
   */
  private async loadProxies(): Promise<void> {
    try {
      let data: string;
      
      if (this.config.proxyListPath.startsWith('http')) {
        // Load from URL
        const response = await axios.get(this.config.proxyListPath, {
          timeout: this.config.timeout,
          headers: {
            'User-Agent': this.getRandomUserAgent()
          }
        });
        data = response.data;
      } else {
        // Load from local file
        data = fs.readFileSync(this.config.proxyListPath, "utf-8");
      }
      
      this.proxies = data
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.startsWith("#"))
        .map((line) => line.split(" ")[0].trim())
        .filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to load proxy list from ${this.config.proxyListPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Get copy of loaded proxies
   */
  async getProxies(): Promise<string[]> {
    await this.ensureInitialized();
    return [...this.proxies];
  }

  /**
   * Get number of loaded proxies
   */
  async getProxyCount(): Promise<number> {
    await this.ensureInitialized();
    return this.proxies.length;
  }

  /**
   * Get random user agent
   */
  private getRandomUserAgent(): string {
    return this.config.userAgents[Math.floor(Math.random() * this.config.userAgents.length)];
  }

  /**
   * Format proxy URL
   */
  private formatProxyUrl(proxy: string): string {
    return proxy.startsWith('http') ? proxy : `http://${proxy}`;
  }

  /**
   * Validate proxy for specific URL
   */
  // Validate a single proxy using the worker (for testProxy)
  private async validateProxyForUrl(proxy: string, url: string): Promise<boolean> {
    const workerScript = path.resolve(__dirname, "proxyWorker.js");
    return new Promise((resolve) => {
      const worker = new Worker(workerScript, {
        workerData: {
          proxies: [proxy],
          url,
          timeout: this.config.validationTimeout,
          userAgents: this.config.userAgents
        }
      });
      worker.on("message", (msg) => {
        if (Array.isArray(msg) && msg.length > 0) {
          resolve(msg[0].status === 200);
        } else {
          resolve(false);
        }
      });
      worker.on("error", () => resolve(false));
      worker.on("exit", () => {});
    });
  }

  /**
   * Fetch URL through proxy with automatic fallback
   * 
   * @param url - Target URL to fetch
   * @param maxRetries - Maximum number of proxy retries
   * @returns Promise<ProxyFetchResult>
   */
  async fetchWithProxy(url: string, maxRetries: number = 10): Promise<ProxyFetchResult> {
    await this.ensureInitialized();
    
    if (this.proxies.length === 0) {
      throw new Error("No proxies available.");
    }

    const errors: string[] = [];
    let attempts = 0;
    
    // Try with multiple URLs if the original fails
    const urlsToTry = [url, ...this.config.fallbackUrls];
    
    for (const proxy of this.proxies) {
      if (attempts >= maxRetries && maxRetries > 0) {
        break;
      }
      
      // Try different URLs with this proxy
      for (const testUrl of urlsToTry) {
        try {
          const agent = new HttpsProxyAgent(this.formatProxyUrl(proxy));
          const startTime = Date.now();
          
          const response: AxiosResponse = await axios.get(testUrl, {
            httpsAgent: agent,
            timeout: this.config.timeout,
            headers: {
              'User-Agent': this.getRandomUserAgent(),
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1'
            }
          });
          
          const latency = Date.now() - startTime;
          
          return {
            data: response.data,
            proxy,
            latency,
          };
        } catch (error) {
          const errorMessage = `Failed with proxy ${proxy} on ${testUrl}: ${(error as Error).message}`;
          errors.push(errorMessage);
          
          // If first URL fails, try others with same proxy
          if (testUrl === url) {
            continue;
          }
        }
      }
      
      attempts++;
      
      // Don't add delay between proxies for better performance
      // if (attempts < this.proxies.length) {
      //   await new Promise(resolve => setTimeout(resolve, 1000));
      // }
    }

    throw new Error(`All proxy attempts failed after ${attempts} tries. Last errors:\n${errors.slice(-3).join('\n')}`);
  }

  /**
   * Find best proxy based on latency
   * 
   * @param testUrl - URL to test proxies against
   * @param maxProxiesToTest - Maximum number of proxies to test
   * @returns Promise<ProxyFetchResult>
   */
  async findBestProxy(testUrl: string = "https://httpbin.org/ip", maxProxiesToTest: number = 50): Promise<ProxyFetchResult> {
    await this.ensureInitialized();
    const workerScript = path.resolve(__dirname, "proxyWorker.js");
    const proxiesToTest = this.proxies.slice(0, maxProxiesToTest);
    
    console.log(`🔍 Finding best proxy among ${proxiesToTest.length} candidates...`);
    
    const results = await runProxyValidationInWorkers(
      proxiesToTest,
      testUrl,
      3000, // Use shorter timeout for finding best proxy
      this.config.userAgents,
      workerScript
    );
    
    // Only keep successful (status 200) proxies
    const validResults = results.filter(r => r.status === 200);
    if (validResults.length === 0) {
      throw new Error("No working proxies found during testing");
    }
    
    // Sort by latency and return the fastest
    validResults.sort((a, b) => a.latency - b.latency);
    const best = validResults[0];
    
    console.log(`⚡ Best proxy found: ${best.proxy} (${best.latency}ms latency)`);
    
    // Fetch data with the best proxy
    const fetchResult = await this.fetchWithSpecificProxy(testUrl, best.proxy);
    
    // Reorder proxies to put the best one first
    this.proxies = this.proxies.filter(p => p !== best.proxy);
    this.proxies.unshift(best.proxy);
    
    return fetchResult;
  }

  /**
   * Fetch URL with specific proxy
   * 
   * @param url - Target URL to fetch
   * @param targetProxy - Specific proxy to use
   * @returns Promise<ProxyFetchResult>
   */
  async fetchWithSpecificProxy(url: string, targetProxy: string): Promise<ProxyFetchResult> {
    const urlsToTry = [url, ...this.config.fallbackUrls];
    
    for (const testUrl of urlsToTry) {
      try {
        const agent = new HttpsProxyAgent(this.formatProxyUrl(targetProxy));
        const startTime = Date.now();
        
        const response: AxiosResponse = await axios.get(testUrl, {
          httpsAgent: agent,
          timeout: this.config.timeout,
          headers: {
            'User-Agent': this.getRandomUserAgent(),
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          }
        });
        
        const latency = Date.now() - startTime;
        
        return {
          data: response.data,
          proxy: targetProxy,
          latency,
        };
      } catch {
        if (testUrl === url) {
          continue; // Try fallback URLs
        }
      }
    }
    
    throw new Error(`Failed to fetch with proxy ${targetProxy} on all URLs`);
  }

  /**
   * Test proxy connectivity
   * 
   * @param proxy - Proxy to test
   * @param testUrl - URL to test against
   * @returns Promise<boolean>
   */
  async testProxy(proxy: string, testUrl: string = "https://httpbin.org/ip"): Promise<boolean> {
    return this.validateProxyForUrl(proxy, testUrl);
  }

  /**
   * Validate all loaded proxies using worker threads for maximum performance
   * 
   * @param testUrl - URL to test proxies against
   * @returns Promise<{proxy: string, latency: number, status: number|null}[]>
   */
  async validateAllProxies(testUrl: string = "https://httpbin.org/ip"): Promise<{proxy: string, latency: number, status: number|null}[]> {
    await this.ensureInitialized();
    const workerScript = path.resolve(__dirname, "proxyWorker.js");
    console.log(`🚀 Starting validation of ${this.proxies.length} proxies using ${os.cpus().length} CPU cores...`);
    
    const results = await runProxyValidationInWorkers(
      this.proxies,
      testUrl,
      this.config.validationTimeout,
      this.config.userAgents,
      workerScript
    );
    
    const validProxies = results.filter(r => r.status === 200);
    console.log(`✅ Validation complete! Found ${validProxies.length} working proxies out of ${this.proxies.length} tested.`);
    
    return results;
  }

  /**
   * Get proxy statistics
   * 
   * @returns Object with proxy statistics
   */
  async getStats(): Promise<{ totalProxies: number; proxyListPath: string; config: Required<ProxyManagerConfig> }> {
    await this.ensureInitialized();
    return {
      totalProxies: this.proxies.length,
      proxyListPath: this.config.proxyListPath,
      config: this.config
    };
  }
}

// Export the main class
// Note: ProxyManager is already exported via the class declaration
