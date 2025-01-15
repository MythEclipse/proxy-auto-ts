import axios from "axios";
import https from "https";
import fs from "fs";
import path from "path";

const PROXY_LIST_PATH = path.resolve(__dirname, "../proxies.txt");

const getProxies = async (): Promise<string[]> => {
    try {
        const data = fs.readFileSync(PROXY_LIST_PATH, "utf-8");
        return data
            .split("\n")
            .filter((proxy: string) => proxy.trim() !== "" && !proxy.startsWith("#") && /\d+\.\d+\.\d+\.\d+:\d+/.test(proxy));
    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Gagal mengambil daftar proxy: ${error.message}`);
        }
        throw new Error("Gagal mengambil daftar proxy: Kesalahan tak terduga.");
    }
};

const fetchWithProxy = async (url: string): Promise<any> => {
    const proxies = await getProxies();
    if (proxies.length === 0) {
        throw new Error("Tidak ada proxy yang tersedia.");
    }

    for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];
        if (!proxy) {
            console.error("Proxy tidak ditemukan.");
            continue;
        }

        const [host, port] = proxy.split(":");

        if (!host || !port) {
            console.error(`Proxy tidak valid: ${proxy}`);
            continue;
        }

        try {
            // Buat https agent untuk menonaktifkan verifikasi sertifikat SSL
            const agent = new https.Agent({ rejectUnauthorized: false });

            // Konfigurasi Axios dengan proxy dan agent
            const axiosInstance = axios.create({
                proxy: {
                    host,
                    port: parseInt(port, 10),
                },
                httpsAgent: agent, // Menonaktifkan verifikasi sertifikat
                timeout: 1000,
            });

            const response = await axiosInstance.get(url);
            return response.data;
        } catch (error) {
            if (error instanceof Error) {
                console.log(`Gagal menggunakan proxy ${proxy}: ${error.message}`);
            } else {
                console.log(`Gagal menggunakan proxy ${proxy}: Error tak terduga.`);
            }
        }
    }

    throw new Error("Semua percobaan dengan proxy gagal.");
};

// Contoh penggunaan
(async () => {
    const targetUrl = "https://httpbin.org/ip"; // URL target untuk testing
    try {
        const result = await fetchWithProxy(targetUrl);
        console.log("Hasil fetch:", result);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        } else {
            console.error("Unknown error occurred");
        }
    }
})();