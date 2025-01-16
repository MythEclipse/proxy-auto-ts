import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const sources = [
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
    'https://www.proxy-list.download/api/v1/get?type=http',
    'https://www.proxy-list.download/api/v1/get?type=https'
];

async function fetchUrl(url: string): Promise<string | null> {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, (error as any).message);
        return null;
    }
}

function parseProxyList(content: string, url: string, proxies: Set<string>): void {
    if (!content) return;

    try {
        const lines = content.split('\n');
        for (const line of lines) {
            const cleanedLine = line.trim();
            if (cleanedLine && cleanedLine.includes(':')) {
                const proxy = cleanedLine.split(' ')[0];
                if (proxy) {
                    const [host, port] = proxy.split(':');
                    if (host && port && !isNaN(Number(port)) && Number(port) >= 1 && Number(port) <= 65535) {
                        proxies.add(`${host}:${port}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error parsing content from ${url}:`, error);
    }
}

async function validateProxy(proxy: string): Promise<boolean> {
    try {
        const [host, port] = proxy.split(':');
        if (!host || !port) {
            throw new Error(`Invalid proxy format: ${proxy}`);
        }
        const response = await axios.get('http://www.google.com', {
            proxy: {
                host,
                port: Number(port)
            },
            timeout: 5000
        });
        return response.status === 200;
    } catch {
        return false;
    }
}

async function validateProxies(proxies: Set<string>): Promise<Set<string>> {
    const validProxies = new Set<string>();
    const validationTasks = Array.from(proxies).map(async proxy => {
        if (await validateProxy(proxy)) {
            validProxies.add(proxy);
        }
    });
    await Promise.all(validationTasks);
    return validProxies;
}

async function fetchAllProxies(): Promise<Set<string>> {
    const proxies = new Set<string>();
    for (const url of sources) {
        const content = await fetchUrl(url);
        if (content) {
            parseProxyList(content, url, proxies);
        }
    }
    return proxies;
}

function saveProxies(proxies: Set<string>): void {
    if (proxies.size === 0) {
        console.warn("No proxies found to save!");
        return;
    }

    const timestamp = new Date().toISOString();
    const filePath = path.resolve(__dirname, '../proxies.txt');
    const sortedProxies = Array.from(proxies).sort((a, b) => {
        const [ipA, portA] = a.split(':');
        const [ipB, portB] = b.split(':');
        return (ipA ?? '').localeCompare(ipB ?? '') || Number(portA) - Number(portB);
    });

    const fileContent = [
        `# Proxy List - Updated: ${timestamp}`,
        `# Total proxies: ${proxies.size}`,
        `# Sources used: ${sources.length}`,
        '',
        ...sortedProxies
    ].join('\n');

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    console.info(`Saved ${proxies.size} proxies to proxies.txt`);
}

async function main() {
    const proxies = await fetchAllProxies();
    console.info(`Fetched ${proxies.size} proxies.`);
    
    const validProxies = await validateProxies(proxies);
    console.info(`Validated ${validProxies.size} proxies.`);

    saveProxies(validProxies);
}

main().catch(error => console.error("Error in main function:", error));
