(function (root) {
  'use strict';
  const M = typeof module === 'object' && module.exports ? require('../data/malls.js') : root.AksesinMalls;
  const F = typeof module === 'object' && module.exports ? require('../data/floors.js') : root.AksesinFloors;
  const U = typeof module === 'object' && module.exports ? require('./utils.js') : root.AksesinUtils;
  const { FLOORS, FLOORPLANS, getFloors, getFloor } = F;
  const empty = () => ({ intent: 'unknown', mallId: null, floorId: null, originLabel: null, facility: null });
  function parseMessage(text, context = {}) {
    if (typeof text !== 'string' || !text.trim() || text.length > 600) return empty();
    let words = U.normalize(text);
    const names = [...new Set([/\bdeli ?park\b/.test(words) && 'delipark', /\bsun ?plaza\b/.test(words) && 'sun-plaza'].filter(Boolean))];
    if (names.length > 1 || /\b(?:bukan|jangan|tidak|gak|nggak|enggak|batal|batalkan|atau)\b/.test(words)) return empty();
    const previous = M.getMall(context?.mallId) ? context.mallId : null;
    const mallId = names[0] || previous;
    const changedMall = names[0] && names[0] !== previous;
    const result = { ...empty(), mallId, floorId: changedMall ? null : getFloor(mallId, context?.floorId)?.id || null, originLabel: changedMall ? null : typeof context?.originLabel === 'string' ? context.originLabel.slice(0, 120) : null };
    if (/^(?:halo|hai|bantuan|help|cara pakai|gps|lokasi gps|cara menentukan lokasi)$/.test(words)) return { ...empty(), intent: 'help' };
    const kinds = [];
    if (/\b(?:toilet|wc|kamar kecil)\b/.test(words)) kinds.push('toilet');
    if (/\b(?:lift|elevator)\b/.test(words)) kinds.push('lift');
    if (/\bparkir\b/.test(words)) kinds.push('parking');
    if (/\b(?:pintu masuk|akses masuk|ramp|entrance)\b/.test(words)) kinds.push('entrance');
    if (/\b(?:pinjam|peminjaman|sewa) kursi roda\b|\bwheelchair\b/.test(words) || /^(?:kursi roda)(?: di (?:deli ?park|sun ?plaza))?$/.test(words)) kinds.push('wheelchair');
    if (kinds.length > 1) return empty();
    result.facility = kinds[0] || null;
    if (/\b(?:rumah|bandara|stasiun|centre point|center point|medan fair)\b/.test(words)) return empty();
    let floorId = null;
    const floorMatch = words.match(/\b((?:lantai |floor )?(?:gf rivapark|ug rivapark|lower ground|ground floor|upper ground|lg|lm|gf|ug|l[1235](?:a)?|delica(?: food court)?)|(?:lantai |floor )[1235](?:a)?|[1235](?:st|nd|rd|th) floor)\b/);
    if (floorMatch) {
      const token = floorMatch[1].replace(/^(?:lantai|floor) /, '');
      floorId = ({ 'lower ground': 'lg', 'ground floor': 'gf', 'upper ground': 'ug', 'gf rivapark': 'gf-rivapark', 'ug rivapark': 'ug-rivapark', '3a': 'l3a', delica: 'delica', 'delica food court': 'delica' })[token] || (/^[1235]/.test(token) ? 'l' + token[0] : token);
      if (!getFloor(mallId, floorId)) return empty();
      result.floorId = floorId;
    } else if (/\b(?:lantai|floor)\s*\d|\bl\d/.test(words)) return empty();
    let origin = null;
    const position = words.match(/(?:^|\b)(?:aku|saya)\s+(?:(?:sedang|sekarang)\s+)?(?:di|dekat)\s+(.+?)(?=\s+(?:mau|ingin|menuju|ke)\b|$)/)
      || words.match(/^dari\s+(.+?)(?=\s+(?:mau|ingin)?\s*(?:ke|menuju)\b|$)/)
      || words.match(/^(?:di|dekat)\s+(.+?)(?=\s+(?:mau|ingin|menuju|ke)\b|$)/);
    if (position) {
      origin = position[1].replace(/\b(?:mall |mal )?(?:deli ?park|sun ?plaza)(?: mall| mal)?\b/g, ' ');
      if (floorMatch) origin = origin.replace(floorMatch[0], ' ');
      origin = origin.replace(/\b(?:lantai|floor)\b/g, ' ').replace(/\s+/g, ' ').replace(/^(?:di|dekat)\s+/, '').trim();
      if (origin && !/\b(?:toilet|lift|elevator|parkir|pinjam|fasilitas|mana)\b/.test(origin)) result.originLabel = origin.slice(0, 120);
      else origin = null;
    }
    // Bare floor updates change the floor without claiming movement was sensed.
    const bareFloor = floorMatch && words.replace(floorMatch[0], '').replace(/\b(?:aku|saya|di|lantai|floor|sekarang|deli ?park|sun ?plaza|mall|mal)\b/g, '').trim() === '';
    if (position || bareFloor) {
      if (floorId && floorId !== context?.floorId && !origin) result.originLabel = null;
      if (origin && !floorId) result.floorId = null;
    }
    if (result.facility && !position) result.floorId = changedMall ? null : getFloor(mallId, context?.floorId)?.id || null;
    if (result.facility) return { ...result, intent: 'indoor' };
    if (position || bareFloor || names.length && /^(?:(?:aku|saya) )?(?:di )?(?:mall |mal )?(?:deli ?park|sun ?plaza)(?: mall| mal)?$/.test(words)) return { ...result, intent: 'position' };
    return empty();
  }
  const api = { FLOORS, FLOORPLANS, getFloors, getFloor, parseMessage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AksesinIndoor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
