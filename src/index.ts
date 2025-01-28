import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { HttpsProxyAgent } from "https-proxy-agent";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROXY_LIST_PATH = path.resolve(__dirname, "../proxies.txt");

const getProxies = async (): Promise<string[]> => {
    try {
        const data = fs.readFileSync(PROXY_LIST_PATH, "utf-8");
        return data
            .split("\n")
            .filter((line) => line.trim() !== "" && !line.startsWith("#"))
            .map((line) => line.split(" ")[0].trim());
    } catch (error) {
        throw new Error(`Gagal mengambil daftar proxy: ${(error as Error).message}`);
    }
};

const fetchWithProxy = async (url: string): Promise<any> => {
    const proxies = await getProxies();
    if (proxies.length === 0) {
        throw new Error("Tidak ada proxy yang tersedia.");
    }

    for (const proxy of proxies) {
        try {
            const agent = new HttpsProxyAgent(proxy.startsWith('http') ? proxy : `http://${proxy}`);
            const response = await axios.get(url, {
                httpsAgent: agent,
                timeout: 12000,
              });
            console.log(`Berhasil menggunakan proxy: ${proxy}`);
            return response.data;
        } catch (error) {
            console.error(`Gagal menggunakan proxy ${proxy}: ${(error as Error).message}`);
        }
    }

    throw new Error("Semua percobaan dengan proxy gagal.");
};

// Contoh penggunaan
(async () => {
    const targetUrl = "https://otakudesu.cloud"; // URL target untuk testing
    try {
        const result = await fetchWithProxy(targetUrl);
        console.log("Hasil fetch:", result);
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
    }
})();
