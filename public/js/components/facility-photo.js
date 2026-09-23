(function () {
  'use strict';

  const dialogBindings = new WeakMap();
  const text = value => typeof value === 'string' ? value.trim() : '';

  function safeHttps(value) {
    if (!text(value)) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content) node.textContent = content;
    return node;
  }

  function placeholder(message = 'Foto belum tersedia') {
    return element('div', 'facilityPhotoPlaceholder', message);
  }

  function officialLink(url) {
    if (!url) return null;
    const link = element('a', '', 'Sumber resmi ↗');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function getDialog() {
    const dialog = document.getElementById('facilityPhotoDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return null;
    if (dialogBindings.has(dialog)) return dialogBindings.get(dialog);

    const image = document.getElementById('facilityPhotoLarge');
    const caption = document.getElementById('facilityPhotoCaption');
    const source = document.getElementById('facilityPhotoSource');
    const closeButton = document.getElementById('closeFacilityPhoto');
    if (!image || !caption || !source || !closeButton) return null;

    const binding = { dialog, image, caption, source, active: null };
    dialogBindings.set(dialog, binding);
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      binding.active = null;
      image.hidden = true;
      image.removeAttribute('src');
      image.alt = '';
    });
    image.addEventListener('error', () => {
      if (!binding.active || !dialog.open) return;
      image.hidden = true;
      caption.textContent = `Foto tidak dapat dimuat. ${binding.active.caption}${binding.active.source ? ' Buka sumber resmi untuk melihat informasi layanan.' : ''}`;
    });
    image.addEventListener('load', () => {
      if (!binding.active || !dialog.open) return;
      image.hidden = false;
      caption.textContent = binding.active.caption;
    });
    return binding;
  }

  function openPhoto(photo) {
    const binding = getDialog();
    if (!binding) return false;
    const { dialog, image, caption, source } = binding;
    binding.active = photo;
    image.alt = photo.alt;
    image.hidden = false;
    image.referrerPolicy = 'no-referrer';
    caption.textContent = photo.caption;
    source.hidden = !photo.source;
    source.textContent = photo.source ? 'Lihat sumber foto resmi ↗' : '';
    source.removeAttribute('href');
    if (photo.source) {
      source.href = photo.source;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
    }
    try {
      if (!dialog.open) dialog.showModal();
      image.src = photo.url;
      return true;
    } catch {
      binding.active = null;
      image.hidden = true;
      image.removeAttribute('src');
      return false;
    }
  }

  function create(item = {}, mall = {}) {
    const photo = item && typeof item.photo === 'object' && item.photo !== null ? item.photo : null;
    const imageUrl = safeHttps(photo?.url);
    const sourceUrl = safeHttps(photo?.sourceUrl) || safeHttps(item?.sourceUrl) || safeHttps(mall?.website);
    const mallName = text(mall?.name) || text(mall?.shortName);
    const label = text(item?.label) || 'layanan kursi roda';
    const card = element('div', 'facilityPhoto');
    const copy = element('div', 'facilityPhotoCopy');
    const title = element('strong', '', imageUrl ? 'Foto layanan' : 'Foto belum tersedia');
    const description = element('p');
    const source = officialLink(sourceUrl);
    copy.append(title, description);

    if (!imageUrl) {
      description.textContent = text(item?.photoNote) || 'Foto tempat layanan belum tersedia dari sumber resmi.';
      if (source) copy.append(source);
      card.append(placeholder(), copy);
      return card;
    }

    const kind = photo.kind === 'location' ? 'location' : 'service';
    const caption = text(photo.caption) || text(photo.alt) || `Foto ${label}`;
    const photoDetails = {
      url: imageUrl,
      source: sourceUrl,
      alt: text(photo.alt) || `${label}${mallName ? ` di ${mallName}` : ''}`,
      caption: `${caption}${mallName ? ` — ${mallName}` : ''}`
    };
    title.textContent = kind === 'location' ? 'Foto tempat layanan' : 'Foto layanan';
    description.textContent = photoDetails.caption;
    const badge = element('span', 'facilityPhotoBadge', kind === 'location' ? 'Foto lokasi resmi' : 'Foto layanan resmi');
    copy.append(badge);
    if (source) copy.append(source);

    const button = element('button', 'facilityPhotoButton');
    button.type = 'button';
    button.setAttribute('aria-label', `Perbesar foto ${label}${mallName ? ` di ${mallName}` : ''}`);
    button.setAttribute('aria-haspopup', 'dialog');
    const image = element('img', 'facilityPhotoImage');
    image.width = 96;
    image.height = 72;
    image.alt = photoDetails.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      button.replaceWith(placeholder('Foto tidak dapat dimuat'));
      title.textContent = 'Foto tidak dapat dimuat';
      description.textContent = 'Pratinjau foto belum dapat ditampilkan. Buka sumber resmi untuk melihat informasi layanan.';
      badge.remove();
    }, { once: true });
    button.addEventListener('click', () => {
      if (!openPhoto(photoDetails)) {
        description.textContent = 'Pratinjau foto belum dapat dibuka. Gunakan tautan sumber resmi untuk melihat informasi layanan.';
      }
    });
    button.append(image);
    card.append(button, copy);
    image.src = imageUrl;
    return card;
  }

  globalThis.AksesinFacilityPhoto = Object.freeze({ create });
})();
