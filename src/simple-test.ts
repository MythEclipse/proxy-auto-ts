import { ProxyManager } from "./lib.js";

// Simple test utility that won't hang
async function simpleTest() {
  console.log("🧪 Simple Proxy Test");
  
  const proxyManager = new ProxyManager();
  await proxyManager.initialize();
  
  const proxyCount = await proxyManager.getProxyCount();
  console.log(`📊 Loaded ${proxyCount} proxies`);
  
  // Set a short timeout for testing
  const testManager = new ProxyManager({
    timeout: 5000,
    validationTimeout: 3000
  });
  await testManager.initialize();
  
  try {
    // Test with very limited retries
    console.log(`\n📋 Testing with limited retries (max 3)...`);
    const result = await testManager.fetchWithProxy("https://httpbin.org/ip", 3);
    console.log(`✅ Working proxy found: ${result.proxy}`);
    console.log(`📊 Your IP: ${JSON.stringify(result.data)}`);
    console.log(`⏱️  Latency: ${result.latency}ms`);
    
  } catch (error) {
    console.log(`⚠️  No working proxies found in first 3 attempts: ${(error as Error).message}`);
  }
  
  // Test stats
  console.log(`\n📋 Library statistics...`);
  const stats = await proxyManager.getStats();
  console.log(`📊 Total proxies: ${stats.totalProxies}`);
  console.log(`📁 Proxy list path: ${stats.proxyListPath}`);
  console.log(`⚙️  Timeout: ${stats.config.timeout}ms`);
  
  console.log(`\n🎉 Test completed!`);
}

// Run the test
simpleTest()
  .then(() => {
    console.log(`\n✅ All tests completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Test failed:`, error.message);
    process.exit(1);
  });
