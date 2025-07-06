import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import pino from "pino";

// Logger setup
const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

// Configuration
const CONFIG = {
  SOURCE_URL: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  VALIDATION_TIMEOUT: 5000, // Timeout lebih cepat
  MAX_PROXIES_TO_TEST: 30, // Test lebih sedikit untuk demo cepat
  TEST_URL: "https://httpbin.org/status/200", // URL yang lebih cepat untuk test
  USER_AGENT: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  MAX_LATENCY: 6000, // Lebih ketat
};

// Types
interface TestResult {
  proxy: string;
  latency: number;
  status: number;
  index: number; // Posisi dalam list asli
}

// Utility functions
function isValidProxy(line: string): boolean {
  const proxy = line.trim();
  if (!proxy || !proxy.includes(":")) return false;
  
  const [host, port] = proxy.split(":");
  if (!host || !port) return false;
  
  const portNum = parseInt(port);
  return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
}

// Fetch proxy list from source
async function fetchProxyList(): Promise<string[]> {
  try {
    logger.info(`🔄 Fetching proxy list from: ${CONFIG.SOURCE_URL}`);
    
    const response = await axios.get(CONFIG.SOURCE_URL, {
      headers: {
        "User-Agent": CONFIG.USER_AGENT,
      },
      timeout: 5000,
    });
    
    if (!response.data) {
      throw new Error("No data received from source");
    }
    
    const lines = response.data.split('\n');
    const proxies = lines
      .map((line: string) => line.trim())
      .filter((line: string) => isValidProxy(line))
      .slice(0, CONFIG.MAX_PROXIES_TO_TEST); // Ambil hanya N proxy pertama
    
    logger.info(`✅ Found ${proxies.length} valid proxies from source`);
    return proxies;
    
  } catch (error) {
    logger.error(`❌ Failed to fetch proxy list:`, error);
    throw error;
  }
}

// Test a single proxy
async function testProxy(proxy: string, index: number): Promise<TestResult | null> {
  try {
    const agent = new HttpsProxyAgent(`http://${proxy}`);
    const startTime = Date.now();
    
    logger.info(`🔍 Testing proxy #${index + 1}: ${proxy}`);
    
    // Try HEAD first, fallback to GET
    let response;
    let method = "HEAD";
    try {
      response = await axios.head(CONFIG.TEST_URL, {
        httpsAgent: agent,
        timeout: CONFIG.VALIDATION_TIMEOUT,
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
        },
        maxRedirects: 2,
        validateStatus: (status) => status >= 200 && status < 400,
      });
    } catch (headError) {
      // Fallback to GET if HEAD fails
      method = "GET";
      logger.debug(`⚠️  HEAD failed for #${index + 1}: ${proxy}, trying GET...`);
      response = await axios.get(CONFIG.TEST_URL, {
        httpsAgent: agent,
        timeout: CONFIG.VALIDATION_TIMEOUT,
        headers: {
          "User-Agent": CONFIG.USER_AGENT,
        },
        maxRedirects: 2,
        validateStatus: (status) => status >= 200 && status < 400,
      });
    }
    
    const latency = Date.now() - startTime;
    
    if (latency > CONFIG.MAX_LATENCY) {
      logger.warn(`🐌 SLOW #${index + 1}: ${proxy} - ${latency}ms (over ${CONFIG.MAX_LATENCY}ms limit) [${response.status}] - REJECTED`);
      return null;
    }
    
    const result = { proxy, latency, status: response.status, index };
    logger.info(`✅ SUCCESS #${index + 1}: ${proxy} - ${latency}ms [${response.status}] (${method}) - ACCEPTED`);
    
    return result;
    
  } catch (error) {
    const errorMsg = (error as Error).message;
    
    // More detailed error logging
    if (errorMsg.includes('timeout')) {
      logger.error(`⏰ TIMEOUT #${index + 1}: ${proxy} - Connection timeout after ${CONFIG.VALIDATION_TIMEOUT}ms - FAILED`);
    } else if (errorMsg.includes('ECONNREFUSED')) {
      logger.error(`🚫 REFUSED #${index + 1}: ${proxy} - Connection refused - FAILED`);
    } else if (errorMsg.includes('ENOTFOUND')) {
      logger.error(`🔍 DNS_ERROR #${index + 1}: ${proxy} - Host not found - FAILED`);
    } else if (errorMsg.includes('ECONNRESET')) {
      logger.error(`🔌 RESET #${index + 1}: ${proxy} - Connection reset - FAILED`);
    } else if (errorMsg.includes('socket hang up')) {
      logger.error(`🕳️  HANGUP #${index + 1}: ${proxy} - Socket hang up - FAILED`);
    } else {
      logger.error(`❌ ERROR #${index + 1}: ${proxy} - ${errorMsg} - FAILED`);
    }
    
    return null;
  }
}

