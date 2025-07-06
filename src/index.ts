import axios, { AxiosResponse } from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";

// Types
interface ProxyFetchResult {
  data: any;
  proxy: string;
  latency: number;
}

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROXY_LIST_PATH = path.resolve(__dirname, "../proxies.txt");

const CONFIG = {
  TIMEOUT: 12000,
  DEFAULT_TEST_URL: "https://otakudesu.cloud",
} as const;

// Proxy Manager Class
class ProxyManager {
  private proxies: string[] = [];

  constructor() {
    this.loadProxies();
  }

  private loadProxies(): void {
    try {
      const data = fs.readFileSync(PROXY_LIST_PATH, "utf-8");
      this.proxies = data
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.startsWith("#"))
        .map((line) => line.split(" ")[0].trim())
        .filter(Boolean);
    } catch (error) {
      throw new Error(`Failed to load proxy list: ${(error as Error).message}`);
    }
  }

  getProxies(): string[] {
    return [...this.proxies];
  }

  getProxyCount(): number {
    return this.proxies.length;
  }

  private formatProxyUrl(proxy: string): string {
    return proxy.startsWith('http') ? proxy : `http://${proxy}`;
  }

  async fetchWithProxy(url: string): Promise<ProxyFetchResult> {
    if (this.proxies.length === 0) {
      throw new Error("No proxies available.");
    }

    const errors: string[] = [];
    
    for (const proxy of this.proxies) {
      try {
        const agent = new HttpsProxyAgent(this.formatProxyUrl(proxy));
        const startTime = Date.now();
        
        const response: AxiosResponse = await axios.get(url, {
          httpsAgent: agent,
          timeout: CONFIG.TIMEOUT,
        });
        
        const latency = Date.now() - startTime;
        console.log(`✅ Successfully used proxy: ${proxy} (${latency}ms)`);
        
        return {
          data: response.data,
          proxy,
          latency,
        };
      } catch (error) {
        const errorMessage = `❌ Failed with proxy ${proxy}: ${(error as Error).message}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    throw new Error(`All proxy attempts failed. Errors:\n${errors.join('\n')}`);
  }
}

// Main execution function
async function main(): Promise<void> {
  const proxyManager = new ProxyManager();
  const targetUrl = CONFIG.DEFAULT_TEST_URL;
  
  try {
    console.log(`🚀 Starting proxy test with ${proxyManager.getProxyCount()} proxies`);
    console.log(`🎯 Target URL: ${targetUrl}`);
    
    const result = await proxyManager.fetchWithProxy(targetUrl);
    
    console.log(`\n✅ Success!`);
    console.log(`📊 Proxy: ${result.proxy}`);
    console.log(`⏱️  Latency: ${result.latency}ms`);
    console.log(`📄 Response length: ${JSON.stringify(result.data).length} characters`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Unhandled error: ${error.message}`);
    process.exit(1);
  });
}

// Export for use in other modules
export { ProxyManager, ProxyFetchResult };
