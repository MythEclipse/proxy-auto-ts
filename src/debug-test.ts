import { ProxyManager } from "./lib.js";

// Debug test
async function debugTest() {
  console.log("🔍 Debug Test");
  
  const proxyManager = new ProxyManager({
    timeout: 3000,
    validationTimeout: 2000
  });
  await proxyManager.initialize();
  
  const proxies = await proxyManager.getProxies();
  console.log(`📊 Loaded ${proxies.length} proxies`);
  console.log(`🔍 First few proxies:`, proxies.slice(0, 3));
  
  // Test with a single proxy directly
  console.log(`\n🔍 Testing single proxy...`);
  try {
    const result = await proxyManager.fetchWithSpecificProxy("https://httpbin.org/ip", proxies[0]);
    console.log(`✅ Single proxy test successful: ${result.proxy}`);
    console.log(`📊 IP: ${JSON.stringify(result.data)}`);
  } catch (error) {
    console.log(`❌ Single proxy test failed: ${(error as Error).message}`);
  }
  
  console.log(`\n🔍 Testing with fetchWithProxy (1 retry)...`);
  try {
    const result = await proxyManager.fetchWithProxy("https://httpbin.org/ip", 1);
    console.log(`✅ fetchWithProxy test successful: ${result.proxy}`);
    console.log(`📊 IP: ${JSON.stringify(result.data)}`);
  } catch (error) {
    console.log(`❌ fetchWithProxy test failed: ${(error as Error).message}`);
  }
  
  console.log(`\n🎉 Debug test completed!`);
}

// Run the debug test
debugTest()
  .then(() => {
    console.log(`\n✅ Debug test completed successfully!`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n❌ Debug test failed:`, error.message);
    process.exit(1);
  });
