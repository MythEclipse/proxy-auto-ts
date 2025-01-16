import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import pino from 'pino';

const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
        },
    },
});

const sources = [
    'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
    'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
    'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
    'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
    'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
    'https://www.proxy-list.download/api/v1/get?type=http',
    'https://www.proxy-list.download/api/v1/get?type=https',
];

const MAX_CONCURRENT_VALIDATIONS = 10000; // Jumlah maksimum validasi simultan

async function fetchUrl(url: string): Promise<string | null> {
    logger.info(`Fetching URL: ${url}`);
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            },
            timeout: 15000,
        });
        logger.info(`Fetched URL successfully: ${url}`);
        return response.data;
    } catch (error) {
        logger.error({ err: error }, `Error fetching ${url}`);
        return null;
    }
}

function parseProxyList(content: string, proxies: Set<string>): void {
    logger.info(`Parsing proxy list content`);
    if (!content) return;

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
    logger.info(`Parsed ${proxies.size} proxies`);
}

async function validateProxy(proxy: string): Promise<boolean> {
    // logger.info(`Validating proxy: ${proxy}`);
    try {
        const [host, port] = proxy.split(':');
        if (!host || !port) {
            throw new Error(`Invalid proxy format: ${proxy}`);
        }

        const agent = new HttpsProxyAgent(`http://${host}:${port}`);
        const response = await axios.get('https://www.google.com', {
            httpsAgent: agent,
            timeout: 5000,
        });

        const isValid = response.status === 200;
        logger.info(`Proxy ${proxy} is ${isValid ? 'valid' : 'invalid'}`);
        return isValid;
    } catch (error) {
        logger.error(`Error validating proxy ${proxy}`);
        return false;
    }
}

async function validateProxies(proxies: Set<string>): Promise<Set<string>> {
    logger.info(`Validating ${proxies.size} proxies`);
    const validProxies = new Set<string>();
    const limit = pLimit(MAX_CONCURRENT_VALIDATIONS);

    const validationTasks = Array.from(proxies).map(proxy =>
        limit(async () => {
            if (await validateProxy(proxy)) {
                validProxies.add(proxy);
            }
        })
    );

    await Promise.all(validationTasks);
    logger.info(`Validated ${validProxies.size} proxies`);
    return validProxies;
}

async function fetchAllProxies(): Promise<Set<string>> {
    logger.info(`Fetching all proxies from sources`);
    const proxies = new Set<string>();
    for (const url of sources) {
        const content = await fetchUrl(url);
        if (content) {
            parseProxyList(content, proxies);
        }
    }
    logger.info(`Fetched a total of ${proxies.size} proxies`);
    return proxies;
}

function saveProxies(proxies: Set<string>): void {
    if (proxies.size === 0) {
        logger.warn("No proxies found to save!");
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
        '',
        ...sortedProxies,
    ].join('\n');

    fs.writeFileSync(filePath, fileContent, 'utf-8');
    logger.info(`Saved ${proxies.size} proxies to proxies.txt`);
}

async function main() {
    logger.info(`Starting proxy fetching and validation process`);
    const proxies = await fetchAllProxies();
    logger.info(`Fetched ${proxies.size} proxies.`);
    
    const validProxies = await validateProxies(proxies);
    logger.info(`Validated ${validProxies.size} proxies.`);

    saveProxies(validProxies);
    logger.info(`Process completed successfully`);
}

main().catch(error => logger.error({ err: error }, "Error in main function"));
