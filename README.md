# AKSESIN

Prototype pencarian **segmen jalur akses**, berdasarkan kebutuhan pengguna dan kondisi komunitas. Buka `aksesin.html` di browser. Semua aset tersedia lokal; tidak perlu memasang paket aplikasi.

## Alur penggunaan

1. Pilih profil akses, area, dan lantai. Tambahkan kendala bila diperlukan.
2. Lihat jalur yang sesuai, gambar, kondisi, fitur pendukung, dan rating. Nomor pada peta membuka informasi segmen jalur, bukan navigasi ke ruangan.
3. Simpan jalur untuk dibuka kembali.
4. Gunakan **Bagikan kondisi jalur** atau **Update kondisi** untuk menambahkan rating, kondisi, komentar, dan foto opsional.

Kata kendala yang dikenali antara lain tangga, sempit, licin, gelap, pemandu, dan penanda visual. Kebutuhan yang dikenali tampil sebagai label di bawah formulir. Catatan lain tetap tersimpan tanpa dianggap sebagai diagnosis atau jaminan kecocokan jalur.

Setiap laporan langsung memperbarui kondisi, rating rata-rata, waktu pembaruan, dan forum. Laporan terbaru menentukan kondisi; jalur yang dilaporkan terblokir keluar dari rekomendasi. Laporan baru bahwa jalur kembali dapat digunakan akan mengembalikannya sesuai profil akses.

## Penyimpanan sementara

Preferensi, jalur tersimpan, laporan/foto, dan draf disimpan dengan `localStorage` pada browser dan alamat halaman yang sama. Data tetap tersedia setelah pemuatan ulang atau browser ditutup, sampai penyimpanan browser dihapus. Jika browser menolak penyimpanan atau kuotanya penuh, indikator memperlihatkan kegagalan dan data tetap tersedia di halaman yang masih terbuka. **Unduh data tersimpan** menyediakan salinan JSON.

Pembaruan antar-tab didukung pada origin/alamat situs yang sama. Untuk pengujian antar-tab yang konsisten, layani folder ini dengan server lokal, misalnya `python -m http.server 8000`, lalu buka `http://localhost:8000/aksesin.html`. Kebijakan penyimpanan `file://` dapat berbeda antar-browser.

Forum ini merupakan prototype lokal: laporan belum dikirim ke layanan bersama dan belum tersinkron antarperangkat. Penggunaan oleh banyak pengguna lintas perangkat membutuhkan backend. Komentar bertanda **Contoh** adalah data demonstrasi, bukan laporan terverifikasi.

Foto unggahan dibatasi 5 MB, kemudian diperkecil di browser sebelum disimpan. Riwayat lokal menyimpan paling banyak 150 laporan terbaru. Nama lokasi, fitur, dan kondisi awal adalah data contoh; denah belum diukur sebagai denah aksesibilitas lokasi nyata.

## Struktur

- `aksesin.html`: struktur halaman dan formulir.
- `aksesin.css`: tampilan responsif.
- `aksesin.js`: antarmuka, peta segmen, komentar, foto, favorit, dan sinkronisasi antar-tab.
- `aksesin-data.js`: katalog jalur, penyaringan kebutuhan, agregasi laporan, dan penyimpanan.
- `aksesin-routing.js`: geometri denah yang digunakan untuk memvalidasi segmen terhadap tembok. Navigasi ke ruangan tidak digunakan oleh antarmuka.
- `assets/`: tiga gambar ilustrasi lokal.

## Verifikasi

Jalankan `node --test tests/access-model.test.js tests/routing.test.js` untuk menguji rekomendasi, kondisi, penyimpanan, dan geometri. `node tests/browser-smoke.cjs` memeriksa alur browser menggunakan Chrome atau Edge yang terpasang. Tidak memerlukan pustaka pengujian tambahan. Gunakan Node 22 atau lebih baru untuk pengujian browser.

## Gambar ilustrasi

`assets/ramp.png`, `assets/tactile.png`, dan `assets/corridor.png` dibuat dengan **built-in ImageGen**. Prompt menggunakan fotografi arsitektur natural pada kampus tropis Indonesia fiktif, cahaya lembut, palet sage/teal/krem, tanpa teks, logo, atau orang. Variasi: ramp landai dengan pegangan tangan; jalur ubin pemandu kuning yang tidak terhalang; koridor lebar dan rata dengan penanda kontras. Gambar diberi label **Ilustrasi jalur** dan tidak mewakili dokumentasi lokasi asli. Foto laporan pengguna ditandai secara terpisah.
