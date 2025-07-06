import { ProxyManager } from "./lib.js";

// Fast test with aggressive timeouts
async function fastTest() {
  console.log("⚡ Fast Proxy Test");
  
  const proxyManager = new ProxyManager({
    timeout: 2000,        // 2 seconds
    validationTimeout: 1000  // 1 second
  });
  await proxyManager.initialize();
  
  const proxyCount = await proxyManager.getProxyCount();
  console.log(`📊 Loaded ${proxyCount} proxies`);
  
  try {
    console.log(`\n📋 Testing first 5 proxies quickly...`);
    const result = await proxyManager.fetchWithProxy("https://httpbin.org/ip", 5);
    console.log(`✅ Working proxy found: ${result.proxy}`);
    console.log(`📊 Your IP: ${JSON.stringify(result.data)}`);
    console.log(`⏱️  Latency: ${result.latency}ms`);
    
    // Test stats
    const stats = await proxyManager.getStats();
    console.log(`\n📊 Stats: ${stats.totalProxies} proxies from ${stats.proxyListPath}`);
    
  } catch (error) {
    console.log(`⚠️  No working proxies found in first 5 attempts`);
    console.log(`Error: ${(error as Error).message}`);
  }
  
  console.log(`\n🎉 Fast test completed!`);
}

// Run with timeout
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('Test timeout after 30 seconds')), 30000);
});

Promise.race([fastTest(), timeoutPromise])
  .then(() => {
    console.log(`\n✅ Fast test completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Fast test failed:`, error.message);
    process.exit(1);
  });
