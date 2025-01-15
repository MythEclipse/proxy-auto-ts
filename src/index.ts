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
            .filter((proxy) => proxy.trim() !== "" && !proxy.startsWith("#") && /\d+\.\d+\.\d+\.\d+:\d+/.test(proxy));
    } catch (error) {
        throw new Error(`Gagal mengambil daftar proxy: ${(error as Error).message}`);
    }
};

const fetchWithProxy = async (url: string): Promise<any> => {
    const proxies = await getProxies();
    if (proxies.length === 0) {
        throw new Error("Tidak ada proxy yang tersedia.");
    }

    // Acak urutan proxy
    const shuffledProxies = proxies.sort(() => Math.random() - 0.5);

    for (const proxy of shuffledProxies) {
        const [host, port] = proxy.split(":");
        if (!host || !port) {
            console.error(`Proxy tidak valid: ${proxy}`);
            continue;
        }

        try {
            const axiosConfig = https
                ? {
                      httpsAgent: new https.Agent({
                          host,
                          port: parseInt(port, 10),
                          rejectUnauthorized: false,
                      }),
                      proxy: {
                          host,
                          port: parseInt(port, 10),
                      }, // Nonaktifkan pengaturan proxy default Axios
                      timeout: 1000,
                  }
                : {
                      proxy: {
                          host,
                          port: parseInt(port, 10),
                      },
                      timeout: 1000,
                  };

            const response = await axios.get(url, axiosConfig);
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
    const targetUrl = "https://httpbin.org/ip"; // URL target untuk testing
    try {
        const result = await fetchWithProxy(targetUrl);
        console.log("Hasil fetch:", result);
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
    }
})();
