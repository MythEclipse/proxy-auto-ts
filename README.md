# Proxy Auto Fetcher

Proyek ini adalah proxy auto-fetcher berbasis TypeScript yang secara berkala mengambil dan memvalidasi daftar proxy dari berbagai sumber. Proxy yang telah divalidasi disimpan ke file untuk digunakan dalam aplikasi lain.

## Daftar Isi

- [Instalasi](#instalasi)
- [Penggunaan](#penggunaan)
- [Fitur](#fitur)
- [Konfigurasi](#konfigurasi)
- [Skrip](#skrip)
- [Struktur Kode](#struktur-kode)

## Instalasi

1. Clone repositori:
    ```sh
    git clone https://github.com/MythEclipse/proxy-auto-ts.git
    cd proxy-auto-ts
    ```

2. Instal dependensi dengan Bun:
    ```sh
    bun install
    ```

## Penggunaan

### Mengambil dan Memvalidasi Proxy

Untuk mengambil dan memvalidasi proxy, jalankan:
```sh
bun run proxy
```

Proxy yang telah divalidasi akan disimpan ke `proxies.txt` dengan informasi latensi.

### Menggunakan Proxy untuk Fetch Data

Untuk menggunakan proxy yang telah divalidasi untuk fetch data:
```sh
bun run dev
```

## Fitur

- ✅ **Multi-source proxy fetching**: Mengambil proxy dari berbagai sumber
- ✅ **Concurrent validation**: Validasi proxy secara paralel untuk performa optimal
- ✅ **Latency measurement**: Mengukur dan mengurutkan proxy berdasarkan latensi
- ✅ **Error handling**: Penanganan error yang robust
- ✅ **Logging**: Logging yang informatif dengan pino
- ✅ **Type safety**: Menggunakan TypeScript untuk type safety
- ✅ **Modular architecture**: Kode yang terorganisir dengan baik

## Konfigurasi

Konfigurasi dapat disesuaikan di `src/proxy.ts`:

```typescript
const CONFIG = {
  FETCH_TIMEOUT: 20000,        // Timeout untuk fetch proxy sources
  VALIDATION_TIMEOUT: 6000,    // Timeout untuk validasi proxy
  VALIDATION_CONCURRENCY: 50,  // Jumlah proxy yang divalidasi bersamaan
  TEST_URL: "https://www.google.com", // URL untuk test proxy
} as const;
```

## Skrip

- `bun run dev`: Jalankan aplikasi utama (index.ts)
- `bun run proxy`: Ambil dan validasi proxy, lalu simpan ke `proxies.txt`
- `bun run start`: Jalankan aplikasi utama
- `bun run build`: Build aplikasi untuk production
- `bun run test`: Test aplikasi dengan proxy

## Struktur Kode

### `src/proxy.ts`
- **ProxyUtils**: Utility functions untuk parsing dan formatting proxy
- **HttpClient**: HTTP client untuk fetch dan validasi proxy
- **ProxyService**: Service utama untuk mengelola proxy operations

### `src/index.ts`
- **ProxyManager**: Manager untuk menggunakan proxy yang telah divalidasi
- **ProxyFetchResult**: Interface untuk hasil fetch dengan proxy

### GitHub Actions
- Workflow otomatis untuk fetch proxy setiap hari
- Menggunakan Bun untuk performa yang lebih baik
- Auto-commit hasil ke repository

