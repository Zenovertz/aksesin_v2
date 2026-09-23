# AKSESIN — akses kursi roda di dalam mall

Aplikasi menghitung jalur kursi roda di dalam ruangan: pilih titik awal dan tujuan, bandingkan rekomendasi/terpendek/tercepat, lalu lihat garis jalur serta instruksi langkah demi langkah. Chat memahami contoh “dari pintu masuk ke toilet difabel”. Ada simulasi hambatan, perpindahan lantai lewat lift, dan pembacaan langkah dalam bahasa Indonesia.

**Navigasi saat ini menggunakan denah latihan buatan, bukan denah DeliPark atau Sun Plaza.** Jarak, waktu, kondisi koridor, dan gerakan penanda adalah simulasi yang diberi label. Jangan gunakan petunjuk demo untuk berjalan di mall sebenarnya. Informasi serta foto fasilitas mall asli tetap tersedia dalam bagian referensi terpisah. Pelacakan posisi indoor dan rute mall asli belum terhubung; GPS dan Cesium hanya menunjukkan area bangunan.

Struktur data dan langkah menghubungkan denah yang sudah dipetakan dijelaskan pada [panduan navigasi indoor](docs/indoor-navigation.md).

## Menjalankan

Gunakan Node.js 22 atau lebih baru. Tidak perlu mengunduh paket npm.

```sh
npm start
```

