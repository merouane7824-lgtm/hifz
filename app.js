/* Hifz — suivi de mémorisation du Coran. Tout est stocké sur l'appareil (localStorage). */
(function () {
  'use strict';

  // ---------- Données de référence ----------
  var SOURATES = window.HIFZ_DATA.sourates.map(function (s) {
    return { n: s[0], nom: s[1], arabe: s[2], versets: s[3], juz: s[4] };
  });
  var JUZ = window.HIFZ_DATA.juz.map(function (j) {
    return { juz: j[0], nom: j[1], ds: j[2], dv: j[3], fs: j[4], fv: j[5] };
  });
  var PAR_N = new Map(SOURATES.map(function (s) { return [s.n, s]; }));
  var CLE = 'hifz.v1';
  var CLE_CACHE = 'hifz.cache.v1';
  var RECENT = 20;
  var RECITATEURS = [
    ['ar.husary', 'Al-Husary'],
    ['ar.husarymujawwad', 'Al-Husary (mujawwad)'],
    ['ar.alafasy', 'Mishary Alafasy'],
    ['ar.abdulsamad', 'Abdul Basit Abdul Samad'],
    ['ar.mahermuaiqly', 'Maher Al-Muaiqly']
  ];
  var REPETITIONS = [1, 3, 5, 10];
  var URL_APP = location.href.split('#')[0].split('?')[0];

  // ---------- Outils ----------
  var $ = function (s) { return document.querySelector(s); };
  var nf = new Intl.NumberFormat('fr-FR');
  var nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  var fJourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var fJour = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  var fDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  var fMois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function entier(v, min, max, defaut) {
    var x = Math.round(Number(v));
    if (!isFinite(x)) return defaut;
    return Math.max(min, Math.min(max, x));
  }
  function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? plusieurs : un); }
  function chiffresArabes(n) { return String(n).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  function libVersets(du, au) {
    if (du === au) return 'Verset ' + du;
    if (au === du + 1) return 'Versets ' + du + ' et ' + au;
    return 'Versets ' + du + ' à ' + au;
  }

  // ---------- Dates (jour local) ----------
  function aujourdhui() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function versUTC(iso) { var p = String(iso).split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function ajouterJours(iso, n) { return new Date(versUTC(iso) + n * 86400000).toISOString().slice(0, 10); }
  function ecartJours(de, a) { return Math.round((versUTC(a) - versUTC(de)) / 86400000); }
  function enDate(iso) { return new Date(versUTC(iso)); }
  // Durée calendaire entre aujourd'hui et aujourd'hui + n jours, en années, mois et jours.
  function duree(nJours) {
    var d0 = aujourdhui();
    var d1 = ajouterJours(d0, nJours);
    var a0 = d0.split('-').map(Number);
    var a1 = d1.split('-').map(Number);
    var ans = a1[0] - a0[0];
    var mois = a1[1] - a0[1];
    var jours = a1[2] - a0[2];
    if (jours < 0) {
      mois -= 1;
      jours += new Date(Date.UTC(a1[0], a1[1] - 1, 0)).getUTCDate();
    }
    if (mois < 0) { ans -= 1; mois += 12; }
    return { ans: ans, mois: mois, jours: jours, fin: d1 };
  }
  function texteDuree(d) {
    var parts = [];
    if (d.ans) parts.push(pluriel(d.ans, 'an', 'ans'));
    if (d.mois) parts.push(d.mois + ' mois');
    if (d.jours) parts.push(pluriel(d.jours, 'jour', 'jours'));
    if (!parts.length) return 'aujourd’hui';
    if (parts.length === 1) return parts[0];
    return parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1];
  }

  // ---------- État ----------
  function etatInitial() {
    var sourates = {};
    SOURATES.forEach(function (s) { if (s.n >= 84) sourates[s.n] = { appris: s.versets }; });
    sourates[83] = { appris: 17 };
    return {
      v: 1, objectif: 2, cycle: 7, theme: 'auto', recitateur: 'ar.husary', traduction: true, tajwid: true,
      repetitions: 3, widget: false, debut: aujourdhui(), sourates: sourates, jours: {}
    };
  }
  function normaliser(o) {
    var base = etatInitial();
    if (!o || typeof o !== 'object') return base;
    var r = Object.assign({}, base, o);
    r.sourates = o.sourates && typeof o.sourates === 'object' ? o.sourates : base.sourates;
    r.jours = o.jours && typeof o.jours === 'object' ? o.jours : {};
    r.objectif = entier(r.objectif, 1, 30, 2);
    r.cycle = entier(r.cycle, 3, 60, 7);
    if (['auto', 'light', 'dark'].indexOf(r.theme) < 0) r.theme = 'auto';
    if (!RECITATEURS.some(function (x) { return x[0] === r.recitateur; })) r.recitateur = 'ar.husary';
    if (REPETITIONS.indexOf(r.repetitions) < 0) r.repetitions = 3;
    r.traduction = r.traduction !== false;
    r.tajwid = r.tajwid !== false;
    r.widget = r.widget === true;
    return r;
  }
  var S;
  (function charger() {
    var brut = null;
    try { brut = localStorage.getItem(CLE); } catch (e) { brut = null; }
    if (brut) {
      try { S = normaliser(JSON.parse(brut)); } catch (e) { S = etatInitial(); }
    } else {
      S = etatInitial();
      try { localStorage.setItem(CLE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ }
    }
  })();
  function sauver() {
    try {
      localStorage.setItem(CLE, JSON.stringify(S));
      return true;
    } catch (e) {
      toast('Enregistrement impossible : Safari bloque le stockage (navigation privée ?).');
      return false;
    }
  }
  var annulable = null;
  function retenirPourAnnuler() { annulable = JSON.stringify(S); }
  function annulerDernier() {
    if (!annulable) return;
    S = normaliser(JSON.parse(annulable));
    annulable = null;
    sauver();
    toutAfficher();
    toast('Action annulée.');
  }
  function jourDe(date) {
    var j = S.jours[date] || {};
    return { nouveaux: Number(j.nouveaux) || 0, detail: j.detail || '', recent: j.recent === true, ancien: Number(j.ancien) || 0 };
  }

  // ---------- Calculs ----------
  function calculerEtat() {
    return SOURATES.map(function (s) {
      var p = S.sourates[s.n] || {};
      var appris = entier(p.appris, 0, s.versets, 0);
      return {
        n: s.n, nom: s.nom, arabe: s.arabe, versets: s.versets, juz: s.juz, appris: appris,
        pct: Math.floor(appris / s.versets * 100),
        statut: appris >= s.versets ? 'memo' : appris > 0 ? 'encours' : 'avenir',
        revu: p.revu || '', niveau: p.niveau || ''
      };
    });
  }
  function calculerSegments(etat) {
    var par = new Map(etat.map(function (e) { return [e.n, e]; }));
    var lignes = [];
    JUZ.forEach(function (j) {
      for (var n = j.ds; n <= j.fs; n++) {
        var e = par.get(n);
        var du = n === j.ds ? j.dv : 1;
        var au = n === j.fs ? j.fv : e.versets;
        var appris = Math.max(0, Math.min(au, e.appris) - du + 1);
        lignes.push({
          juz: j.juz, n: n, nom: e.nom, arabe: e.arabe, du: du, au: au, versets: au - du + 1, appris: appris,
          entiere: du === 1 && au === e.versets, statut: e.statut, revu: e.revu, niveau: e.niveau,
          pct: Math.floor(appris / (au - du + 1) * 100)
        });
      }
    });
    return lignes;
  }
  function calculerJuz(segments) {
    return JUZ.map(function (j) {
      var m = segments.filter(function (s) { return s.juz === j.juz; });
      var versets = m.reduce(function (t, s) { return t + s.versets; }, 0);
      var appris = m.reduce(function (t, s) { return t + s.appris; }, 0);
      return { juz: j.juz, nom: j.nom, ds: j.ds, dv: j.dv, fs: j.fs, fv: j.fv, versets: versets, appris: appris, pct: Math.floor(appris / versets * 100) };
    });
  }
  function avant(s1, v1, s2, v2) { return s1 < s2 || (s1 === s2 && v1 <= v2); }
  function calculerBilan(etat, juz) {
    var appris = etat.reduce(function (t, e) { return t + e.appris; }, 0);
    var total = etat.reduce(function (t, e) { return t + e.versets; }, 0);
    var enCours = etat.slice().sort(function (a, b) { return b.n - a.n; }).find(function (e) { return e.appris < e.versets; }) || null;
    var prochain = enCours ? enCours.appris + 1 : null;
    var jc = enCours ? juz.find(function (j) { return avant(j.ds, j.dv, enCours.n, prochain) && avant(enCours.n, prochain, j.fs, j.fv); }) : null;
    return {
      appris: appris, total: total, reste: total - appris, pct: Math.floor(appris / total * 1000) / 10,
      sourates: etat.filter(function (e) { return e.statut === 'memo'; }).length,
      juzComplets: juz.filter(function (j) { return j.appris >= j.versets; }).length,
      enCours: enCours, juzCourant: jc
    };
  }
  function calculerPlan(etat, pas) {
    var jour = aujourdhui();
    var ordre = etat.slice().sort(function (a, b) { return b.n - a.n; });
    var lignes = [];
    var reste = pas;
    for (var i = 0; i < ordre.length && reste > 0; i++) {
      var e = ordre[i];
      if (e.appris >= e.versets) continue;
      var du = e.appris + 1;
      var au = Math.min(e.versets, e.appris + reste);
      lignes.push({ bloc: 'nouveau', n: e.n, nom: e.nom, arabe: e.arabe, du: du, au: au, versets: au - du + 1 });
      reste -= au - du + 1;
    }
    var enCours = ordre.find(function (x) { return x.appris < x.versets; });
    var recent = null;
    if (enCours && enCours.appris > 0) {
      recent = { e: enCours, du: Math.max(1, enCours.appris - RECENT + 1), au: enCours.appris };
    } else {
      var prec = etat.find(function (x) { return x.n === (enCours ? enCours.n + 1 : 1); });
      if (prec && prec.appris >= prec.versets) recent = { e: prec, du: Math.max(1, prec.versets - RECENT + 1), au: prec.versets };
    }
    if (recent) lignes.push({ bloc: 'recent', n: recent.e.n, nom: recent.e.nom, arabe: recent.e.arabe, du: recent.du, au: recent.au, versets: recent.au - recent.du + 1 });
    var reserve = etat.filter(function (x) { return x.statut === 'memo' && (!recent || x.n !== recent.e.n); });
    var cible = Math.ceil(reserve.reduce(function (t, x) { return t + x.versets; }, 0) / S.cycle);
    var faites = reserve.filter(function (x) { return x.revu === jour; });
    var couvert = faites.reduce(function (t, x) { return t + x.versets; }, 0);
    var priorite = function (x) { return (x.revu ? ecartJours(x.revu, jour) : 10000) + (x.niveau === 'fragile' ? S.cycle : 0); };
    var candidates = reserve.filter(function (x) { return x.revu !== jour; }).sort(function (a, b) { return priorite(b) - priorite(a) || a.n - b.n; });
    var choisies = [];
    for (var k = 0; k < candidates.length && couvert < cible; k++) { choisies.push(candidates[k]); couvert += candidates[k].versets; }
    faites.concat(choisies).sort(function (a, b) { return a.n - b.n; }).forEach(function (x) {
      lignes.push({ bloc: 'ancien', n: x.n, nom: x.nom, arabe: x.arabe, du: 1, au: x.versets, versets: x.versets, fait: x.revu === jour, niveau: x.niveau });
    });
    return lignes;
  }
  function calculerRythme() {
    var jour = aujourdhui();
    var nv = function (d) { return jourDe(d).nouveaux; };
    var actif = function (d) { var j = S.jours[d]; return !!j && (nv(d) > 0 || j.recent === true || (Number(j.ancien) || 0) > 0); };
    var d = actif(jour) ? jour : ajouterJours(jour, -1);
    var serie = 0;
    while (actif(d)) { serie++; d = ajouterJours(d, -1); }
    var semaine = 0, obj7 = 0;
    for (var i = 0; i < 7; i++) { var x = nv(ajouterJours(jour, -i)); semaine += x; if (x >= S.objectif) obj7++; }
    var dates = Object.keys(S.jours).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= jour; }).sort();
    var nJours = dates.length ? Math.min(30, ecartJours(dates[0], jour) + 1) : 0;
    var somme = 0;
    for (var k = 0; k < nJours; k++) somme += nv(ajouterJours(jour, -k));
    var t = jourDe(jour);
    return { serie: serie, aujourdhui: t, semaine: semaine, obj7: obj7, moyenne: nJours ? Math.round(somme / nJours * 10) / 10 : 0, joursMoyenne: nJours };
  }

  // ---------- Versets (texte, traduction, audio) ----------
  var cacheMem = new Map();
  function lireCache() { try { return JSON.parse(localStorage.getItem(CLE_CACHE) || '{}'); } catch (e) { return {}; } }
  function ecrireCache(cle, valeur) {
    try {
      var c = lireCache();
      c[cle] = { t: Date.now(), v: valeur };
      Object.keys(c).sort(function (a, b) { return c[b].t - c[a].t; }).slice(60).forEach(function (k) { delete c[k]; });
      localStorage.setItem(CLE_CACHE, JSON.stringify(c));
    } catch (e) { /* cache facultatif */ }
  }
  function nettoyer(texte, n, num) {
    // L'API place la basmala au début du verset 1 : on la retire (sauf Al-Fatiha, où elle est le verset 1).
    if (num === 1 && n !== 1 && n !== 9) {
      var mots = String(texte).split(' ');
      if (mots.length > 4 && mots[0].indexOf('سْمِ') >= 0) return mots.slice(4).join(' ');
    }
    return texte;
  }
  function versetsEnCache(n, du, au) {
    var cle = 'v2:' + n + ':' + du + '-' + au + ':' + S.recitateur;
    if (cacheMem.has(cle)) return cacheMem.get(cle);
    var c = lireCache()[cle];
    if (c) { cacheMem.set(cle, c.v); return c.v; }
    return null;
  }
  function chargerVersets(n, du, au) {
    var cle = 'v2:' + n + ':' + du + '-' + au + ':' + S.recitateur;
    var deja = versetsEnCache(n, du, au);
    if (deja) return Promise.resolve(deja);
    var rec = S.recitateur;
    var url = 'https://api.alquran.cloud/v1/surah/' + n + '/editions/quran-uthmani,quran-tajweed,fr.hamidullah,' + rec + '?offset=' + (du - 1) + '&limit=' + (au - du + 1);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j.code !== 200 || !Array.isArray(j.data)) throw new Error('Réponse inattendue');
      var ed = function (id) { var x = j.data.find(function (d) { return d.edition && d.edition.identifier === id; }); return x ? x.ayahs : []; };
      var ar = ed('quran-uthmani'), tj = ed('quran-tajweed'), fr = ed('fr.hamidullah'), son = ed(rec);
      var v = ar.map(function (a, i) {
        return { num: a.numberInSurah, ar: nettoyer(a.text, n, a.numberInSurah), tj: tj[i] ? nettoyer(tj[i].text, n, a.numberInSurah) : '', fr: fr[i] ? fr[i].text : '', audio: son[i] && son[i].audio ? son[i].audio : '' };
      });
      cacheMem.set(cle, v);
      ecrireCache(cle, v);
      return v;
    });
  }

  // ---------- Lecture audio ----------
  var lecteur = new Audio();
  lecteur.preload = 'auto';
  var file = [];
  var boutonLecture = null;
  function arreterLecture() {
    lecteur.pause();
    file = [];
    if (boutonLecture) { boutonLecture.setAttribute('aria-pressed', 'false'); majLibEcoute(); }
    boutonLecture = null;
  }
  function majLibEcoute() {
    var lib = $('#btn-ecouter-txt');
    if (lib) lib.textContent = $('#btn-ecouter').getAttribute('aria-pressed') === 'true' ? 'Pause' : 'Écouter';
  }
  function lireSuivant() {
    if (!file.length) { arreterLecture(); return; }
    lecteur.src = file.shift();
    var p = lecteur.play();
    if (p && p.catch) p.catch(function () { arreterLecture(); toast('Lecture impossible : vérifie ta connexion.'); });
  }
  lecteur.addEventListener('ended', lireSuivant);
  lecteur.addEventListener('error', function () { if (boutonLecture) { arreterLecture(); toast('Récitation indisponible pour le moment.'); } });
  function ecouter(bouton, segments, repetitions) {
    if (boutonLecture === bouton) { arreterLecture(); return; }
    arreterLecture();
    boutonLecture = bouton;
    bouton.setAttribute('aria-pressed', 'true');
    majLibEcoute();
    Promise.all(segments.map(function (s) { return chargerVersets(s.n, s.du, s.au); })).then(function (listes) {
      if (boutonLecture !== bouton) return;
      file = [];
      listes.forEach(function (versets) {
        versets.forEach(function (v) { for (var i = 0; i < repetitions; i++) if (v.audio) file.push(v.audio); });
      });
      if (!file.length) throw new Error('vide');
      lireSuivant();
    }).catch(function () {
      if (boutonLecture === bouton) { arreterLecture(); toast('Récitation indisponible hors connexion.'); }
    });
  }

  // ---------- Toast et feuille ----------
  var minuteurToast = null;
  function toast(message, actions, duree) {
    var t = $('#toast');
    $('#toast-txt').textContent = message;
    var zone = $('#toast-actions');
    zone.innerHTML = '';
    (actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = a.lib;
      b.addEventListener('click', function () { t.hidden = true; a.fn(); });
      zone.appendChild(b);
    });
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(function () { t.hidden = true; }, duree || (actions && actions.length ? 6000 : 2800));
  }
  var retourFocus = null;
  function ouvrirFeuille(html, brancher) {
    retourFocus = document.activeElement;
    $('#feuille-contenu').innerHTML = html;
    $('#feuille').hidden = false;
    $('#feuille-fond').hidden = false;
    if (brancher) brancher($('#feuille-contenu'));
    var premier = $('#feuille').querySelector('button, input, a');
    if (premier) premier.focus();
  }
  function fermerFeuille() {
    $('#feuille').hidden = true;
    $('#feuille-fond').hidden = true;
    $('#feuille-contenu').innerHTML = '';
    if (retourFocus && retourFocus.focus) retourFocus.focus();
  }
  $('#feuille-fond').addEventListener('click', fermerFeuille);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#feuille').hidden) fermerFeuille(); });
  function confirmer(titre, texte, libOui, fn, danger) {
    ouvrirFeuille(
      '<h2 id="feuille-titre">' + esc(titre) + '</h2><p class="bloc-aide">' + esc(texte) + '</p>' +
      '<div class="feuille-actions"><button type="button" class="' + (danger ? 'btn-danger' : 'btn-principal') + '" data-oui>' + esc(libOui) + '</button>' +
      '<button type="button" class="btn-secondaire" data-non>Annuler</button></div>',
      function (el) {
        el.querySelector('[data-oui]').addEventListener('click', function () { fermerFeuille(); fn(); });
        el.querySelector('[data-non]').addEventListener('click', fermerFeuille);
      }
    );
  }

  // ---------- Actions ----------
  var pas = S.objectif;
  function urlWidget() {
    var etat = calculerEtat();
    var plan = calculerPlan(etat, S.objectif);
    var ry = calculerRythme();
    var p = plan.find(function (l) { return l.bloc === 'nouveau'; });
    var r = plan.find(function (l) { return l.bloc === 'recent'; });
    var anciens = plan.filter(function (l) { return l.bloc === 'ancien' && !l.fait; });
    var q = {
      v: 1, date: aujourdhui(), obj: S.objectif, nb: ry.aujourdhui.nouveaux,
      fait: ry.aujourdhui.nouveaux >= S.objectif ? 1 : 0,
      s: p ? p.n : '', du: p ? p.du : '', au: p ? p.au : '', nom: p ? p.nom : '', ar: p ? p.arabe : '',
      r: r ? r.nom + ' ' + r.du + '-' + r.au : '',
      o: anciens.map(function (l) { return l.nom; }).join('|'),
      app: URL_APP
    };
    return 'scriptable:///run/Hifz?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  }
  function envoyerWidget() {
    S.widget = true;
    sauver();
    location.href = urlWidget();
  }
  function valider() {
    var etat = calculerEtat();
    var segs = calculerPlan(etat, pas).filter(function (l) { return l.bloc === 'nouveau'; });
    if (!segs.length) return;
    retenirPourAnnuler();
    var jour = aujourdhui();
    var j = jourDe(jour);
    segs.forEach(function (s) {
      var p = S.sourates[s.n] || {};
      p.appris = s.au;
      S.sourates[s.n] = p;
    });
    var ajout = segs.reduce(function (t, s) { return t + s.versets; }, 0);
    j.nouveaux += ajout;
    j.detail = [j.detail].concat(segs.map(function (s) { return s.n + ':' + s.du + '-' + s.au; })).filter(Boolean).join(';');
    S.jours[jour] = j;
    if (!sauver()) return;
    pas = S.objectif;
    toutAfficher();
    var actions = [{ lib: 'Annuler', fn: annulerDernier }];
    if (S.widget) actions.push({ lib: 'Widget', fn: envoyerWidget });
    toast(pluriel(ajout, 'verset enregistré', 'versets enregistrés') + '.', actions);
  }
  function annulerJour() {
    var jour = aujourdhui();
    var j = jourDe(jour);
    if (!j.detail) return;
    retenirPourAnnuler();
    var cible = {};
    j.detail.split(';').forEach(function (brut) {
      var m = /^(\d+):(\d+)-(\d+)$/.exec(brut.trim());
      if (!m) return;
      var n = +m[1];
      cible[n] = Math.min(cible[n] == null ? Infinity : cible[n], +m[2] - 1);
    });
    Object.keys(cible).forEach(function (n) {
      var p = S.sourates[n] || {};
      p.appris = Math.min(entier(p.appris, 0, 999, 0), cible[n]);
      S.sourates[n] = p;
    });
    j.nouveaux = 0;
    j.detail = '';
    S.jours[jour] = j;
    sauver();
    toutAfficher();
    toast('Saisie du jour retirée.', [{ lib: 'Rétablir', fn: annulerDernier }]);
  }
  function basculerRecent() {
    var jour = aujourdhui();
    var j = jourDe(jour);
    j.recent = !j.recent;
    S.jours[jour] = j;
    sauver();
    toutAfficher();
  }
  function reviser(n, niveau) {
    var jour = aujourdhui();
    var p = S.sourates[n] || {};
    if (p.revu === jour) return;
    retenirPourAnnuler();
    p.revu_prec = p.revu || '';
    p.niveau_prec = p.niveau || '';
    p.revu = jour;
    p.niveau = niveau;
    S.sourates[n] = p;
    var j = jourDe(jour);
    j.ancien += 1;
    S.jours[jour] = j;
    sauver();
    toutAfficher();
  }
  function annulerRevision(n) {
    var jour = aujourdhui();
    var p = S.sourates[n] || {};
    if (p.revu !== jour) return;
    p.revu = p.revu_prec || '';
    p.niveau = p.niveau_prec || '';
    delete p.revu_prec;
    delete p.niveau_prec;
    S.sourates[n] = p;
    var j = jourDe(jour);
    j.ancien = Math.max(0, j.ancien - 1);
    S.jours[jour] = j;
    sauver();
    toutAfficher();
  }

  // ---------- Affichage : Aujourd'hui ----------
  var jetonNouveaux = 0;
  // Balises tajwid de l'API : [règle[texte] ou [règle:id[texte] → span coloré.
  function htmlTajwid(texte) {
    var re = /\[([a-z])(?::\d+)?\[([^\]]*)\]/g;
    var sortie = '', dernier = 0, m;
    while ((m = re.exec(texte))) {
      sortie += esc(texte.slice(dernier, m.index)) + '<span class="tj tj-' + m[1] + '">' + esc(m[2]) + '</span>';
      dernier = re.lastIndex;
    }
    return sortie + esc(texte.slice(dernier));
  }
  function htmlTexte(versets) {
    var ar = versets.map(function (v) {
      return (S.tajwid && v.tj ? htmlTajwid(v.tj) : esc(v.ar)) + ' <span class="fin-ayah">﴿' + chiffresArabes(v.num) + '﴾</span>';
    }).join(' ');
    var fr = versets.map(function (v) { return '<span>' + v.num + '</span>' + esc(v.fr); }).join(' ');
    return '<p class="texte-coran" lang="ar" dir="rtl">' + ar + '</p>' +
      '<p class="traduction"' + (S.traduction ? '' : ' hidden') + '>' + fr + '</p>';
  }
  function afficherJour(etat, plan, ry) {
    var segs = plan.filter(function (l) { return l.bloc === 'nouveau'; });
    var t = ry.aujourdhui;
    var statut = $('#verset-statut');
    if (!segs.length) statut.textContent = 'Tout le Coran est mémorisé : place à la révision.';
    else if (t.nouveaux >= S.objectif) statut.textContent = 'Objectif du jour atteint. La suite, si tu veux continuer :';
    else if (t.nouveaux > 0) statut.textContent = 'Encore ' + pluriel(S.objectif - t.nouveaux, 'verset', 'versets') + ' pour l’objectif du jour';
    else statut.textContent = 'À apprendre aujourd’hui';
    statut.classList.toggle('est-fait', t.nouveaux >= S.objectif);

    var zone = $('#nouveaux');
    var jeton = ++jetonNouveaux;
    zone.innerHTML = segs.map(function (s, i) {
      var cache = versetsEnCache(s.n, s.du, s.au);
      return '<div class="seg">' +
        '<div class="seg-tete"><div><p class="seg-nom">' + esc(s.nom) + '</p><p class="seg-sous">' + libVersets(s.du, s.au) + '</p></div>' +
        '<span class="seg-ar" lang="ar" dir="rtl">' + esc(s.arabe) + '</span></div>' +
        '<div class="seg-texte" data-i="' + i + '">' + (cache ? htmlTexte(cache) : '<div class="charge" aria-label="Chargement du texte"><i></i><i></i></div>') + '</div>' +
        '</div>';
    }).join('');
    segs.forEach(function (s, i) {
      if (versetsEnCache(s.n, s.du, s.au)) return;
      chargerVersets(s.n, s.du, s.au).then(function (v) {
        if (jeton !== jetonNouveaux) return;
        var cible = zone.querySelector('[data-i="' + i + '"]');
        if (cible) cible.innerHTML = htmlTexte(v);
      }).catch(function () {
        if (jeton !== jetonNouveaux) return;
        var cible = zone.querySelector('[data-i="' + i + '"]');
        if (cible) cible.innerHTML = '<p class="hors-ligne">Le texte s’affiche quand tu es connecté. <a href="https://quran.com/' + s.n + '/' + s.du + '-' + s.au + '" target="_blank" rel="noopener">Ouvrir sur Quran.com</a></p>';
      });
    });

    $('#pas-val').textContent = pas;
    $('#pas-moins').disabled = pas <= 1;
    $('#btn-valider').disabled = !segs.length;
    $('#btn-valider').textContent = pas > 1 ? 'Je les ai appris' : 'Je l’ai appris';
    $('#btn-repet').textContent = '×' + S.repetitions;
    $('#btn-repet').setAttribute('aria-label', 'Chaque verset joué ' + S.repetitions + ' fois');
    $('#btn-trad').setAttribute('aria-pressed', S.traduction ? 'true' : 'false');
    $('#btn-tajwid').setAttribute('aria-pressed', S.tajwid ? 'true' : 'false');
    $('#legende-tajwid').hidden = !S.tajwid || !segs.length;

    var fait = $('#fait-du-jour');
    if (t.detail) {
      fait.hidden = false;
      fait.innerHTML = '✓ Aujourd’hui : ' + esc(lirePlages(t.detail)) + ' <button type="button" id="btn-annuler-jour">Annuler</button>';
      $('#btn-annuler-jour').addEventListener('click', function () {
        confirmer('Retirer la saisie du jour ?', 'Les versets validés aujourd’hui (' + lirePlages(t.detail) + ') repasseront à apprendre.', 'Retirer', annulerJour, true);
      });
    } else {
      fait.hidden = true;
    }

    // Révision récente
    var r = plan.find(function (l) { return l.bloc === 'recent'; });
    $('#bloc-recent').hidden = !r;
    if (r) {
      $('#recent').innerHTML = '<div class="mini"><div><p class="mini-nom">' + esc(r.nom) + '</p><p class="mini-sous">' + libVersets(r.du, r.au) + '</p></div>' +
        '<div class="mini-actions"><span class="seg-ar" lang="ar" dir="rtl">' + esc(r.arabe) + '</span>' +
        '<button type="button" class="rond-ecoute" id="ecoute-recent" aria-pressed="false" aria-label="Écouter la révision récente">' +
        '<svg class="ico-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg><svg class="ico-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 5.5h3v13h-3zM13.5 5.5h3v13h-3z"/></svg></button></div></div>';
      var be = $('#ecoute-recent');
      be.addEventListener('click', function () { ecouter(be, [r], 1); });
      $('#btn-recent').setAttribute('aria-pressed', t.recent ? 'true' : 'false');
      $('#btn-recent-txt').textContent = t.recent ? 'Faite' : 'À faire';
    }

    // Révision ancienne
    var anciens = plan.filter(function (l) { return l.bloc === 'ancien'; });
    var restants = anciens.filter(function (l) { return !l.fait; }).length;
    $('#ancien-meta').textContent = anciens.length ? (restants ? restants + ' sur ' + anciens.length + ' à faire' : 'Terminée ✓') : '';
    var ul = $('#ancien');
    if (!anciens.length) {
      ul.innerHTML = '<li class="vide">Rien à réviser pour l’instant : termine d’abord une sourate.</li>';
    } else {
      ul.innerHTML = anciens.map(function (l) {
        var actions = l.fait
          ? '<span class="etat ' + (l.niveau === 'fragile' ? 'etat-fragile">Fragile' : 'etat-solide">✓ Solide') + '<button type="button" data-annuler="' + l.n + '">annuler</button></span>'
          : '<button type="button" class="puce puce-solide" data-solide="' + l.n + '">Solide</button><button type="button" class="puce puce-fragile" data-fragile="' + l.n + '">Fragile</button>';
        return '<li class="rev' + (l.fait ? ' est-fait' : '') + '"><span class="rev-num">' + l.n + '</span>' +
          '<div class="rev-info"><p class="rev-nom">' + esc(l.nom) + '</p><p class="rev-sous">' + pluriel(l.versets, 'verset', 'versets') + (l.niveau === 'fragile' && !l.fait ? ', notée fragile' : '') + '</p></div>' +
          '<div class="rev-actions">' + actions + '</div></li>';
      }).join('');
    }
  }
  function lirePlages(detail) {
    var segs = [];
    String(detail || '').split(';').forEach(function (brut) {
      var m = /^(\d+):(\d+)-(\d+)$/.exec(brut.trim());
      if (!m) return;
      var s = { n: +m[1], du: +m[2], au: +m[3] };
      var der = segs[segs.length - 1];
      if (der && der.n === s.n && der.au + 1 === s.du) der.au = s.au; else segs.push(s);
    });
    return segs.map(function (s) {
      var nom = (PAR_N.get(s.n) || {}).nom || s.n;
      return nom + ' ' + (s.du === s.au ? s.du : s.du + '–' + s.au);
    }).join(', ');
  }

  // ---------- Affichage : Progrès ----------
  function afficherProgres(etat, juz, bilan, ry) {
    var jc = bilan.juzCourant;
    var pct = jc ? jc.pct : 100;
    var C = 2 * Math.PI * 54;
    $('#anneau').innerHTML = '<svg viewBox="0 0 132 132" role="img" aria-label="Juz en cours mémorisé à ' + pct + ' %">' +
      '<circle class="anneau-fond" cx="66" cy="66" r="54"/><circle class="anneau-val" cx="66" cy="66" r="54" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - pct / 100)).toFixed(1) + '"/></svg>' +
      '<div class="anneau-centre"><span class="anneau-pct">' + pct + ' %</span><span class="anneau-lib">' + (jc ? 'du juz ' + jc.juz : 'terminé') + '</span></div>';
    $('#chiffres').innerHTML =
      '<div><dt>versets mémorisés, ' + nf1.format(bilan.pct) + ' % du Coran</dt><dd>' + nf.format(bilan.appris) + ' <small>sur ' + nf.format(bilan.total) + '</small></dd></div>' +
      '<div><dt>sourates mémorisées</dt><dd>' + bilan.sourates + ' <small>sur 114</small></dd></div>' +
      '<div><dt>série en cours, objectif atteint ' + ry.obj7 + ' j sur 7</dt><dd>' + pluriel(ry.serie, 'jour', 'jours') + '</dd></div>';

    // Durée restante, liée à l'objectif
    afficherDuree(bilan);

    $('#juz-meta').textContent = pluriel(bilan.juzComplets, 'juz terminé', 'juz terminés');
    $('#grille-juz').innerHTML = juz.map(function (j) {
      var complet = j.appris >= j.versets;
      return '<button type="button" class="tuile' + (complet ? ' complet' : '') + (jc && j.juz === jc.juz ? ' courant' : '') + '" data-juz="' + j.juz + '" aria-label="Juz ' + j.juz + ', ' + esc(j.nom) + ' : ' + j.pct + ' %">' +
        '<span class="tuile-rempli" style="height:' + j.pct + '%"></span><span class="tuile-txt"><span class="tuile-num">' + j.juz + '</span><span class="tuile-pct">' + j.pct + ' %</span></span></button>';
    }).join('');

    afficherGraphe(ry);

    var rythmes = [S.objectif, 3, 5, 10].filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    var lignes = rythmes.map(function (v) { return { vpj: v, type: v === S.objectif ? 'objectif' : '' }; });
    if (ry.joursMoyenne >= 7 && ry.moyenne > 0) lignes.push({ vpj: ry.moyenne, type: 'reel' });
    $('#projections').innerHTML = '<thead><tr><th>Versets par jour</th><th>Coran complet dans</th><th>Vers</th></tr></thead><tbody>' +
      lignes.map(function (l) {
        var jours = Math.ceil(bilan.reste / l.vpj);
        var d = duree(jours);
        return '<tr class="' + (l.type === 'objectif' ? 'objectif' : '') + '"><td>' + nf1.format(l.vpj) +
          (l.type === 'objectif' ? '<span class="etiquette">objectif</span>' : l.type === 'reel' ? '<span class="etiquette">ton rythme</span>' : '') +
          '</td><td>' + esc(texteDureeCourte(d)) + '</td><td>' + esc(fMois.format(enDate(d.fin))) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  function texteDureeCourte(d) {
    if (d.ans) return pluriel(d.ans, 'an', 'ans') + (d.mois ? ' et ' + d.mois + ' mois' : '');
    if (d.mois) return d.mois + ' mois' + (d.jours ? ' et ' + pluriel(d.jours, 'jour', 'jours') : '');
    return pluriel(d.jours, 'jour', 'jours');
  }
  function afficherDuree(bilan) {
    var jours = Math.ceil(bilan.reste / S.objectif);
    var d = duree(jours);
    var jc = bilan.juzCourant;
    $('#duree-obj').textContent = S.objectif;
    $('#duree-moins').disabled = S.objectif <= 1;
    $('#duree-val').textContent = bilan.reste ? texteDuree(d) : 'Coran complet';
    var sous = bilan.reste
      ? 'Pour les ' + nf.format(bilan.reste) + ' versets qu’il te reste, soit ' + nf.format(jours) + ' jours : fin prévue vers ' + fMois.format(enDate(d.fin)) + '.'
      : 'Il ne reste que la révision.';
    if (jc) {
      var resteJuz = jc.versets - jc.appris;
      var dj = duree(Math.ceil(resteJuz / S.objectif));
      sous += ' Le juz ' + jc.juz + ' serait terminé dans ' + texteDuree(dj) + ' (' + nf.format(resteJuz) + ' versets).';
    }
    $('#duree-sous').textContent = sous;
    var court = $('#obj-duree');
    if (court) court.textContent = bilan.reste ? 'Coran complet dans ' + texteDuree(d) + ' à ce rythme.' : '';
  }
  var bulleMinuteur = null;
  function afficherGraphe(ry) {
    var zone = $('#graphe');
    var jour = aujourdhui();
    var lignes = [];
    for (var i = 27; i >= 0; i--) {
      var date = ajouterJours(jour, -i);
      var j = jourDe(date);
      lignes.push({ date: date, n: j.nouveaux, rev: j.recent || j.ancien > 0 });
    }
    var W = Math.max(280, zone.clientWidth || 320), H = 150, m = { h: 14, d: 4, b: 26, g: 22 };
    var ymax = Math.max(S.objectif + 1, Math.max.apply(null, lignes.map(function (l) { return l.n; })));
    var pasX = (W - m.g - m.d) / lignes.length;
    var bw = Math.max(3, pasX * 0.68);
    var y = function (v) { return m.h + (H - m.h - m.b) * (1 - v / ymax); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Nouveaux versets validés chaque jour sur 28 jours">';
    svg += '<text x="' + (m.g - 6) + '" y="' + (y(0) + 4) + '" text-anchor="end">0</text>';
    svg += '<text x="' + (m.g - 6) + '" y="' + (y(ymax) + 4) + '" text-anchor="end">' + ymax + '</text>';
    lignes.forEach(function (l, i) {
      var x = m.g + i * pasX + (pasX - bw) / 2;
      var h = Math.max(l.n ? 2 : 1.5, y(0) - y(l.n));
      svg += '<rect class="barre' + (l.n >= S.objectif ? ' atteint' : '') + (l.date === jour ? ' aujourdhui' : '') + '" x="' + x.toFixed(1) + '" y="' + (y(0) - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"/>';
      if (l.rev) svg += '<circle class="point-rev" cx="' + (x + bw / 2).toFixed(1) + '" cy="' + (H - m.b + 7) + '" r="2.4"/>';
    });
    svg += '<line class="ligne-obj" x1="' + m.g + '" x2="' + (W - m.d) + '" y1="' + y(S.objectif).toFixed(1) + '" y2="' + y(S.objectif).toFixed(1) + '"/>';
    [0, 7, 14].forEach(function (i) {
      svg += '<text x="' + (m.g + i * pasX + pasX / 2).toFixed(1) + '" y="' + (H - 3) + '" text-anchor="start">' + esc(fJour.format(enDate(lignes[i].date))) + '</text>';
    });
    svg += '<text x="' + (W - m.d) + '" y="' + (H - 3) + '" text-anchor="end">aujourd’hui</text>';
    lignes.forEach(function (l, i) {
      svg += '<rect data-i="' + i + '" x="' + (m.g + i * pasX).toFixed(1) + '" y="0" width="' + pasX.toFixed(1) + '" height="' + H + '" fill="transparent"/>';
    });
    svg += '</svg>';
    zone.innerHTML = svg + '<div class="bulle" hidden></div>';
    var bulle = zone.querySelector('.bulle');
    zone.querySelectorAll('rect[data-i]').forEach(function (r) {
      var montrer = function () {
        var l = lignes[+r.getAttribute('data-i')];
        bulle.textContent = fJour.format(enDate(l.date)) + ' : ' + pluriel(l.n, 'verset', 'versets') + (l.rev ? ', révision faite' : '');
        bulle.hidden = false;
        var cx = (+r.getAttribute('x') + pasX / 2) / W * zone.clientWidth;
        bulle.style.left = Math.min(Math.max(cx, 80), zone.clientWidth - 80) + 'px';
        clearTimeout(bulleMinuteur);
        bulleMinuteur = setTimeout(function () { bulle.hidden = true; }, 2500);
      };
      r.addEventListener('pointerenter', montrer);
      r.addEventListener('click', montrer);
    });
    $('#graphe-legende').textContent = 'Barres bleues : objectif atteint. Ligne dorée : objectif de ' + pluriel(S.objectif, 'verset', 'versets') + '. Point vert : révision faite. Moyenne : ' + nf1.format(ry.moyenne) + ' verset' + (ry.moyenne > 1 ? 's' : '') + ' par jour' + (ry.joursMoyenne ? ' sur ' + pluriel(ry.joursMoyenne, 'jour', 'jours') : '') + '.';
  }

  // ---------- Affichage : Sourates ----------
  var juzOuverts = null;
  function afficherSourates(segments, juz, bilan) {
    if (!juzOuverts) juzOuverts = new Set(bilan.juzCourant ? [bilan.juzCourant.juz] : [30]);
    var q = ($('#recherche').value || '').trim().toLowerCase();
    var filtre = function (s) {
      if (!q) return true;
      return String(s.n) === q || s.nom.toLowerCase().replace(/['’-]/g, '').indexOf(q.replace(/['’-]/g, '')) >= 0 || s.arabe.indexOf(q) >= 0;
    };
    var html = juz.slice().sort(function (a, b) { return b.juz - a.juz; }).map(function (j) {
      var lignes = segments.filter(function (s) { return s.juz === j.juz && filtre(s); }).sort(function (a, b) { return b.n - a.n; });
      if (q && !lignes.length) return '';
      var ouvert = q ? true : juzOuverts.has(j.juz);
      return '<details class="juz" data-juz="' + j.juz + '" id="juz-' + j.juz + '"' + (ouvert ? ' open' : '') + '>' +
        '<summary><span class="juz-titre">Juz ' + j.juz + ' <span>' + esc(j.nom) + '</span></span><span class="juz-compte">' + nf.format(j.appris) + ' / ' + nf.format(j.versets) + '</span>' +
        '<span class="jauge"><i class="' + (j.appris >= j.versets ? 'complet' : '') + '" style="width:' + j.pct + '%"></i></span></summary>' +
        '<ul class="sourates">' + lignes.map(function (s) {
          var meta = s.statut === 'memo' ? (s.revu ? 'Revue ' + ilYa(s.revu) : 'Mémorisée') : s.statut === 'encours' ? 'En cours' : '';
          if (s.niveau === 'fragile' && s.statut === 'memo') meta += ', <span class="fragile">fragile</span>';
          return '<li><button type="button" class="sourate ' + s.statut + '" data-sourate="' + s.n + '">' +
            '<span class="sourate-num">' + s.n + '</span>' +
            '<span class="sourate-nom">' + esc(s.nom) + (s.entiere ? '' : ' <small>v. ' + s.du + '–' + s.au + '</small>') + '</span>' +
            '<span class="sourate-ar" lang="ar" dir="rtl">' + esc(s.arabe) + '</span>' +
            '<span class="sourate-bas"><span class="jauge"><i class="' + (s.statut === 'memo' ? 'complet' : '') + '" style="width:' + s.pct + '%"></i></span><span class="sourate-compte">' + s.appris + ' / ' + s.versets + '</span></span>' +
            (meta ? '<span class="sourate-meta">' + meta + '</span>' : '') +
            '</button></li>';
        }).join('') + '</ul></details>';
    }).join('');
    $('#liste-juz').innerHTML = html || '<p class="vide">Aucune sourate ne correspond.</p>';
  }
  function ilYa(iso) {
    var n = ecartJours(iso, aujourdhui());
    if (n <= 0) return 'aujourd’hui';
    if (n === 1) return 'hier';
    return 'il y a ' + n + ' jours';
  }
  function ouvrirSourate(n) {
    var s = PAR_N.get(n);
    var p = S.sourates[n] || {};
    var valeur = entier(p.appris, 0, s.versets, 0);
    var jour = aujourdhui();
    ouvrirFeuille(
      '<div class="seg-tete"><div><h2 id="feuille-titre">' + esc(s.nom) + '</h2><p class="seg-sous">Sourate ' + s.n + ', ' + pluriel(s.versets, 'verset', 'versets') + ', juz ' + s.juz + '</p></div><span class="seg-ar" lang="ar" dir="rtl">' + esc(s.arabe) + '</span></div>' +
      '<div class="champ-appris"><div><p class="reglage-nom">Versets appris</p><p class="bloc-aide">Comptés depuis le verset 1</p></div>' +
      '<div class="pas petit"><button type="button" class="pas-btn" data-m aria-label="Un de moins">−</button><output class="pas-val" data-v>' + valeur + '</output><button type="button" class="pas-btn" data-p aria-label="Un de plus">+</button></div></div>' +
      '<div class="rangee"><button type="button" class="pilule pilule-discrete" data-zero>Aucun</button><button type="button" class="pilule pilule-discrete" data-tout>Toute la sourate</button>' +
      '<a class="pilule pilule-discrete" href="https://quran.com/' + s.n + '" target="_blank" rel="noopener">Lire sur Quran.com</a></div>' +
      '<div class="feuille-actions"><button type="button" class="btn-principal" data-ok>Enregistrer</button>' +
      (valeur >= s.versets && p.revu !== jour ? '<button type="button" class="btn-secondaire" data-rev>Marquer révisée aujourd’hui</button>' : '') +
      '</div>',
      function (el) {
        var sortie = el.querySelector('[data-v]');
        var maj = function (v) { valeur = Math.max(0, Math.min(s.versets, v)); sortie.textContent = valeur; };
        el.querySelector('[data-m]').addEventListener('click', function () { maj(valeur - 1); });
        el.querySelector('[data-p]').addEventListener('click', function () { maj(valeur + 1); });
        el.querySelector('[data-zero]').addEventListener('click', function () { maj(0); });
        el.querySelector('[data-tout]').addEventListener('click', function () { maj(s.versets); });
        el.querySelector('[data-ok]').addEventListener('click', function () {
          retenirPourAnnuler();
          var q = S.sourates[n] || {};
          q.appris = valeur;
          S.sourates[n] = q;
          sauver();
          fermerFeuille();
          toutAfficher();
          toast(s.nom + ' : ' + valeur + ' / ' + s.versets + ' versets.', [{ lib: 'Annuler', fn: annulerDernier }]);
        });
        var rv = el.querySelector('[data-rev]');
        if (rv) rv.addEventListener('click', function () { fermerFeuille(); reviser(n, 'solide'); toast(s.nom + ' marquée révisée.', [{ lib: 'Annuler', fn: annulerDernier }]); });
      }
    );
  }

  // ---------- Affichage : Réglages ----------
  function afficherReglages() {
    document.querySelectorAll('[data-theme-choix]').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-theme-choix') === S.theme ? 'true' : 'false');
    });
    $('#obj-val').textContent = S.objectif;
    $('#obj-moins').disabled = S.objectif <= 1;
    $('#cycle-val').textContent = S.cycle + ' j';
    var sel = $('#recitateur');
    if (!sel.options.length) {
      RECITATEURS.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; sel.appendChild(o); });
    }
    sel.value = S.recitateur;
    $('#reglage-tajwid').setAttribute('aria-pressed', S.tajwid ? 'true' : 'false');
    $('#reglage-tajwid-txt').textContent = S.tajwid ? 'Activées' : 'Désactivées';
  }

  // ---------- Thème ----------
  var mqSombre = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function appliquerTheme() {
    var sombre = S.theme === 'dark' || (S.theme === 'auto' && mqSombre && mqSombre.matches);
    document.documentElement.setAttribute('data-theme', sombre ? 'dark' : 'light');
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) { m.setAttribute('content', sombre ? '#0C1424' : '#F1F4F8'); });
  }
  if (mqSombre) {
    var surChangement = function () { if (S.theme === 'auto') appliquerTheme(); };
    if (mqSombre.addEventListener) mqSombre.addEventListener('change', surChangement); else if (mqSombre.addListener) mqSombre.addListener(surChangement);
  }

  // ---------- Tout afficher ----------
  var jourAffiche = null;
  function toutAfficher() {
    jourAffiche = aujourdhui();
    $('#date-du-jour').textContent = fJourLong.format(new Date()).replace(/^./, function (c) { return c.toUpperCase(); });
    var etat = calculerEtat();
    var segments = calculerSegments(etat);
    var juz = calculerJuz(segments);
    var bilan = calculerBilan(etat, juz);
    var plan = calculerPlan(etat, pas);
    var ry = calculerRythme();
    afficherJour(etat, plan, ry);
    afficherProgres(etat, juz, bilan, ry);
    afficherSourates(segments, juz, bilan);
    afficherReglages();
    appliquerTheme();
  }

  // ---------- Onglets ----------
  var ONGLETS = ['jour', 'progres', 'sourates', 'reglages'];
  function montrerOnglet(nom, defiler) {
    if (ONGLETS.indexOf(nom) < 0) nom = 'jour';
    ONGLETS.forEach(function (o) { $('#vue-' + o).hidden = o !== nom; });
    document.querySelectorAll('.onglet').forEach(function (b) {
      if (b.getAttribute('data-onglet') === nom) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (nom === 'progres') afficherGraphe(calculerRythme());
    if (defiler !== false) window.scrollTo(0, 0);
  }
  document.querySelectorAll('.onglet').forEach(function (b) {
    b.addEventListener('click', function () {
      var nom = b.getAttribute('data-onglet');
      if (history.replaceState) history.replaceState(null, '', '#' + nom);
      montrerOnglet(nom);
    });
  });

  // ---------- Écouteurs ----------
  $('#pas-moins').addEventListener('click', function () { pas = Math.max(1, pas - 1); toutAfficher(); });
  $('#pas-plus').addEventListener('click', function () { pas = Math.min(60, pas + 1); toutAfficher(); });
  $('#btn-valider').addEventListener('click', valider);
  $('#btn-recent').addEventListener('click', basculerRecent);
  $('#btn-ecouter').addEventListener('click', function () {
    var segs = calculerPlan(calculerEtat(), pas).filter(function (l) { return l.bloc === 'nouveau'; });
    if (segs.length) ecouter($('#btn-ecouter'), segs, S.repetitions);
  });
  $('#btn-repet').addEventListener('click', function () {
    S.repetitions = REPETITIONS[(REPETITIONS.indexOf(S.repetitions) + 1) % REPETITIONS.length];
    sauver();
    toutAfficher();
    toast('Chaque verset sera joué ' + S.repetitions + ' fois.');
  });
  function basculerTajwid() {
    S.tajwid = !S.tajwid;
    sauver();
    toutAfficher();
    toast(S.tajwid ? 'Couleurs du tajwid activées.' : 'Couleurs du tajwid désactivées.');
  }
  $('#btn-tajwid').addEventListener('click', basculerTajwid);
  $('#reglage-tajwid').addEventListener('click', basculerTajwid);
  $('#btn-trad').addEventListener('click', function () {
    S.traduction = !S.traduction;
    sauver();
    document.querySelectorAll('.traduction').forEach(function (p) { p.hidden = !S.traduction; });
    $('#btn-trad').setAttribute('aria-pressed', S.traduction ? 'true' : 'false');
  });
  $('#ancien').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-solide')) reviser(+b.getAttribute('data-solide'), 'solide');
    else if (b.hasAttribute('data-fragile')) reviser(+b.getAttribute('data-fragile'), 'fragile');
    else if (b.hasAttribute('data-annuler')) annulerRevision(+b.getAttribute('data-annuler'));
  });
  $('#grille-juz').addEventListener('click', function (e) {
    var b = e.target.closest('[data-juz]');
    if (!b) return;
    var n = +b.getAttribute('data-juz');
    juzOuverts.add(n);
    $('#recherche').value = '';
    toutAfficher();
    if (history.replaceState) history.replaceState(null, '', '#sourates');
    montrerOnglet('sourates', false);
    var d = $('#juz-' + n);
    if (d) d.scrollIntoView({ block: 'start' });
  });
  $('#liste-juz').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sourate]');
    if (b) ouvrirSourate(+b.getAttribute('data-sourate'));
  });
  $('#liste-juz').addEventListener('toggle', function (e) {
    var d = e.target;
    if (!d.matches || !d.matches('details.juz') || ($('#recherche').value || '').trim()) return;
    var n = +d.getAttribute('data-juz');
    if (d.open) juzOuverts.add(n); else juzOuverts.delete(n);
  }, true);
  $('#recherche').addEventListener('input', function () {
    var etat = calculerEtat();
    var segments = calculerSegments(etat);
    var juz = calculerJuz(segments);
    afficherSourates(segments, juz, calculerBilan(etat, juz));
  });
  function changerObjectif(delta) {
    S.objectif = entier(S.objectif + delta, 1, 30, 2);
    pas = S.objectif;
    sauver();
    toutAfficher();
  }
  $('#obj-moins').addEventListener('click', function () { changerObjectif(-1); });
  $('#obj-plus').addEventListener('click', function () { changerObjectif(1); });
  $('#duree-moins').addEventListener('click', function () { changerObjectif(-1); });
  $('#duree-plus').addEventListener('click', function () { changerObjectif(1); });
  $('#cycle-moins').addEventListener('click', function () { S.cycle = entier(S.cycle - 1, 3, 60, 7); sauver(); toutAfficher(); });
  $('#cycle-plus').addEventListener('click', function () { S.cycle = entier(S.cycle + 1, 3, 60, 7); sauver(); toutAfficher(); });
  $('#recitateur').addEventListener('change', function (e) { S.recitateur = e.target.value; arreterLecture(); sauver(); toutAfficher(); });
  document.querySelectorAll('[data-theme-choix]').forEach(function (b) {
    b.addEventListener('click', function () { S.theme = b.getAttribute('data-theme-choix'); sauver(); toutAfficher(); });
  });
  $('#bascule-theme').addEventListener('click', function () {
    S.theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    sauver();
    toutAfficher();
  });

  // Widget
  var scriptWidget = null;
  fetch('widget/hifz-widget.js').then(function (r) { return r.ok ? r.text() : null; }).then(function (t) { scriptWidget = t; }).catch(function () {});
  function copierTexte(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texte).catch(function () { return copierAncien(texte); });
    }
    return copierAncien(texte);
  }
  function copierAncien(texte) {
    var zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    zone.setSelectionRange(0, texte.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(zone);
    return ok ? Promise.resolve() : Promise.reject(new Error('copie'));
  }
  $('#btn-copier-widget').addEventListener('click', function () {
    if (!scriptWidget) { window.open('widget/hifz-widget.js', '_blank'); return; }
    copierTexte(scriptWidget).then(function () {
      toast('Script copié. Colle-le dans un nouveau script Scriptable nommé Hifz.');
    }).catch(function () {
      window.open('widget/hifz-widget.js', '_blank');
      toast('Copie bloquée : sélectionne tout le texte ouvert et copie-le.');
    });
  });
  $('#btn-envoyer-widget').addEventListener('click', envoyerWidget);

  // Sauvegarde
  $('#btn-exporter').addEventListener('click', function () {
    var contenu = JSON.stringify({ app: 'hifz', version: 1, exporte: new Date().toISOString(), donnees: S }, null, 2);
    var nom = 'hifz-sauvegarde-' + aujourdhui() + '.json';
    var blob = new Blob([contenu], { type: 'application/json' });
    try {
      var fichier = new File([blob], nom, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
        navigator.share({ files: [fichier], title: 'Sauvegarde Hifz' }).catch(function () {});
        return;
      }
    } catch (e) { /* partage de fichier non pris en charge */ }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('#fichier-import').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var lecteurFichier = new FileReader();
    lecteurFichier.onload = function () {
      var o;
      try { o = JSON.parse(lecteurFichier.result); } catch (err) { toast('Ce fichier n’est pas une sauvegarde Hifz valide.'); return; }
      var d = o && o.donnees ? o.donnees : o;
      if (!d || typeof d.sourates !== 'object') { toast('Ce fichier n’est pas une sauvegarde Hifz valide.'); return; }
      var n = Object.keys(d.sourates).length;
      confirmer('Importer cette sauvegarde ?', 'Elle remplacera le suivi actuel de ce téléphone (' + pluriel(n, 'sourate suivie', 'sourates suivies') + ' dans le fichier).', 'Importer', function () {
        retenirPourAnnuler();
        S = normaliser(d);
        pas = S.objectif;
        sauver();
        toutAfficher();
        toast('Sauvegarde importée.', [{ lib: 'Annuler', fn: annulerDernier }]);
      });
    };
    lecteurFichier.readAsText(f);
  });
  $('#btn-reset').addEventListener('click', function () {
    confirmer('Tout réinitialiser ?', 'Le suivi revient au point de départ : An-Nas à Al-Inshiqaq mémorisées, Al-Mutaffifin jusqu’au verset 17. L’historique est effacé.', 'Réinitialiser', function () {
      retenirPourAnnuler();
      var theme = S.theme;
      S = etatInitial();
      S.theme = theme;
      pas = S.objectif;
      sauver();
      toutAfficher();
      toast('Suivi réinitialisé.', [{ lib: 'Annuler', fn: annulerDernier }]);
    }, true);
  });

  // Nouveau jour pendant que l'appli est ouverte
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && jourAffiche !== aujourdhui()) { pas = S.objectif; toutAfficher(); }
  });
  var largeurPrec = window.innerWidth;
  window.addEventListener('resize', function () {
    if (Math.abs(window.innerWidth - largeurPrec) > 40) { largeurPrec = window.innerWidth; afficherGraphe(calculerRythme()); }
  });

  // Démarrage
  var installee = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  $('#bloc-installer').hidden = installee;
  toutAfficher();
  montrerOnglet((location.hash || '#jour').slice(1), false);
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.HIFZ = { duree: duree, texteDuree: texteDuree, calculerEtat: calculerEtat, calculerPlan: calculerPlan, etat: function () { return S; } };
})();
