# Data mall dan fasilitas

## Lokasi berkas

- [`public/data/malls.js`](../public/data/malls.js): identitas mall, koordinat area, kontak, fasilitas, status, dan URL sumber.
- [`public/data/floors.js`](../public/data/floors.js): daftar lantai dari direktori resmi dan tempat untuk data denah yang telah diperiksa.
- [`public/js/indoor.js`](../public/js/indoor.js): pemahaman pesan; daftar fasilitas dan lantai diedit di folder data.
- [`public/js/utils.js`](../public/js/utils.js): normalisasi teks, pemeriksaan koordinat, dan perhitungan jarak area mall.

## Cara memperbarui data

1. Periksa sumber pengelola, lalu ubah entri mall/fasilitas yang bersangkutan.
2. Simpan URL asal dan tanggal pemeriksaan. Pertahankan ID seperti `delipark`, `sun-plaza`, `toilet`, dan `gf` agar referensi tetap konsisten.
3. Gunakan `published` hanya untuk informasi yang dicantumkan sumber. Gunakan `unknown` dan `null` untuk detail yang belum diketahui. `published` bukan berarti fasilitas sudah disurvei atau sedang beroperasi.
4. Daftar lantai Sun Plaza saat ini hanya memuat lantai yang ditemukan pada sumber fasilitas; daftar ini bukan seluruh lantai bangunan.
5. Jalankan `npm test` dan `npm run test:browser` setelah memperbarui data yang dipakai aplikasi.

`FLOORPLANS` masih kosong. Jangan mengisi koordinat pintu, denah, atau jalur berdasarkan dugaan. Posisi dan percakapan pengguna tidak disimpan di folder data; keduanya hanya berada di memori halaman.

## Data resmi dan batas arahan

Sumber fasilitas diperiksa pada 12 September 2026; riset direktori indoor dilanjutkan pada 14 September 2026. Data menyimpan tautan asalnya.

- [DeliPark Facilities](https://delipark.com/Facilities): toilet difabel di setiap lantai dan layanan kursi roda melalui concierge GF. Detail lift, parkir difabel, serta akses pintu belum terkonfirmasi pada teks yang diperiksa.
- [DeliPark Map Directory](https://delipark.com/MapDir): pilihan lantai dan direktori resmi. Aplikasi tidak menambahkan titik pintu toilet/lift atau jalur dari gambar yang belum diverifikasi.
- [Sun Plaza — Lippo Malls](https://www.lippomalls.com/mall/Sun-Plaza/facilities): toilet difabel, elevator, akses dari area parkir, parkir difabel UG/L1, dan layanan kursi roda GF Zone C. Label umum seperti “All Areas” tidak diperlakukan sebagai posisi pintu yang tepat.
- [DeliPark Contact Us](https://delipark.com/ContactUs), [alamat Sun Plaza dari pemilik](https://www.landmarkreit.com/sun-plaza.html), dan [lokasi Sun Plaza pada data OSM/Mapy](https://mapy.com/en/?id=18956435&source=osm) digunakan untuk identitas mall dan perkiraan area, bukan pemetaan indoor.

Ketersediaan fasilitas pada situs pengelola tidak menjamin fasilitas beroperasi saat kunjungan. Tidak ada klaim jalur terpendek, paling aman, atau paling ramah kursi roda tanpa data lintasan terverifikasi. Saran pindah lantai menyebut perlunya lift, tetapi tidak mengarahkan pengguna melalui koridor yang tidak diketahui.
