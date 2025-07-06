/**
 * Example usage of proxy-auto-ts library
 */

import { ProxyManager } from './lib.js';

async function basicExample() {
  console.log('🚀 Basic Example');
  
  const proxyManager = new ProxyManager();
  
  try {
    const result = await proxyManager.fetchWithProxy('https://httpbin.org/ip');
    console.log('✅ Success!');
    console.log('📊 Your IP:', result.data.origin);
    console.log('🔗 Used proxy:', result.proxy);
    console.log('⚡ Latency:', result.latency + 'ms');
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }
}

async function customConfigExample() {
  console.log('\n🛠️ Custom Configuration Example');
  
  const proxyManager = new ProxyManager({
    timeout: 20000,
    validationTimeout: 10000,
    fallbackUrls: [
      'https://httpbin.org/ip',
      'https://api.ipify.org?format=json'
    ]
  });
  
  try {
    const result = await proxyManager.fetchWithProxy('https://httpbin.org/user-agent');
    console.log('✅ Success with custom config!');
    console.log('📊 Response:', result.data);
    console.log('🔗 Used proxy:', result.proxy);
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }
}

async function bestProxyExample() {
  console.log('\n🏆 Best Proxy Example');
  
  const proxyManager = new ProxyManager();
  
  try {
    const bestProxy = await proxyManager.findBestProxy();
    console.log('🏆 Best proxy found:', bestProxy.proxy);
    console.log('⚡ Latency:', bestProxy.latency + 'ms');
    
    // Use the best proxy for another request
    const result = await proxyManager.fetchWithSpecificProxy(
      'https://httpbin.org/ip',
      bestProxy.proxy
    );
    console.log('✅ Used best proxy successfully!');
    console.log('📊 IP:', result.data.origin);
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
  }
}

async function statsExample() {
  console.log('\n📊 Statistics Example');
  
  const proxyManager = new ProxyManager();
  const stats = proxyManager.getStats();
  
  console.log('📊 Total proxies:', stats.totalProxies);
  console.log('📁 Proxy list path:', stats.proxyListPath);
  console.log('⏱️ Timeout:', stats.config.timeout + 'ms');
  console.log('🔍 Validation timeout:', stats.config.validationTimeout + 'ms');
}

// Main function to run all examples
async function runAllExamples() {
  console.log('🎯 Proxy Auto TS - Usage Examples\n');
  
  await basicExample();
  await customConfigExample();
  await bestProxyExample();
  await statsExample();
  
  console.log('\n✨ All examples completed!');
}

// Export for use in other modules
export {
  basicExample,
  customConfigExample,
  bestProxyExample,
  statsExample,
  runAllExamples
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples().catch(console.error);
}
