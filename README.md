# AKSESIN — akses kursi roda di dalam mall

Web ini berfokus pada **fasilitas di dalam DeliPark dan Sun Plaza Medan**. Pengguna menentukan mall, lantai, dan penanda terdekat, lalu bertanya lewat chat tentang toilet difabel, lift, parkir, pintu masuk, atau peminjaman kursi roda. Hasil menampilkan informasi pengelola dan kartu bantuan yang bisa ditunjukkan kepada petugas.

**Pelacakan posisi indoor dan petunjuk belok koridor belum tersedia.** Aplikasi tidak mengubah GPS menjadi titik lantai, menggambar koridor rekaan, atau menghitung rute antarmall. Endpoint rute jalan versi sebelumnya sudah dinonaktifkan.

## Menjalankan

Gunakan Node.js 22 atau lebih baru. Tidak perlu mengunduh paket npm.

```sh
npm start
```

Buka [web lokal](http://127.0.0.1:3000/aksesin.html). Server hanya menerima koneksi loopback dari perangkat yang sama. HTML juga bisa dibuka langsung untuk chat dasar, posisi manual, dan info fasilitas; AI opsional memerlukan server.

Untuk dibuka dari ponsel lain diperlukan hosting Node dengan HTTPS atau reverse proxy yang sesuai. `localhost` pada ponsel menunjuk ke ponsel itu sendiri. Hosting publik belum dilakukan.

## Alur pemakaian

1. Pilih mall tempat kamu berada.
2. Isi **lantai saat ini** dan/atau **toko atau penanda terdekat**, lalu tekan **Pakai posisi ini**. Penanda adalah keterangan pengguna, bukan tempat yang sudah disurvei aplikasi.
3. Ketik, misalnya, **“Aku di GF Delipark, mau ke toilet difabel”**, **“Lift di Sun Plaza”**, atau **“Peminjaman kursi roda”**. Bisa juga memakai tombol fasilitas.
4. Baca lokasi yang memang dicantumkan pengelola. Direktori lantai hanya untuk referensi; mengganti lantai yang sedang dilihat tidak mengganti posisi awalmu.
5. Jika titik pintu/jalur belum tersedia, gunakan **Tampilkan bantuan ke petugas**. Kartu hanya tampil di layar; tidak mengirim pesan atau memanggil petugas.

Mengubah mall menghapus posisi lantai dan penanda sebelumnya. Mengedit formulir membatalkan posisi yang lama sampai kamu mengonfirmasi lagi. Posisi yang sudah lebih dari 15 menit perlu dikonfirmasi ulang ketika dipakai. Mulai percakapan baru menghapus chat dan posisi dari sesi halaman.

## GPS dan posisi dalam gedung

Tombol **Cek area mall dari lokasi** meminta lokasi perangkat sekali, atas pilihan pengguna. Aplikasi menampilkan akurasi dan hanya menyarankan mall terdekat bila hasil berada cukup dekat. Pengguna harus mengonfirmasi mall sendiri. GPS **tidak** mengisi lantai, toko, koridor, ataupun titik awal indoor.

Hasil di luar Medan atau akurasi lebih buruk dari 150 meter tidak dipakai untuk saran mall. Ada penanganan izin ditolak, timeout, posisi terlalu kasar, serta pembatalan hasil terlambat ketika pengguna memilih mall atau bertanya lewat chat. Tidak ada pelacakan terus-menerus.

[Geolocation browser](https://www.w3.org/TR/geolocation/) menyediakan koordinat geografis dan metadata akurasi, bukan nomor lantai atau lokasi koridor. [GPS.gov](https://www.gps.gov/gps-accuracy-0) menjelaskan pengaruh gedung terhadap akurasi. Navigasi indoor yang benar-benar mengikuti gerakan membutuhkan denah terkalibrasi, lokasi fasilitas dan sambungan antarlantai yang diverifikasi, serta sistem penentuan posisi indoor di lokasi tersebut. Teknologi semacam ini perlu dikalibrasi dan diuji di bangunan; memasang JavaScript saja tidak menyediakan infrastrukturnya.

## Data mall dan fasilitas

Data dipisahkan di `public/data/`. Daftar sumber, arti status, dan cara memperbaruinya ada di [panduan data](docs/data-sources.md).

## Chat dasar dan AI opsional

Label **Asisten lokal** berarti parser percakapan lokal, bukan model AI. Chat dasar langsung tersedia tanpa API key. Untuk membantu memahami kalimat yang belum dikenali:

1. Salin `.env.example` menjadi `.env`.
2. Isi `OPENAI_API_KEY` dan, bila perlu, `OPENAI_MODEL` (default `gpt-4.1-mini`).
3. Jalankan ulang `npm start`. Label **AI diaktifkan** menandakan key dikonfigurasi; akses model baru diketahui saat permintaan dilakukan.

Key tetap di server, dan `.env` diabaikan Git. Integrasi memakai [OpenAI Responses API dengan Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). AI hanya mengekstrak maksud, ID mall, lantai, penanda yang disebut pengguna, dan jenis fasilitas. AI tidak menentukan posisi fisik pengguna atau membuat rute. Jawaban informasi tetap dirangkai dari katalog bersumber. Jika AI gagal, chat dasar dan tombol pilihan tetap tersedia. Tidak ada panggilan OpenAI berbayar dalam pengujian; pemakaian dengan key milikmu mengikuti biaya akun API.

## Privasi dan keamanan lokal

Posisi yang diketik, chat, dan koordinat GPS hanya berada di memori halaman; tidak ada penyimpanan baru ke localStorage. Data prototype lama tidak dihapus. GPS tidak dikirim ke backend oleh aplikasi. Jika AI dipakai, pesan beserta konteks mall/lantai/penanda yang diketik dikirim ke layanan AI. Jangan mengetik informasi pribadi yang tidak ingin dikirim. Halaman/sumber denah resmi dibuka dari pengelola sesuai pilihan pengguna.

Server tidak mencatat percakapan atau koordinat ke disk. Endpoint memeriksa origin, host, ukuran input, timeout, serta nilai konteks. Hanya berkas frontend yang diizinkan yang disajikan; `.env`, `.git`, dan sumber backend tidak dapat diminta melalui web. Server bawaan adalah server pengembangan lokal; hosting publik memerlukan kontrol akses dan pembatasan penggunaan yang sesuai.

## Struktur proyek

```text
aksesin-main/
├── public/
│   ├── aksesin.html          # Halaman utama
│   ├── css/aksesin.css       # Tampilan dan responsivitas
│   ├── js/
│   │   ├── aksesin.js        # Chat, posisi, dan interaksi halaman
│   │   ├── indoor.js         # Parser percakapan indoor
│   │   └── utils.js          # Utilitas teks dan koordinat
│   ├── data/
│   │   ├── malls.js          # Mall, fasilitas, dan sumber
│   │   └── floors.js         # Lantai dan data denah
│   └── assets/images/        # Aset gambar yang tersedia
├── server/index.cjs          # Server dan AI opsional
├── tests/
│   ├── unit/                # Data, parser, dan utilitas
│   ├── server/              # API dan keamanan berkas
│   └── browser/smoke.cjs     # Alur pengguna dan tampilan
├── docs/data-sources.md      # Sumber dan panduan mengedit data
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

Tes browser memakai geolokasi dan respons AI tiruan, tidak mengambil posisi pengguna. Pengujian mencakup pergantian mall/lantai, chat, bantuan petugas, batas GPS, respons terlambat, dan tampilan ponsel. Sensor fisik di dalam mall dan AI dengan key nyata belum diuji. Uji rute jalan versi sebelumnya tidak berlaku sebagai bukti navigasi indoor.
