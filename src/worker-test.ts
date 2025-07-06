import { ProxyManager } from './lib';

async function testWorkerPerformance() {
  console.log('🔬 Testing worker-based proxy validation performance...');
  
  const proxyManager = new ProxyManager({
    validationTimeout: 3000,
    proxyListPath: '../proxies.txt'
  });
  
  await proxyManager.initialize();
  const totalProxies = await proxyManager.getProxyCount();
  console.log(`📊 Total proxies loaded: ${totalProxies}`);
  
  // Test 1: Find best proxy with worker threads
  console.log('\n=== Test 1: Finding best proxy with worker threads ===');
  const startTime = Date.now();
  try {
    const bestProxy = await proxyManager.findBestProxy('https://httpbin.org/ip', 100);
    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`✅ Best proxy found: ${bestProxy.proxy} (${bestProxy.latency}ms)`);
    console.log(`⏱️  Total time: ${elapsed.toFixed(2)}s`);
  } catch (error) {
    console.error('❌ Error finding best proxy:', error);
  }
  
  // Test 2: Validate a batch of proxies
  console.log('\n=== Test 2: Validating batch of proxies ===');
  const batchStart = Date.now();
  try {
    const proxies = await proxyManager.getProxies();
    const testBatch = proxies.slice(0, 200); // Test first 200 proxies
    const proxyManagerTest = new ProxyManager({
      validationTimeout: 3000,
      proxyListPath: '../proxies.txt'
    });
    proxyManagerTest['proxies'] = testBatch; // Set proxies directly for testing
    
    const results = await proxyManagerTest.validateAllProxies();
    const batchElapsed = (Date.now() - batchStart) / 1000;
    const validCount = results.filter(r => r.status === 200).length;
    
    console.log(`✅ Batch validation complete: ${validCount}/${testBatch.length} valid proxies`);
    console.log(`⏱️  Total time: ${batchElapsed.toFixed(2)}s`);
    console.log(`⚡ Speed: ${(testBatch.length / batchElapsed).toFixed(1)} proxies/second`);
  } catch (error) {
    console.error('❌ Error in batch validation:', error);
  }
}

testWorkerPerformance().catch(console.error);
