# Navigasi dalam ruangan

Alur utama sekarang menghitung rute dan memberikan instruksi langsung dalam aplikasi. Implementasi yang dapat dicoba menggunakan bangunan fiktif dengan dua lantai. Denah ini tidak mewakili DeliPark atau Sun Plaza, dan tidak boleh dipakai sebagai petunjuk berjalan di kedua mall tersebut.

## Berkas

- `public/data/indoor/demo-plan.js`: lantai, titik, dan ruas koridor latihan.
- `public/js/navigation/route-engine.js`: pencarian jalur, pembobotan, dan instruksi belok.
- `public/js/navigation/indoor-navigator.js`: formulir asal/tujuan, SVG denah, chat, progres manual, simulasi hambatan, dan suara.
- `public/css/indoor-navigation.css`: tampilan komponen.
- `tests/unit/route-engine.test.js`: pemeriksaan algoritme dan penyaringan akses.

Informasi mall dan foto resmi tetap di `public/data/malls.js`. Jangan menggunakan foto atau nama mall sebagai bukti bahwa koordinat pada denah latihan adalah lokasi fasilitas sebenarnya.

## Cara mencoba

Jalankan `npm start`, lalu buka `/aksesin.html`. Coba:

- `dari pintu masuk ke toilet difabel`
- `dari concierge ke kafe L1`
- `dari parkir ke peminjaman kursi roda`

Pilihan asal/tujuan pada formulir setara dengan chat. Titik yang tidak dikenali harus dipilih sendiri; aplikasi tidak menebak dari GPS, nama lantai saja, atau hasil AI.

Penanda berubah setelah tombol **Simulasikan langkah berikutnya** ditekan. Tombol suara hanya membaca instruksi aktif dan tidak mengaktifkan mikrofon. Suara bahasa Indonesia bergantung pada browser/perangkat. Tidak ada pelacakan gerakan otomatis.

## Perhitungan rute

Mesin memakai pencarian jalur berbobot pada graf dua arah. Semua profil mengecualikan tangga, eskalator, ruas tertutup, ruas dengan akses tidak diketahui, dan ruas yang tidak memenuhi preferensi lebar/kemiringan.

| Pilihan | Nilai yang diminimalkan |
| --- | --- |
| Rekomendasi | Jarak dengan penalti koridor sempit, kemiringan, permukaan kasar, dan waktu tunggu. |
| Terpendek | Jumlah panjang ruas yang bisa dilalui. |
| Tercepat | Estimasi waktu bergerak, termasuk waktu tunggu lift. |

Angka kecepatan, lebar minimum 90 cm, dan kemiringan maksimum 6% merupakan **parameter contoh untuk demo**, bukan sertifikasi keselamatan, standar desain resmi, atau jaminan cocok bagi setiap pengguna. Jalur terpendek tetap dapat lebih sempit atau lebih kasar dibanding rekomendasi. Estimasi waktu bukan waktu kedatangan langsung.

Untuk tujuan toilet terdekat, aplikasi menghitung kandidat toilet yang dapat dicapai untuk setiap profil. Menutup ruas berikutnya memicu perhitungan ulang dari titik simulasi yang telah dicapai. Jika semua alternatif terputus, aplikasi menyatakan tidak ada jalur; tidak menyisipkan lintasan baru atau memakai tangga.

Instruksi kiri/kanan dihitung dari arah dua ruas berurutan pada denah. Instruksi pertama memakai penanda tujuan karena orientasi pengguna belum diketahui. Perpindahan lantai menyebut lift dan mengawali ulang arah koridor setelah keluar lift.

## Skema data

Plan berisi `id`, `mode`, `title`, `viewBox`, `floors`, `nodes`, dan `edges`. `mode: "demo"` menandai data buatan. Mesin menolak plan nyata yang belum memiliki `mode: "verified"` dan `verified: true`; penanda ini merupakan status data dari pengelola, bukan hasil verifikasi otomatis oleh mesin.

Node memuat `id`, `label`, `aliases`, `floorId`, `x`, `y`, dan `type`. Alias harus menunjuk satu titik secara tepat; alias ambigu tidak dipilih otomatis.

Edge memuat `id`, `from`, `to`, `distanceM`, `widthCm`, `slopePct`, `kind`, `open`, `accessible`, `surface`, dan `waitSeconds`. Koridor harus berada pada lantai yang sama. Sambungan lift berada pada dua lantai dengan posisi denah yang selaras. Semua ukuran dan kondisi wajib diketahui; nilai kosong atau tidak valid mengecualikan ruas tersebut.

## Menghubungkan mall sebenarnya

Komponen UI saat ini sengaja menggunakan `AksesinDemoPlan`. Untuk mengaktifkan satu mall nyata, diperlukan paket data tersendiri dan pemilihan plan berdasarkan mall, tanpa memakai ulang koordinat demo:

1. Denah berizin yang dikalibrasi dengan ukuran dan orientasi nyata.
2. Titik pintu fasilitas, koridor, percabangan, dan sambungan lift yang telah diperiksa.
3. Lebar lintasan, kemiringan, permukaan, hambatan, status pintu/lift, serta tanggal pemeriksaan setiap ruas.
4. Preferensi akses yang disesuaikan dan diuji dengan pengguna kursi roda.
5. Penentuan titik awal yang dapat dipercaya: pilihan penanda terpetakan, QR di lokasi yang benar, atau sistem posisi indoor yang dikalibrasi. GPS umum/Cesium tidak menjadi koordinat koridor secara otomatis.

Data tersebut perlu divalidasi di lokasi sebelum status `verified` digunakan dan antarmuka beralih dari demo ke navigasi nyata. Fitur perhitungan rute sudah tersedia; pengukuran mall dan integrasi sensor indoor belum tersedia pada versi ini.
