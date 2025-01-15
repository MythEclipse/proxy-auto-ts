# Proxy Auto Fetcher

Proyek ini adalah proxy auto-fetcher berbasis TypeScript yang secara berkala mengambil dan memvalidasi daftar proxy dari berbagai sumber. Proxy yang telah divalidasi disimpan ke file untuk digunakan dalam aplikasi lain.

## Daftar Isi

- [Instalasi](#instalasi)
- [Penggunaan](#penggunaan)
- [Konfigurasi](#konfigurasi)
- [Skrip](#skrip)

## Instalasi

1. Clone repositori:
    ```sh
    git clone https://github.com/MythEclipse/proxy-auto-ts.git
    cd proxy-auto-ts
    ```

2. Instal dependensi:
    ```sh
    pnpm install
    ```

## Penggunaan

Untuk mengambil dan memvalidasi proxy, jalankan:
```sh
pnpm run proxy
```

Proxy yang telah divalidasi akan disimpan ke `proxies.txt`.

## Konfigurasi

Sumber proxy didefinisikan di `src/proxy.ts`. Anda dapat menambah atau menghapus sumber sesuai kebutuhan.

## Skrip

- `pnpm run dev`: Kompilasi file TypeScript dan jalankan aplikasi.
- `pnpm run proxy`: Ambil dan validasi proxy, lalu simpan ke `proxies.txt`.
- `pnpm run start`: Jalankan aplikasi.
- `pnpm run build`: Kompilasi file TypeScript.

