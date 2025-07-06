import { ProxyManager } from "./lib.js";

// Comprehensive test utility
async function comprehensiveTest() {
  console.log("🧪 Comprehensive Proxy Test");
  
  const proxyManager = new ProxyManager({
    timeout: 8000,
    validationTimeout: 5000
  });
  await proxyManager.initialize();
  
  console.log(`📊 Loaded ${await proxyManager.getProxyCount()} proxies`);
  
  try {
    // Test 1: Basic IP check with limited retries
    console.log(`\n📋 Test 1: Basic IP check...`);
    const result = await proxyManager.fetchWithProxy("https://httpbin.org/ip", 3);
    console.log(`✅ Working proxy found: ${result.proxy}`);
    console.log(`📊 Your IP: ${JSON.stringify(result.data)}`);
    console.log(`⏱️  Latency: ${result.latency}ms`);
    
    // Test 2: Find best proxy with limited testing
    console.log(`\n📋 Test 2: Finding best proxy...`);
    const bestProxy = await proxyManager.findBestProxy("https://httpbin.org/ip", 5);
    console.log(`🏆 Best proxy: ${bestProxy.proxy} (${bestProxy.latency}ms)`);
    
    // Test 3: Test specific website
    console.log(`\n📋 Test 3: Testing specific website...`);
    try {
      const targetResult = await proxyManager.fetchWithSpecificProxy("https://httpbin.org/json", bestProxy.proxy);
      console.log(`✅ Target website accessible!`);
      console.log(`📄 Content length: ${JSON.stringify(targetResult.data).length} characters`);
    } catch (error) {
      console.log(`⚠️  Target website blocked: ${(error as Error).message}`);
      console.log(`But proxy works for other sites!`);
    }
    
    // Test 4: Library statistics
    console.log(`\n📋 Test 4: Library statistics...`);
    const stats = await proxyManager.getStats();
    console.log(`📊 Total proxies: ${stats.totalProxies}`);
    console.log(`📁 Proxy list path: ${stats.proxyListPath}`);
    console.log(`⚙️  Timeout: ${stats.config.timeout}ms`);
    
    console.log(`\n🎉 All tests completed successfully!`);
    
  } catch (error) {
    console.error(`❌ Test failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Quick test utility
async function quickTest() {
  console.log("🚀 Quick Proxy Test");
  
  const proxyManager = new ProxyManager();
  
  try {
    // Test with simple IP check
    const result = await proxyManager.fetchWithProxy("https://httpbin.org/ip", 3);
    console.log(`✅ Working proxy found: ${result.proxy}`);
    console.log(`📊 Your IP: ${JSON.stringify(result.data)}`);
    console.log(`⏱️  Latency: ${result.latency}ms`);
    
  } catch (error) {
    console.error(`❌ No working proxies found: ${(error as Error).message}`);
  }
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith('/test.ts') ||
                     process.argv[1]?.endsWith('test.ts');

if (isMainModule) {
  // Run comprehensive test by default
  comprehensiveTest()
    .then(() => {
      console.log(`\n✅ Tests completed successfully!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n❌ Tests failed:`, error.message);
      process.exit(1);
    });
}

export { quickTest, comprehensiveTest };
