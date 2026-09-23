# Peta area dengan Cesium

Peta membantu mengenali area DeliPark dan Sun Plaza. Marker mall memakai perkiraan titik bangunan pada katalog. Marker tersebut belum mewakili pintu masuk yang aksesibel, loket kursi roda, atau titik fasilitas di lantai tertentu.

Cesium tidak menambahkan posisi indoor atau denah lantai pada aplikasi ini. Terrain dan bangunan 3D juga tidak menyediakan jalur koridor yang bisa dipakai untuk petunjuk belok. Posisi lantai dan penanda tetap berasal dari keterangan yang dikonfirmasi pengguna.

## Menjalankan tanpa token

```sh
npm start
```

Buka [halaman lokal](http://127.0.0.1:3000/aksesin.html), lalu tekan **Buka peta area**. Aplikasi memuat JavaScript, CSS, dan aset pendukung CesiumJS **1.145** dari CDN hanya saat peta dibuka. URL versi berada di `public/js/api/cesium-map.js` dan mengikuti bentuk pemuatan pada [CesiumJS Quickstart](https://cesium.com/learn/cesiumjs-learn/cesiumjs-quickstart/).

Peta dasar menggunakan imagery OpenStreetMap dan permukaan ellipsoid Cesium. Mode ini tidak memerlukan akun atau token ion. Aplikasi mengosongkan token demo bawaan Cesium dan tidak mengaktifkan geocoder, World Terrain, atau OSM Buildings pada mode tanpa token. Koneksi internet serta browser dengan WebGL diperlukan untuk menampilkan peta.

## Lapisan 3D opsional

1. Jika `.env` belum ada, salin contoh konfigurasi di akar proyek:

   ```sh
   cp -n .env.example .env
   ```

2. Buat token khusus aplikasi pada [dashboard token Cesium ion](https://ion.cesium.com/tokens). Gunakan **`assets:read` saja**, pilih aset yang diperlukan untuk Cesium World Terrain dan Cesium OSM Buildings, serta batasi **Allowed URLs** ke alamat aplikasi yang dipakai. Untuk server lokal bawaan, sertakan `http://127.0.0.1:3000`; tambahkan alamat deployment yang sebenarnya jika aplikasi dihosting. Pengaturan ini dijelaskan pada [panduan token resmi Cesium](https://cesium.com/learn/ion/cesium-ion-access-tokens/).
3. Isi `CESIUM_ION_ACCESS_TOKEN` di `.env` dengan token publik tersebut. Ubah `CESIUM_ENABLE_3D` menjadi `true`. Nilai awal pada contoh adalah:

   ```dotenv
   CESIUM_ION_ACCESS_TOKEN=
   CESIUM_ENABLE_3D=false
   ```

4. Hentikan server yang sedang berjalan, lalu jalankan ulang `npm start`. Muat ulang halaman dan buka peta.

World Terrain dan OSM Buildings hanya diminta jika token terisi **dan** `CESIUM_ENABLE_3D=true`. Token tanpa opsi tersebut tetap memakai peta dasar. Ketersediaan detail bangunan mengikuti cakupan data penyedia; penambahan token tidak menjamin interior atau bentuk setiap mall tersedia.

Token ini **dapat dilihat oleh pengguna browser**. `/api/config/maps` sengaja mengembalikannya agar CesiumJS dapat meminta aset ion langsung. Gunakan token publik dengan akses terbatas, tanpa izin menulis atau administrasi. Server hanya menyaring bentuk nilai konfigurasi; server tidak memeriksa izin token pada akun ion. Batas izin, URL, dan aset perlu ditetapkan di dashboard ion. Allowed URLs memerlukan header referer; server bawaan memakai `strict-origin-when-cross-origin`, sehingga pembatasan berdasarkan origin sesuai dengan pengaturan ini. Rincian tersedia pada [dokumentasi pembatasan token](https://cesium.com/learn/ion/cesium-ion-access-tokens/).

`OPENAI_API_KEY` berbeda: key itu tetap dibaca server dan tidak dimasukkan ke konfigurasi peta. Simpan konfigurasi dalam `.env` yang diabaikan Git. Tidak perlu menaruh token atau key pada HTML, katalog mall, ataupun percakapan chat.

## Modul dan endpoint

| Berkas | Tanggung jawab |
| --- | --- |
| [`public/js/api/cesium-map.js`](../public/js/api/cesium-map.js) | Memuat Cesium 1.145 saat dibutuhkan, mengambil konfigurasi, menampilkan mall dan perkiraan GPS, serta meminta lapisan ion opsional. |
| [`public/css/cesium-map.css`](../public/css/cesium-map.css) | Tampilan peta, tombol, foto fasilitas, dan dialog foto pada desktop/ponsel. |
| [`public/js/components/facility-photo.js`](../public/js/components/facility-photo.js) | Foto kecil, perbesaran, keterangan sumber, dan fallback ketika gambar tidak tersedia. |
| [`server/config/cesium.cjs`](../server/config/cesium.cjs) | Membentuk konfigurasi peta publik dari environment. |
| [`server/index.cjs`](../server/index.cjs) | Membaca `.env`, menyajikan berkas frontend dan `GET /api/config/maps`. |
| [`public/data/malls.js`](../public/data/malls.js) | Koordinat perkiraan mall, sumber fasilitas, dan metadata foto resmi. |

Tanpa token, respons `GET /api/config/maps` adalah:

```json
{
  "provider": "cesium",
  "ionAccessToken": null,
  "enable3d": false
}
```

Jika token dikonfigurasi, `ionAccessToken` berisi token publik itu. `enable3d` hanya bernilai `true` jika token tersedia dan environment berisi `CESIUM_ENABLE_3D=true`. Perubahan konfigurasi memerlukan restart server. Jika endpoint gagal, komponen kembali ke pengaturan peta tanpa token.

## GPS, foto, dan permintaan jaringan

**Cek lokasi perangkat** meminta lokasi satu kali melalui alur GPS yang sama dengan tombol di panel posisi. Pengguna memberi izin lewat browser. Hasil yang memenuhi batas aplikasi dapat ditampilkan sebagai titik perkiraan dan lingkaran akurasi dalam meter. Aplikasi tidak melakukan pelacakan terus-menerus; GPS tidak mengisi lantai atau penanda indoor. Hasil di luar Medan atau akurasi lebih buruk dari 150 meter tidak dipakai untuk menyarankan mall.

GPS tidak dikirim ke backend atau OpenAI oleh aplikasi. Titik disimpan di memori halaman untuk tampilan dan perkiraan area. Peta tetap melakukan permintaan ke pihak ketiga: CDN Cesium, tile OpenStreetMap, serta ion ketika lapisan 3D diaktifkan. Penyedia menerima permintaan jaringan browser; area yang terlihat dapat tersirat dari tile yang diminta, termasuk ketika tampilan dipusatkan pada perkiraan lokasi perangkat.

Foto dimuat langsung dari situs pengelola, tanpa salinan lokal. Sumber, tanggal pemeriksaan, dan perbedaan foto tempat DeliPark dengan gambar layanan Sun Plaza dijelaskan pada [panduan data](data-sources.md#foto-peminjaman-kursi-roda). Gambar Sun Plaza belum memastikan tampilan loket GF Zone C. Kegagalan gambar menampilkan fallback dan tautan sumber, sementara informasi fasilitas tetap tersedia.

## Jika peta belum tampil

- Jika CDN terputus atau WebGL tidak tersedia, aplikasi menampilkan pesan kegagalan dan tombol untuk mencoba kembali. Chat, posisi manual, dan informasi fasilitas tetap tersedia.
- Jika lapisan 3D gagal, peta dasar tetap digunakan. Periksa token, Allowed URLs, akses kedua aset, dan koneksi sebelum mencoba lagi.
- Jika GPS ditolak atau terlalu kasar, tentukan mall serta posisi lantai/penanda secara manual. Memperbesar peta tidak menambah ketelitian GPS.

Jalankan `npm test` dan `npm run test:browser` untuk pemeriksaan proyek. Pengujian dengan respons tiruan tidak membuktikan akses ion pada akun pengguna, cakupan bangunan, atau ketelitian sensor indoor. Lapisan ion menggunakan token nyata belum diverifikasi pada pekerjaan ini.
