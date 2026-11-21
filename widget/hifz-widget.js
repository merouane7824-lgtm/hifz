// Hifz — widget Scriptable : tes versets du jour sur l'écran d'accueil.
// 1. Dans Scriptable, crée un script nommé exactement « Hifz » et colle ce code.
// 2. Dans l'appli Hifz (Réglages), touche « Envoyer au widget » : Scriptable s'ouvre et enregistre tes versets.
// 3. Ajoute un widget Scriptable (taille moyenne ou grande) et choisis le script Hifz.

const fm = FileManager.local();
const DOSSIER = fm.documentsDirectory();
const FICHIER = fm.joinPath(DOSSIER, "hifz-widget.json");
const CACHE = fm.joinPath(DOSSIER, "hifz-widget-textes.json");

const C = {
  fond: Color.dynamic(new Color("#FFFFFF"), new Color("#0C1424")),
  encre: Color.dynamic(new Color("#17223A"), new Color("#E6EBF4")),
  doux: Color.dynamic(new Color("#586780"), new Color("#98A5BC")),
  lapis: Color.dynamic(new Color("#22488A"), new Color("#8FB3F2")),
  or: Color.dynamic(new Color("#A97C2C"), new Color("#D8AF68")),
  ok: Color.dynamic(new Color("#2B7A57"), new Color("#5BC394")),
};

function aujourdhui() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function lireJSON(chemin, defaut) {
  try {
    return fm.fileExists(chemin) ? JSON.parse(fm.readString(chemin)) : defaut;
  } catch (e) {
    return defaut;
  }
}
function chiffresArabes(n) {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
function libVersets(du, au) {
  if (du === au) return "Verset " + du;
  if (au === du + 1) return "Versets " + du + " et " + au;
  return "Versets " + du + " à " + au;
}

// Données envoyées par l'appli (scriptable:///run/Hifz?...)
const q = args.queryParameters || {};
let etat = lireJSON(FICHIER, null);
const recu = q.v !== undefined;
if (recu) {
  etat = {
    s: Number(q.s) || 0,
    du: Number(q.du) || 0,
    au: Number(q.au) || 0,
    nom: q.nom || "",
    ar: q.ar || "",
    date: q.date || aujourdhui(),
    fait: q.fait === "1",
    nb: Number(q.nb) || 0,
    obj: Number(q.obj) || 2,
    r: q.r || "",
    o: q.o ? String(q.o).split("|").filter(Boolean) : [],
  };
  fm.writeString(FICHIER, JSON.stringify(etat));
}

async function texteArabe(s, du, au) {
  const cle = s + ":" + du + "-" + au;
  const cache = lireJSON(CACHE, {});
  if (cache[cle]) return cache[cle];
  try {
    const url = "https://api.alquran.cloud/v1/surah/" + s + "/quran-uthmani?offset=" + (du - 1) + "&limit=" + (au - du + 1);
    const j = await new Request(url).loadJSON();
    const ayahs = (j && j.data && j.data.ayahs) || [];
    const texte = ayahs
      .map((a) => {
        let t = a.text;
        if (a.numberInSurah === 1 && s !== 1 && s !== 9) {
          const mots = t.split(" ");
          if (mots.length > 4 && mots[0].indexOf("سْمِ") >= 0) t = mots.slice(4).join(" ");
        }
        return t + " ﴿" + chiffresArabes(a.numberInSurah) + "﴾";
      })
      .join(" ");
    if (texte) {
      cache[cle] = texte;
      const cles = Object.keys(cache);
      if (cles.length > 20) delete cache[cles[0]];
      fm.writeString(CACHE, JSON.stringify(cache));
    }
    return texte;
  } catch (e) {
    return "";
  }
}

async function construire(famille) {
  const w = new ListWidget();
  w.backgroundColor = C.fond;
  w.setPadding(14, 16, 14, 16);

  if (!etat || !etat.s) {
    const t = w.addText("Hifz");
    t.font = Font.boldSystemFont(16);
    t.textColor = C.lapis;
    w.addSpacer(6);
    const m = w.addText("Ouvre l’appli Hifz, puis Réglages → « Envoyer au widget ».");
    m.font = Font.systemFont(13);
    m.textColor = C.doux;
    return w;
  }

  const faitAujourdhui = etat.fait && etat.date === aujourdhui();
  w.url = "https://quran.com/" + etat.s + "/" + (etat.du === etat.au ? etat.du : etat.du + "-" + etat.au);

  const haut = w.addStack();
  haut.centerAlignContent();
  const statut = haut.addText(faitAujourdhui ? "✓ Objectif du jour atteint" : "À apprendre aujourd’hui");
  statut.font = Font.semiboldSystemFont(11);
  statut.textColor = faitAujourdhui ? C.ok : C.or;
  haut.addSpacer();
  const nomAr = haut.addText(etat.ar);
  nomAr.font = new Font("GeezaPro-Bold", famille === "small" ? 13 : 15);
  nomAr.textColor = C.lapis;

  w.addSpacer(4);
  const nom = w.addText((faitAujourdhui ? "Ensuite : " : "") + etat.nom);
  nom.font = Font.boldSystemFont(famille === "small" ? 14 : 16);
  nom.textColor = C.encre;
  nom.lineLimit = 1;
  nom.minimumScaleFactor = 0.7;
  const plage = w.addText(libVersets(etat.du, etat.au));
  plage.font = Font.systemFont(12);
  plage.textColor = C.doux;

  if (famille !== "small") {
    const texte = await texteArabe(etat.s, etat.du, etat.au);
    if (texte) {
      w.addSpacer(6);
      const t = w.addText(texte);
      t.font = new Font("GeezaPro", famille === "large" ? 21 : 16);
      t.textColor = C.encre;
      t.rightAlignText();
      t.lineLimit = famille === "large" ? 7 : 3;
      t.minimumScaleFactor = 0.55;
    }
  }

  if (famille === "large") {
    w.addSpacer(10);
    if (etat.r) {
      const r = w.addText("Révision récente : " + etat.r.replace(/(\d+)-(\d+)$/, "$1 à $2"));
      r.font = Font.mediumSystemFont(12);
      r.textColor = C.doux;
    }
    if (etat.o && etat.o.length) {
      const o = w.addText("Révision ancienne : " + etat.o.join(", "));
      o.font = Font.mediumSystemFont(12);
      o.textColor = C.doux;
      o.lineLimit = 2;
    }
  }

  w.addSpacer();
  const pied = w.addText("Hifz");
  pied.font = Font.semiboldSystemFont(10);
  pied.textColor = C.or;

  // Redessine le widget peu après minuit pour repasser en « À apprendre aujourd'hui ».
  const minuit = new Date();
  minuit.setHours(24, 0, 30, 0);
  w.refreshAfterDate = minuit;
  return w;
}

if (config.runsInWidget) {
  const w = await construire(config.widgetFamily || "medium");
  Script.setWidget(w);
} else {
  const w = await construire("medium");
  if (recu) {
    const a = new Alert();
    a.title = "Widget Hifz mis à jour";
    a.message = etat.s ? etat.nom + ", " + libVersets(etat.du, etat.au).toLowerCase() + "." : "Rien à apprendre pour le moment.";
    a.addAction("Voir l’aperçu");
    a.addCancelAction("OK");
    const choix = await a.present();
    if (choix === 0) await w.presentMedium();
  } else {
    await w.presentMedium();
  }
}
Script.complete();