// Test proxies sequentially from top to bottom
async function testProxiesSequentially(proxies: string[]): Promise<TestResult[]> {
  const workingProxies: TestResult[] = [];
  const failedProxies: number[] = [];
  const totalProxies = proxies.length;
  
  logger.info(`🚀 Starting sequential test of ${totalProxies} proxies (top to bottom)`);
  logger.info(`⏱️  Timeout: ${CONFIG.VALIDATION_TIMEOUT}ms per proxy`);
  logger.info(`🎯 Max Latency: ${CONFIG.MAX_LATENCY}ms`);
  logger.info(`🔗 Test URL: ${CONFIG.TEST_URL}`);
  logger.info(`\n📋 Testing each proxy individually...\n`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < proxies.length; i++) {
    const proxy = proxies[i];
    const progress = ((i + 1) / totalProxies * 100).toFixed(1);
    
    // Progress header for each test
    logger.info(`\n📍 [${i + 1}/${totalProxies}] Progress: ${progress}%`);
    
    const result = await testProxy(proxy, i);
    if (result) {
      workingProxies.push(result);
      logger.info(`🎉 WORKING PROXY FOUND! Total working: ${workingProxies.length}`);
    } else {
      failedProxies.push(i + 1);
      logger.info(`💔 Failed proxy. Total failed: ${failedProxies.length}`);
    }
    
    // Summary every 5 proxies
    if ((i + 1) % 5 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = (i + 1) / elapsed;
      const successRate = ((workingProxies.length / (i + 1)) * 100).toFixed(1);
      logger.info(`\n� CHECKPOINT - Tested: ${i + 1}/${totalProxies}`);
      logger.info(`✅ Working: ${workingProxies.length} | ❌ Failed: ${failedProxies.length} | Success Rate: ${successRate}%`);
      logger.info(`⚡ Speed: ${speed.toFixed(1)}/s | ⏱️  Elapsed: ${elapsed.toFixed(1)}s\n`);
    }
    
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  const averageSpeed = totalProxies / totalTime;
  const successRate = ((workingProxies.length / totalProxies) * 100).toFixed(1);
  
  logger.info(`\n🎯 SEQUENTIAL TEST COMPLETE!`);
  logger.info(`📊 Total Tested: ${totalProxies} proxies`);
  logger.info(`✅ Working: ${workingProxies.length} proxies`);
  logger.info(`❌ Failed: ${failedProxies.length} proxies`);
  logger.info(`📈 Success Rate: ${successRate}%`);
  logger.info(`⏱️  Total Time: ${totalTime.toFixed(1)}s`);
  logger.info(`💨 Average Speed: ${averageSpeed.toFixed(1)} proxies/second`);
  
  return workingProxies;
}

// Display results
function displayResults(results: TestResult[]): void {
  if (results.length === 0) {
    logger.warn("❌ No working proxies found!");
    return;
  }
  
  // Sort by latency (fastest first)
  results.sort((a, b) => a.latency - b.latency);
  
  function getMedal(index: number): string {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return "📍";
  }
  
  logger.info(`\n🏆 TOP WORKING PROXIES (sorted by speed):`);
  results.forEach((result, i) => {
    const medal = getMedal(i);
    logger.info(`${medal} #${result.index + 1} (pos in original list): ${result.proxy} - ${result.latency}ms [${result.status}]`);
  });
  
  const avgLatency = Math.round(results.reduce((sum, r) => sum + r.latency, 0) / results.length);
  logger.info(`\n📊 STATISTICS:`);
  logger.info(`📈 Average latency: ${avgLatency}ms`);
  logger.info(`🥇 Fastest: ${results[0].proxy} (${results[0].latency}ms)`);
  logger.info(`🐌 Slowest: ${results[results.length - 1].proxy} (${results[results.length - 1].latency}ms)`);
  
  // Show position analysis
  const positions = results.map(r => r.index + 1);
  const avgPosition = Math.round(positions.reduce((sum, pos) => sum + pos, 0) / positions.length);
  logger.info(`📍 Average position in original list: #${avgPosition}`);
  logger.info(`🔝 Best proxy was at position: #${Math.min(...positions)}`);
  logger.info(`🔚 Last working proxy was at position: #${Math.max(...positions)}`);
}

// Main function
async function main(): Promise<void> {
  try {
    logger.info("🚀 PROXY SEQUENTIAL TESTER - Testing from Top to Bottom");
    logger.info(`📋 Source: ${CONFIG.SOURCE_URL}`);
    logger.info(`🔢 Max proxies to test: ${CONFIG.MAX_PROXIES_TO_TEST}`);
    
    // Step 1: Fetch proxy list
    const proxies = await fetchProxyList();
    
    if (proxies.length === 0) {
      logger.error("❌ No proxies found to test!");
      return;
    }
    
    // Step 2: Test proxies sequentially
    const workingProxies = await testProxiesSequentially(proxies);
    
    // Step 3: Display results
    displayResults(workingProxies);
    
    logger.info("\n🎉 Test completed successfully!");
    
  } catch (error) {
    logger.error("❌ Error in main function:", error);
    process.exit(1);
  }
}

// Execute
main().catch((error) => {
  logger.error("❌ Unhandled error:", error);
  process.exit(1);
});
