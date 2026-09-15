(function (root) {
  "use strict";

  const DELIPARK_FACILITIES = "https://delipark.com/Facilities";
  const SUN_FACILITIES = "https://www.lippomalls.com/mall/Sun-Plaza/facilities";
  const MALLS = [
    {
      id: "delipark", name: "DeliPark Mall", shortName: "DeliPark",
      address: "Jl. Putri Hijau / Guru Patimpus No. 01 Blok OPQ, Kesawan, Medan Barat, Medan 20111",
      addressSource: "https://delipark.com/ContactUs",
      lat: 3.5941961611060425, lon: 98.67380588003581,
      coordinatesSource: "https://delipark.com/ContactUs",
      coordinatesLabel: "Perkiraan titik mal dari peta resmi; pintu masuk aksesibel belum dipetakan.",
      website: "https://delipark.com/", phone: "(061) 888 12888", phoneHref: "tel:+626188812888",
      directoryUrl: "https://delipark.com/MapDir", checkedAt: "2026-09-12",
      facilities: [
        { id: "toilet", label: "Toilet difabel", status: "published", location: "Setiap lantai",
          detail: "Pengelola mencantumkan toilet difabel di setiap lantai. Titik toilet dan kondisi hari ini belum diverifikasi.", sourceUrl: DELIPARK_FACILITIES },
        { id: "lift", label: "Lift", status: "unknown", location: null,
          detail: "Lokasi dan spesifikasi lift untuk kursi roda belum terkonfirmasi dari teks sumber yang diperiksa. Tanyakan kepada concierge.", sourceUrl: DELIPARK_FACILITIES },
        { id: "entrance", label: "Akses masuk kursi roda", status: "unknown", location: null,
          detail: "Pintu masuk tanpa anak tangga, lebar akses, dan kemiringan ramp belum terkonfirmasi dari sumber yang diperiksa. Hubungi concierge.", sourceUrl: DELIPARK_FACILITIES },
        { id: "parking", label: "Parkir difabel", status: "unknown", location: null,
          detail: "Lokasi petak parkir difabel dan jalur menuju pintu masuk belum terkonfirmasi dari sumber yang diperiksa.", sourceUrl: DELIPARK_FACILITIES },
        { id: "wheelchair", label: "Peminjaman kursi roda", status: "published", location: "Concierge, GF",
          detail: "Kursi roda tersedia melalui concierge lantai GF. Hubungi pengelola untuk memastikan stok dan ketentuan peminjaman.", sourceUrl: DELIPARK_FACILITIES }
      ]
    },
    {
      id: "sun-plaza", name: "Sun Plaza", shortName: "Sun Plaza",
      address: "Jl. Haji Zainul Arifin No. 7, Madras Hulu, Medan Polonia, Medan",
      addressSource: "https://www.landmarkreit.com/sun-plaza.html",
      lat: 3.5822608, lon: 98.6719100,
      coordinatesSource: "https://mapy.com/en/?id=18956435&source=osm",
      coordinatesLabel: "Perkiraan titik mal dari data peta OpenStreetMap di Mapy; pintu masuk aksesibel belum dipetakan.",
      website: "https://www.lippomalls.com/mall/sun-plaza", phone: null, phoneHref: null,
      directoryUrl: SUN_FACILITIES, checkedAt: "2026-09-12",
      // Location labels below are transcribed from the official directory's
      // facility links. They are not surveyed positions or live status reports.
      facilities: [
        { id: "toilet", label: "Toilet difabel", status: "published", location: "All Toilet",
          detail: "Daftar resmi mencantumkan toilet difabel. Titik pintu, ukuran ruang, dan kondisi hari ini belum diverifikasi.", sourceUrl: SUN_FACILITIES },
        { id: "lift", label: "Lift", status: "published", location: "All Areas",
          detail: "Pengelola mencantumkan elevator. Lokasi pintu lift yang paling dekat dan kondisi operasinya perlu ditanyakan kepada petugas.", sourceUrl: SUN_FACILITIES },
        { id: "entrance", label: "Akses masuk kursi roda", status: "published", location: "All Car Parks",
          detail: "Pengelola mencantumkan akses difabel di area parkir. Pintu masuk yang tepat, lebar lintasan, dan kemiringan ramp belum disurvei.", sourceUrl: SUN_FACILITIES },
        { id: "parking", label: "Parkir difabel", status: "published", location: "UG & L1",
          detail: "Tautan fasilitas resmi mencantumkan parkir difabel di UG dan L1. Ketersediaan petak saat kedatangan belum diketahui.", sourceUrl: SUN_FACILITIES },
        { id: "wheelchair", label: "Peminjaman kursi roda", status: "published", location: "GF (Zone C) Floor",
          detail: "Fasilitas kursi roda tercantum di GF, Zone C. Tanyakan stok dan ketentuan peminjaman kepada customer service.", sourceUrl: SUN_FACILITIES }
      ]
    }
  ];

  function getMall(id) { return MALLS.find(mall => mall.id === id) || null; }

  const api = { MALLS, getMall };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AksesinMalls = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
