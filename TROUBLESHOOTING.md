# Proxy Troubleshooting Guide

## ❌ Masalah yang Terjadi

Ketika menjalankan `bun run fetch`, proxy gagal dengan error berikut:

```
❌ Failed with proxy 52.74.26.202:8080: Request failed with status code 403
❌ Failed with proxy 152.42.170.187:9090: The socket connection was closed unexpectedly
❌ Failed with proxy 188.166.230.109:31028: timeout of 12000ms exceeded
```

## 🔍 Analisis Masalah

### 1. **403 Forbidden**
- Website target memblokir proxy atau IP address tertentu
- Beberapa website memiliki sistem anti-proxy yang kuat
- Proxy mungkin sudah masuk blacklist

### 2. **Socket Connection Closed**
- Proxy tidak stabil atau overloaded
- Website memutus koneksi dari proxy
- Proxy mungkin sudah mati atau tidak responsif

### 3. **Timeout**
- Proxy terlalu lambat untuk website tertentu
- Network latency tinggi
- Proxy sedang dalam kondisi sibuk

## ✅ Solusi yang Diterapkan

### 1. **Multiple Fallback URLs**
```typescript
const CONFIG = {
  FALLBACK_URLS: [
    "https://httpbin.org/ip",
    "https://api.ipify.org?format=json", 
    "https://jsonip.com",
    "https://ifconfig.me/ip"
  ]
}
```

### 2. **Enhanced Headers**
```typescript
headers: {
  'User-Agent': this.getRandomUserAgent(),
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive'
}
```

### 3. **Improved Error Handling**
- Timeout ditingkatkan dari 12s ke 15s
- Retry dengan multiple URLs per proxy
- Delay antar percobaan proxy
- Random User-Agent untuk menghindari detection

### 4. **Smart Proxy Testing**
- Test proxy dengan endpoint sederhana dulu
- Jika berhasil, baru coba dengan target URL
- Fallback ke URL alternatif jika gagal

## 🧪 Testing

### Quick Test
```bash
bun run quick
```

### Full Test  
```bash
bun run dev
```

### Update Proxy List
```bash
bun run proxy
```

## 📊 Hasil Test

```
✅ Successfully used proxy: 152.42.170.187:9090 with URL: https://httpbin.org/ip (1218ms)
✅ Target URL Success!
📊 Proxy: 152.42.170.187:9090
⏱️  Latency: 349ms
📄 Response length: 43111 characters
```

## 💡 Tips Penggunaan

1. **Gunakan `bun run quick`** untuk test cepat
2. **Update proxy list secara berkala** dengan `bun run proxy`
3. **Beberapa website memang memblokir proxy** - ini normal
4. **Proxy yang gagal untuk satu website mungkin berhasil untuk website lain**
5. **Latency proxy bervariasi** tergantung waktu dan beban server

## 🔧 Troubleshooting

### Jika semua proxy gagal:
```bash
# Update proxy list
bun run proxy

# Test dengan endpoint sederhana
bun run quick
```

### Jika target website diblokir:
- Coba website lain untuk memastikan proxy bekerja
- Gunakan proxy dengan latency lebih rendah
- Coba di waktu yang berbeda

## 🎯 Kesimpulan

Proxy sekarang **berfungsi dengan baik**! Masalah sebelumnya sudah teratasi dengan:
- ✅ Fallback URLs
- ✅ Better error handling  
- ✅ Smart retry logic
- ✅ Enhanced headers
- ✅ Improved timeout handling

Proxy yang bekerja: `152.42.170.187:9090` dengan latency 349ms untuk target website.
