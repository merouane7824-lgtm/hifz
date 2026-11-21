# Hifz — suivi de mémorisation du Coran

Appli web personnelle, installable sur l'écran d'accueil de l'iPhone :

- **Aujourd'hui** : les nouveaux versets à apprendre (texte arabe, traduction Hamidullah, récitation avec répétitions), la révision récente et la révision ancienne du jour, à noter Solide ou Fragile.
- **Progrès** : juz en cours, temps restant pour tout le Coran selon l'objectif quotidien, les 30 juz, l'historique sur 4 semaines et les projections.
- **Sourates** : progression par juz puis par sourate, modifiable.
- **Réglages** : thème clair, sombre ou automatique, objectif, durée du tour de révision, récitateur, widget, sauvegarde.

Les données restent sur le téléphone (localStorage). Exporter / Importer permet de les sauvegarder ou de changer d'appareil.

## Widget iPhone

Le widget passe par l'app gratuite [Scriptable](https://apps.apple.com/fr/app/scriptable/id1405459188) : colle `widget/hifz-widget.js` dans un script nommé **Hifz**, puis touche « Envoyer au widget » dans l'appli.

## Sources

Texte, traduction et audio : [api.alquran.cloud](https://alquran.cloud/api). Découpage des juz : mushaf de Médine (lecture Hafs).
