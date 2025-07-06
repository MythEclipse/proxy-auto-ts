import axios, { AxiosResponse } from "axios";
import fs from "fs";
import { HttpsProxyAgent } from "https-proxy-agent";

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
  private async validateProxyForUrl(proxy: string, url: string): Promise<boolean> {
    try {
      const agent = new HttpsProxyAgent(this.formatProxyUrl(proxy));
      await axios.head(url, {
        httpsAgent: agent,
        timeout: this.config.validationTimeout,
        headers: {
          'User-Agent': this.getRandomUserAgent()
        }
      });
      return true;
    } catch {
      return false;
    }
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
  async findBestProxy(testUrl: string = "https://httpbin.org/ip", maxProxiesToTest: number = 15): Promise<ProxyFetchResult> {
    await this.ensureInitialized();
    const testPromises = this.proxies.slice(0, maxProxiesToTest).map(async (proxy) => {
      try {
        const agent = new HttpsProxyAgent(this.formatProxyUrl(proxy));
        const startTime = Date.now();
        
        const response: AxiosResponse = await axios.get(testUrl, {
          httpsAgent: agent,
          timeout: this.config.validationTimeout,
          headers: {
            'User-Agent': this.getRandomUserAgent()
          }
        });
        
        const latency = Date.now() - startTime;
        return {
          data: response.data,
          proxy,
          latency,
        };
      } catch {
        return null;
      }
    });

    const testResults = await Promise.all(testPromises);
    const validResults = testResults.filter(result => result !== null) as ProxyFetchResult[];
    
    if (validResults.length === 0) {
      throw new Error("No working proxies found during testing");
    }

    // Sort by latency and return the fastest
    validResults.sort((a, b) => a.latency - b.latency);
    const bestProxy = validResults[0];
    
    // Reorder proxies to put the best one first
    this.proxies = this.proxies.filter(p => p !== bestProxy.proxy);
    this.proxies.unshift(bestProxy.proxy);
    
    return bestProxy;
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
