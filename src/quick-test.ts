import { ProxyService, type ValidatedProxy } from "./proxy.js";

// Quick test to demonstrate the enhanced proxy filtering
async function quickTest(): Promise<void> {
  console.log("🚀 Starting quick proxy test...");
  
  // Test with a small sample
  const sampleProxies = new Set([
    "8.8.8.8:80",
    "1.1.1.1:80", 
    "192.168.1.1:8080",
    "127.0.0.1:3128",
    "invalid:proxy",
    "not.a.valid.ip:8080"
  ]);
  
  console.log(`Testing ${sampleProxies.size} sample proxies...`);
  
  const validatedProxies = await ProxyService.validateProxiesWithWorkers(sampleProxies);
  
  console.log(`✓ Found ${validatedProxies.length} working proxies`);
  validatedProxies.forEach((proxy: ValidatedProxy) => {
    console.log(`  - ${proxy.proxy} (${proxy.latency}ms)`);
  });
}

// Run the quick test
quickTest().catch(console.error);