Buka [web lokal](http://127.0.0.1:3000/aksesin.html). Server hanya menerima koneksi loopback dari perangkat yang sama. HTML juga bisa dibuka langsung untuk chat dasar, posisi manual, dan info fasilitas; AI opsional memerlukan server.

Untuk dibuka dari ponsel lain diperlukan hosting Node dengan HTTPS atau reverse proxy yang sesuai. `localhost` pada ponsel menunjuk ke ponsel itu sendiri. Hosting publik belum dilakukan.

## Alur pemakaian

1. Pilih **Titik awal** serta **Tujuan** pada denah latihan, atau ketik **“dari pintu masuk ke toilet difabel”**. Untuk perpindahan lantai, coba **“dari concierge ke kafe L1”**.
2. Tekan **Cari rute dalam ruangan**. Pilih rekomendasi, terpendek, atau tercepat; setiap pilihan memakai batas akses yang sama dan bobot perhitungan berbeda.
3. Lihat garis rute dan instruksi. **Simulasikan langkah berikutnya** memajukan penanda secara manual. Tidak ada sensor atau GPS yang memindahkan penanda demo.
4. **Dengarkan langkah** membacakan instruksi atas permintaan. Mengubah rute atau langkah membatalkan suara sebelumnya.
5. **Simulasikan jalur terhalang** menutup ruas berikutnya dan menghitung ulang dari posisi simulasi terakhir. **Atur ulang simulasi** membuka kembali ruas demo yang ditutup.

Mengubah mall atau memulai percakapan baru menghapus rute demo sebelumnya. Titik yang tidak dikenal tidak digantikan dengan tebakan. Tidak ada tombol yang meminta pengguna menunjukkan kartu kepada petugas sebagai alur navigasi.

Bagian **Info resmi mall & foto fasilitas** berisi referensi mall asli, foto peminjaman kursi roda, direktori, dan catatan lokasi kunjungan. Catatan tersebut terpisah dari posisi pada denah latihan. Peta Cesium berada di bagian **Peta area mall**.

## GPS dan posisi dalam gedung

Tombol **Cek area mall dari lokasi** meminta lokasi perangkat sekali, atas pilihan pengguna. Aplikasi menampilkan akurasi dan hanya menyarankan mall terdekat bila hasil berada cukup dekat. Pengguna harus mengonfirmasi mall sendiri. GPS **tidak** mengisi lantai, toko, koridor, ataupun titik awal indoor.

Hasil di luar Medan atau akurasi lebih buruk dari 150 meter tidak dipakai untuk saran mall. Ada penanganan izin ditolak, timeout, posisi terlalu kasar, serta pembatalan hasil terlambat ketika pengguna memilih mall atau bertanya lewat chat. Tidak ada pelacakan terus-menerus.

[Geolocation browser](https://www.w3.org/TR/geolocation/) menyediakan koordinat geografis dan metadata akurasi, bukan nomor lantai atau lokasi koridor. [GPS.gov](https://www.gps.gov/gps-accuracy-0) menjelaskan pengaruh gedung terhadap akurasi. Navigasi indoor yang benar-benar mengikuti gerakan membutuhkan denah terkalibrasi, lokasi fasilitas dan sambungan antarlantai yang diverifikasi, serta sistem penentuan posisi indoor di lokasi tersebut. Teknologi semacam ini perlu dikalibrasi dan diuji di bangunan; memasang JavaScript saja tidak menyediakan infrastrukturnya.

## Data mall dan fasilitas

Data dipisahkan di `public/data/`. Daftar sumber, arti status, dan cara memperbaruinya ada di [panduan data](docs/data-sources.md).

Foto kecil pada fasilitas peminjaman kursi roda dapat diperbesar. Foto DeliPark memperlihatkan concierge dan kursi roda; gambar Sun Plaza berasal dari halaman fasilitas resminya, tetapi tampilan loket GF Zone C belum terkonfirmasi. Gambar dimuat langsung dari situs sumber, tanpa salinan lokal. Jika gambar gagal dimuat, keterangan dan tautan sumber tetap tersedia.

## Peta Cesium dan konfigurasi

Tekan **Buka peta area** untuk memuat CesiumJS **1.145** dari CDN. Peta dasar Cesium + OpenStreetMap dapat dipakai tanpa token ion. Titik mall menunjukkan perkiraan area bangunan; Cesium tidak menyediakan denah lantai, pelacakan indoor, atau petunjuk belok koridor pada aplikasi ini. Tombol lokasi meminta GPS sekali dan menampilkan perkiraan beserta akurasinya.

Untuk mengaktifkan lapisan Cesium World Terrain dan OSM Buildings, salin `.env.example` menjadi `.env`, isi `CESIUM_ION_ACCESS_TOKEN` dengan token publik khusus aplikasi yang hanya memiliki izin `assets:read`, dan ubah `CESIUM_ENABLE_3D=true`. Batasi allowed URLs serta akses aset di dashboard ion, lalu hentikan dan jalankan kembali `npm start`. Kedua lapisan hanya diminta jika token diisi dan opsi 3D bernilai `true`.

Token Cesium memang diteruskan ke browser melalui `/api/config/maps`; jangan menaruh key rahasia atau token berizin menulis/admin pada konfigurasi itu. `OPENAI_API_KEY` tetap berada di server. Langkah lengkap, struktur modul, dan penanganan kegagalan ada di [panduan Cesium](docs/cesium.md).

## Chat dasar dan AI opsional

Label **Asisten lokal** berarti parser percakapan lokal, bukan model AI. Chat dasar langsung tersedia tanpa API key. Untuk membantu memahami kalimat yang belum dikenali:

1. Salin `.env.example` menjadi `.env`.
2. Isi `OPENAI_API_KEY` dan, bila perlu, `OPENAI_MODEL` (default `gpt-4.1-mini`).
3. Jalankan ulang `npm start`. Label **AI diaktifkan** menandakan key dikonfigurasi; akses model baru diketahui saat permintaan dilakukan.

Key tetap di server, dan `.env` diabaikan Git. Integrasi memakai [OpenAI Responses API dengan Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). AI hanya mengekstrak maksud, ID mall, lantai, penanda yang disebut pengguna, dan jenis fasilitas. AI tidak menentukan posisi fisik pengguna atau menciptakan koridor. Rute dihitung secara deterministik dari graf denah oleh aplikasi; informasi mall asli berasal dari katalog bersumber. Jika AI gagal, chat dasar dan tombol pilihan tetap tersedia. Tidak ada panggilan OpenAI berbayar dalam pengujian; pemakaian dengan key milikmu mengikuti biaya akun API.

## Privasi dan keamanan lokal

Posisi yang diketik, chat, dan koordinat GPS hanya berada di memori halaman; tidak ada penyimpanan baru ke localStorage. Data prototype lama tidak dihapus. GPS tidak dikirim ke backend atau AI oleh aplikasi. Jika AI dipakai, pesan beserta konteks mall/lantai/penanda yang diketik dikirim ke layanan AI. Jangan mengetik informasi pribadi yang tidak ingin dikirim. Halaman/sumber denah resmi dibuka dari pengelola sesuai pilihan pengguna.

Foto fasilitas dimuat dari server pengelola. Membuka peta memicu permintaan ke CDN Cesium dan server tile OpenStreetMap; lapisan 3D yang diaktifkan juga menghubungi Cesium ion. Penyedia tersebut menerima permintaan jaringan browser, dan permintaan tile dapat menunjukkan area peta yang dilihat. Menampilkan lokasi perangkat pada peta tidak membuat koordinat tersebut dikirim ke layanan AI.

Server tidak mencatat percakapan atau koordinat ke disk. Endpoint memeriksa origin, host, ukuran input, timeout, serta nilai konteks. Hanya berkas frontend yang diizinkan yang disajikan; `.env`, `.git`, dan sumber backend tidak dapat diminta melalui web. Server bawaan adalah server pengembangan lokal; hosting publik memerlukan kontrol akses dan pembatasan penggunaan yang sesuai.

## Struktur proyek

```text
aksesin-main/
├── public/
│   ├── aksesin.html          # Halaman utama
│   ├── css/
│   │   ├── aksesin.css       # Tampilan dan responsivitas
│   │   ├── cesium-map.css    # Peta area dan foto fasilitas
│   │   └── indoor-navigation.css # Denah dan panduan langkah
│   ├── js/
│   │   ├── aksesin.js        # Chat, posisi, dan interaksi halaman
│   │   ├── indoor.js         # Parser percakapan indoor
│   │   ├── utils.js          # Utilitas teks dan koordinat
│   │   ├── api/
│   │   │   └── cesium-map.js # CDN, konfigurasi, dan tampilan Cesium
│   │   ├── navigation/
│   │   │   ├── route-engine.js # Perhitungan graf dan petunjuk belok
│   │   │   └── indoor-navigator.js # Denah, pilihan rute, progres dan suara
│   │   └── components/
│   │       └── facility-photo.js # Foto kecil, dialog, dan fallback
│   ├── data/
│   │   ├── malls.js          # Mall, fasilitas, metadata foto, dan sumber
│   │   ├── floors.js         # Lantai resmi (belum ada graf mall asli)
│   │   └── indoor/demo-plan.js # Bangunan fiktif untuk latihan
│   └── assets/images/        # Aset gambar yang tersedia
├── server/
│   ├── index.cjs             # Server, API konfigurasi, dan AI opsional
│   └── config/cesium.cjs     # Konfigurasi Cesium publik dari environment
├── tests/
│   ├── unit/                # Data, parser, dan utilitas
│   ├── server/              # API dan keamanan berkas
│   └── browser/smoke.cjs     # Alur pengguna dan tampilan
├── docs/
│   ├── data-sources.md       # Sumber dan panduan mengedit data
│   ├── cesium.md             # Setup peta, token, dan batas kemampuan
│   └── indoor-navigation.md # Skema graf, bobot rute, dan batas demo
├── .env.example             # Contoh konfigurasi
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

Hanya isi `public/` yang disajikan oleh server. `.env` tetap diletakkan di akar proyek, sejajar dengan `package.json`. Alamat web tetap `/aksesin.html` meskipun berkasnya berada di `public/aksesin.html`. Untuk membuka HTML langsung, gunakan berkas di folder `public/`.

## Pengujian

```sh
npm test
npm run test:browser
```

Jika Chromium tidak ditemukan otomatis:

```sh
BROWSER_PATH="/path/to/chromium" npm run test:browser
```

Tes browser memakai geolokasi dan respons AI tiruan, tidak mengambil posisi pengguna. Pengujian mencakup pergantian mall/lantai, chat, denah demo dan panduan langkah, batas GPS, respons terlambat, dan tampilan ponsel. Sensor fisik di dalam mall, AI dengan key nyata, serta lapisan ion dengan token nyata belum diverifikasi. Uji rute jalan versi sebelumnya tidak berlaku sebagai bukti navigasi indoor.
