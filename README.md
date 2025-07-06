# 🔄 Proxy Auto TS

A comprehensive TypeScript library for automatic proxy management with validation, rotation, and intelligent selection.

[![npm version](https://badge.fury.io/js/proxy-auto-ts.svg)](https://badge.fury.io/js/proxy-auto-ts)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🔄 **Automatic Proxy Rotation**: Seamlessly rotate through working proxies
- 🧪 **Proxy Validation**: Built-in proxy testing and validation
- ⚡ **Performance Optimization**: Latency-based proxy selection
- 🛡️ **Fallback Support**: Multiple URL fallbacks for enhanced reliability
- 🎯 **Smart Headers**: Random User-Agent rotation and realistic headers
- 📊 **Comprehensive Statistics**: Detailed proxy performance metrics
- 🚀 **Easy Integration**: Simple API with TypeScript support
- 🔧 **Configurable**: Customizable timeouts, fallbacks, and user agents

## 📦 Installation

```bash
npm install proxy-auto-ts
# or
yarn add proxy-auto-ts
# or
bun add proxy-auto-ts
```

## 🚀 Quick Start

```typescript
import { ProxyManager } from 'proxy-auto-ts';

// Initialize with default configuration
const proxyManager = new ProxyManager();

// Fetch data through proxy
const result = await proxyManager.fetchWithProxy('https://httpbin.org/ip');
console.log('Your IP:', result.data.origin);
console.log('Used proxy:', result.proxy);
console.log('Latency:', result.latency + 'ms');
```

## 📖 API Documentation

### ProxyManager

#### Constructor

```typescript
new ProxyManager(config?: ProxyManagerConfig)
```

**Configuration Options:**

```typescript
interface ProxyManagerConfig {
  timeout?: number;              // Request timeout (default: 15000ms)
  validationTimeout?: number;    // Proxy validation timeout (default: 8000ms)
  fallbackUrls?: string[];       // Fallback URLs for testing
  userAgents?: string[];         // Custom User-Agent list
  proxyListPath?: string;        // Custom proxy list file path
}
```

#### Methods

##### `fetchWithProxy(url: string, maxRetries?: number): Promise<ProxyFetchResult>`

Fetch URL through the first available working proxy with automatic fallbacks.

```typescript
const result = await proxyManager.fetchWithProxy('https://example.com', 5);
```

##### `findBestProxy(testUrl?: string, maxProxiesToTest?: number): Promise<ProxyFetchResult>`

Find the best performing proxy based on latency.

```typescript
const bestProxy = await proxyManager.findBestProxy();
console.log(`Best proxy: ${bestProxy.proxy} (${bestProxy.latency}ms)`);
```

##### `fetchWithSpecificProxy(url: string, targetProxy: string): Promise<ProxyFetchResult>`

Fetch URL using a specific proxy.

```typescript
const result = await proxyManager.fetchWithSpecificProxy(
  'https://example.com', 
  '1.2.3.4:8080'
);
```

##### `testProxy(proxy: string, testUrl?: string): Promise<boolean>`

Test if a specific proxy is working.

```typescript
const isWorking = await proxyManager.testProxy('1.2.3.4:8080');
```

##### `getStats(): object`

Get proxy statistics and configuration.

```typescript
const stats = proxyManager.getStats();
console.log(`Total proxies: ${stats.totalProxies}`);
```

### Types

```typescript
interface ProxyFetchResult {
  data: any;        // Response data
  proxy: string;    // Used proxy address
  latency: number;  // Request latency in milliseconds
}
```

## 🛠️ Advanced Usage

### Custom Configuration

```typescript
import { ProxyManager } from 'proxy-auto-ts';

const proxyManager = new ProxyManager({
  timeout: 20000,
  validationTimeout: 10000,
  fallbackUrls: [
    'https://httpbin.org/ip',
    'https://api.ipify.org?format=json'
  ],
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  ],
  proxyListPath: './custom-proxies.txt'
});
```

### Error Handling

```typescript
try {
  const result = await proxyManager.fetchWithProxy('https://example.com');
  console.log('Success:', result.data);
} catch (error) {
  console.error('All proxies failed:', error.message);
}
```

### Performance Optimization

```typescript
// Find and use the best proxy
const bestProxy = await proxyManager.findBestProxy();

// Use the best proxy for subsequent requests
const result = await proxyManager.fetchWithSpecificProxy(
  'https://your-target-site.com',
  bestProxy.proxy
);
```

## 📁 Proxy List Format

Create a `proxies.txt` file with the following format:

```
# Proxy List - Updated: 2025-07-06T08:23:16.183Z
# Total proxies: 59

52.74.26.202:8080  # 133ms
152.42.170.187:9090  # 171ms
188.166.230.109:31028  # 273ms
182.253.109.26:8080  # 286ms
```

## 🧪 Testing

```bash
# Run comprehensive tests
bun run test

# Quick test
bun run test:quick

# Update proxy list
bun run proxy
```

## 🔧 Development

```bash
# Clone the repository
git clone https://github.com/yourusername/proxy-auto-ts.git

# Install dependencies
bun install

# Build the library
bun run build

# Run tests
bun run test
```

## 📝 Scripts

- `build` - Build the library for production
- `dev` - Run development tests
- `test` - Run comprehensive tests
- `proxy` - Update proxy list from sources
- `clean` - Clean build directory

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with TypeScript for type safety
- Uses axios for HTTP requests
- Powered by https-proxy-agent for proxy support
- Includes automatic proxy validation and rotation

## 📞 Support

- 📧 Email: your.email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/proxy-auto-ts/issues)
- 📖 Documentation: [GitHub Wiki](https://github.com/yourusername/proxy-auto-ts/wiki)

