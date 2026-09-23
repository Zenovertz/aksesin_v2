# Data mall dan fasilitas

## Lokasi berkas

- [`public/data/malls.js`](../public/data/malls.js): identitas mall, koordinat area, kontak, fasilitas, status, metadata foto, dan URL sumber.
- [`public/data/floors.js`](../public/data/floors.js): daftar lantai dari direktori resmi dan tempat untuk data denah yang telah diperiksa.
- [`public/js/indoor.js`](../public/js/indoor.js): pemahaman pesan; daftar fasilitas dan lantai diedit di folder data.
- [`public/js/utils.js`](../public/js/utils.js): normalisasi teks, pemeriksaan koordinat, dan perhitungan jarak area mall.
- [`public/js/components/facility-photo.js`](../public/js/components/facility-photo.js): pratinjau foto, dialog perbesaran, tautan sumber, dan tampilan saat gambar tidak tersedia.

Konfigurasi peta terpisah dari data fasilitas. Lihat [panduan Cesium](cesium.md) untuk `public/js/api/cesium-map.js`, `public/css/cesium-map.css`, dan `server/config/cesium.cjs`.

## Cara memperbarui data

1. Periksa sumber pengelola, lalu ubah entri mall/fasilitas yang bersangkutan.
2. Simpan URL asal dan tanggal pemeriksaan. Pertahankan ID seperti `delipark`, `sun-plaza`, `toilet`, dan `gf` agar referensi tetap konsisten.
3. Gunakan `published` hanya untuk informasi yang dicantumkan sumber. Gunakan `unknown` dan `null` untuk detail yang belum diketahui. `published` bukan berarti fasilitas sudah disurvei atau sedang beroperasi.
4. Daftar lantai Sun Plaza saat ini hanya memuat lantai yang ditemukan pada sumber fasilitas; daftar ini bukan seluruh lantai bangunan.
5. Jalankan `npm test` dan `npm run test:browser` setelah memperbarui data yang dipakai aplikasi.

`FLOORPLANS` untuk mall asli masih kosong. Jangan mengisi koordinat pintu, denah, atau jalur mall berdasarkan dugaan. `public/data/indoor/demo-plan.js` adalah bangunan fiktif terpisah untuk mencoba mesin navigasi, dengan label demo yang ditampilkan pada antarmuka. Posisi dan percakapan pengguna tidak disimpan di folder data; keduanya hanya berada di memori halaman.

## Data resmi dan batas arahan

Sumber fasilitas diperiksa pada 12 September 2026; riset direktori indoor dilanjutkan pada 14 September 2026. Data menyimpan tautan asalnya.

- [DeliPark Facilities](https://delipark.com/Facilities): toilet difabel di setiap lantai dan layanan kursi roda melalui concierge GF. Detail lift, parkir difabel, serta akses pintu belum terkonfirmasi pada teks yang diperiksa.
- [DeliPark Map Directory](https://delipark.com/MapDir): pilihan lantai dan direktori resmi. Aplikasi tidak menambahkan titik pintu toilet/lift atau jalur dari gambar yang belum diverifikasi.
- [Sun Plaza — Lippo Malls](https://www.lippomalls.com/mall/Sun-Plaza/facilities): toilet difabel, elevator, akses dari area parkir, parkir difabel UG/L1, dan layanan kursi roda GF Zone C. Label umum seperti “All Areas” tidak diperlakukan sebagai posisi pintu yang tepat.
- [DeliPark Contact Us](https://delipark.com/ContactUs), [alamat Sun Plaza dari pemilik](https://www.landmarkreit.com/sun-plaza.html), dan [lokasi Sun Plaza pada data OSM/Mapy](https://mapy.com/en/?id=18956435&source=osm) digunakan untuk identitas mall dan perkiraan area, bukan pemetaan indoor.

Ketersediaan fasilitas pada situs pengelola tidak menjamin fasilitas beroperasi saat kunjungan. Tidak ada klaim jalur terpendek, paling aman, atau paling ramah kursi roda tanpa data lintasan terverifikasi. Saran pindah lantai menyebut perlunya lift, tetapi tidak mengarahkan pengguna melalui koridor yang tidak diketahui.

## Foto peminjaman kursi roda

Foto pada katalog diperiksa secara visual pada **17 September 2026**. Tanggal `photo.checkedAt` adalah tanggal pemeriksaan, bukan tanggal pengambilan foto. Lokasi layanan bersumber dari keterangan fasilitas pengelola; foto tidak digunakan untuk menyimpulkan koordinat pintu atau jalur menuju loket.

| Mall | Sumber foto | Yang terlihat dan batasnya |
| --- | --- | --- |
| DeliPark | [Galeri Wheel Chair](https://delipark.com/DetilFacilities/getinfo/Wheel_Chair) · [gambar asli](https://delipark.com/cms/upload/images/668f5c6e68817/20260213_698efd59bc84d.JPG) | Dua petugas bersama dua kursi roda di depan meja concierge. Katalog memakai `kind: "location"`. Keterangan layanan menyebut Concierge, GF. |
| Sun Plaza | [Halaman fasilitas resmi](https://www.lippomalls.com/mall/Sun-Plaza/facilities) · [gambar asli](https://websitecms.lippomalls.com/api/images/facility-instances/Wheelchair%20Update_1785139159.webp) | Dua kursi roda bermerek LIPPOMALL di samping penanda peminjaman. Katalog memakai `kind: "service"`: gambar dipublikasikan untuk fasilitas Sun Plaza, tetapi rupa loket GF Zone C belum terkonfirmasi. |

Objek `photo` berada pada entri fasilitas `wheelchair` dan memuat:

| Field | Isi |
| --- | --- |
| `url` | URL HTTPS gambar asli pada server sumber. |
| `alt` | Deskripsi singkat isi gambar untuk pembaca layar. |
| `caption` | Keterangan yang menjelaskan isi dan batas kepastian foto. |
| `sourceUrl` | Halaman resmi yang menerbitkan gambar. |
| `kind` | `location` untuk foto tempat yang dikenali dari sumber; `service` untuk gambar layanan yang belum memastikan bentuk tempatnya. |
| `checkedAt` | Tanggal pemeriksaan sumber dan gambar dalam format `YYYY-MM-DD`. |

Thumbnail DeliPark bertuliskan `WHEELCHAIR` dan `CONCIERGE-LOBBY` adalah ikon, sehingga tidak dipakai sebagai foto lokasi. Foto stok atau gambar buatan tidak menjadi bukti tempat layanan.

Aplikasi memakai URL gambar jarak jauh, tanpa menyalin foto ke `public/assets/images/`. Browser memuat thumbnail saat diperlukan dan gambar besar ketika dibuka. Bila URL hilang atau server gambar menolak permintaan, komponen menampilkan keterangan kegagalan dengan tautan sumber; informasi fasilitas tetap dapat digunakan. Fasilitas tanpa foto menampilkan keterangan belum tersedia. Permintaan gambar menghubungi server pihak ketiga, meskipun aplikasi tidak mengirim GPS atau chat dalam permintaan tersebut.

Saat mengganti foto, buka halaman sumber dan periksa gambarnya kembali. Perbarui `url`, teks alternatif, caption, `kind`, dan tanggal pemeriksaan bersama-sama. Jangan menaikkan status menjadi foto lokasi hanya berdasarkan nama berkas atau nama mall pada listing.
