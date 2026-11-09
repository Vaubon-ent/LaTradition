# Rapport UX — LaTradition (latradition.netlify.app)

Nov 9, 2026

## Synthèse consolidée

Le parcours client (Bienvenue → Commande → Coordonnées → Récapitulatif → Confirmation) a été mené jusqu'au bout avec succès par les 3 personas, en desktop comme en mobile, avec des totaux systématiquement corrects. Le problème le plus sérieux est un message d'erreur technique ("Nonce déjà utilisé.") qui bloque la validation sans recours visible après un refus serveur lié à un doublon de téléphone — trouvé par la persona Exigeant·e. Le problème qui revient chez les 3 personas est l'incohérence entre "Date de retrait" et "Heure de retrait" sur l'écran de confirmation, qui affichent deux dates différentes au lieu d'une date et d'une heure. Deux autres petits irritants (message "Prénom requis." qui ne se met pas à jour en live, absence de spinner au chargement des boudins) sont également confirmés par au moins 2 personas sur 3, ce qui en fait des signaux fiables plutôt que des cas isolés.

## Findings par sévérité

**Critique (bloque l'objectif d'un utilisateur)**

- Après un refus serveur (doublon de téléphone — "Une commande existe déjà pour ce client sur cette saison"), revenir en arrière, changer le numéro puis revalider affiche un message technique brut "Nonce déjà utilisé." et bloque définitivement la validation tant que la page n'est pas entièrement rechargée — observé par Exigeant·e (reproduit 2 fois), aucun recours visible pour un client réel.

**Majeur (forte friction, contournable)**

- "Date de retrait" et "Heure de retrait" affichent sur l'écran de confirmation deux dates différentes (ex. "13 décembre 2026" vs "Samedi 6 Décembre 2026") ; le champ "Heure" ne contient jamais d'heure — observé et reproduit par les 3 personas (Novice, Impatient, Exigeant·e), desktop et mobile.
- L'avertissement de doublon téléphone à l'étape Coordonnées est formulé comme non bloquant ("semble déjà avoir une commande"), mais la validation finale refuse réellement la commande pour ce motif — observé par Exigeant·e ; le libellé ne prévient pas de ce blocage à venir.

**Mineur (cosmétique, n'empêche pas la tâche)**

- Le message d'erreur "Prénom requis." reste affiché même après correction du champ, jusqu'au prochain clic sur "Suivant" — observé par les 3 personas.
- Absence d'indicateur de chargement (\~2 secondes) à l'arrivée sur l'étape Commande, avant l'affichage des cartes de boudin — observé par Novice et Exigeant·e.
- Incohérence de séparateur décimal : virgule dans le champ de saisie/la roulette ("1,5"), point dans le récapitulatif ("1.5 kg") — observé par Novice et Exigeant·e.
- Bouton "Suivant" simplement grisé sans message explicatif quand la quantité est à 0 à l'étape Commande — observé par Impatient.
- Aucun feedback visuel immediat (spinner/désactivation) au clic sur "Suivant" à l'étape Coordonnées, poussant à recliquer par réflexe — observé par Impatient (sans double soumission constatée).
- Incohérence de pattern de validation entre l'étape Commande (bouton désactivé tant que quantité=0) et l'étape Coordonnées (bouton actif même formulaire vide, erreur au clic) — observé par Exigeant·e.
- La touche Entée ne valide pas le formulaire Coordonnées depuis un champ texte (seulement depuis le bouton "Suivant" lui-même) — observé par Exigeant·e.
- Boutons +/- d'environ 36-40px, légèrement sous la zone tactile recommandée de 44px — observé par Exigeant·e (non testé en conditions tactiles réelles).
- La "roulette" de quantités recouvre partiellement la carte de boudin suivante — observé par Exigeant·e, desktop et mobile.
- Recharger l'URL racine ne ramène pas toujours à l'étape 1 "Bienvenue" (reprise en plein milieu du parcours via un état persistant, sans option visible pour recommencer) — observé par Novice.
- Les coordonnées personnelles (nom, prénom, téléphone) sont conservées en clair via un stockage local du navigateur entre deux rechargements — observé par Exigeant·e, à surveiller du point de vue confidentialité.

## Ce qui fonctionne bien

- Parcours complet mené à terme par les 3 personas, en desktop et en mobile, sans blocage irrémédiable (hors le cas du nonce après un refus serveur).
- Totaux toujours corrects et cohérents avec les lignes commandées, sur tous les passages testés.
- La "roulette" de quantités (0 à 20kg par pas de 0,5) est bien reçue par les 3 personas : lisible, rapide à utiliser, bonne redondance avec les boutons +/- et la saisie libre.
- Messages d'erreur de formulaire clairs et sans jargon technique ("Prénom requis.").
- Feedback visuel net sur le bouton "Suivant" à l'étape Commande (grisé → actif) dès qu'une quantité valide est saisie.
- Mise en page responsive solide : aucun débordement horizontal ni texte tronqué observé en vue mobile (\~390px), cartes et textes qui s'adaptent proprement.
- Persistance de la progression (étape en cours et champs saisis) en cas de rafraîchissement accidentel — rassurant pour un parcours en 5 étapes.
- Ordre de tabulation clavier logique et fonctionnel sur le formulaire Coordonnées (Prénom → Nom → Téléphone → Précédent → Suivant).

---

## Détail par persona

### 🧑 Novice

Je suis arrivé directement en plein milieu du parcours (étape 2/5) en rechargeant le lien — un peu déroutant, je m'attendais à repartir de la page d'accueil. Je suis revenu en arrière pour voir l'écran de Bienvenue : texte clair ("Pas d'actualité pour le moment.") et un gros bouton "Commander" facile à trouver, rien à redire.

Sur l'écran de commande, j'ai eu un court instant de doute : après avoir cliqué sur "Commander", l'écran est resté presque vide pendant 2 secondes sans rien qui bouge, j'ai cru que mon clic n'avait pas marché. Puis les cartes de boudins sont apparues. J'ai testé les boutons +/- (faciles à comprendre) et j'ai découvert en cliquant dans le champ une liste de valeurs tout préparée (0 à 20kg) — très pratique, je n'aurais pas su quoi taper sinon.

Au formulaire de coordonnées, j'ai essayé de passer à l'étape suivante sans rien remplir pour voir ce qui se passerait : le message "Prénom requis." est apparu, clair et compréhensible. J'ai rempli mes informations, mais le message rouge est resté affiché même après — j'ai hésité un instant, je pensais avoir encore un problème, avant de recliquer sur Suivant et de voir que ça passait bien.

J'ai terminé ma commande sans souci jusqu'à l'écran final. Le total était juste (35,00€). Mais en relisant l'écran de confirmation, j'ai été complètement perdu par deux lignes : "Date de retrait : 13 décembre 2026" et juste en dessous "Heure de retrait : Samedi 6 Décembre 2026" — la deuxième ligne est aussi une date, pas une heure, et elle ne correspond mme pas à la première ! Je ne saurais vraiment pas quel jour aller chercher ma commande.

J'ai refait le même parcours sur mobile : tout s'est aussi bien passé, la mise en page s'adapte bien, rien n'est coupé ou illisible. Le même problème de dates s'est reproduit à l'identique.

### ⚡ Impatient

Je n'ai pas lu le texte d'accueil, j'ai cliqué direct sur "Commander". À l'étape commande, j'ai essayé de passer à la suite sans rien sélectionner : le bouton était simplement grisé, sans message pour m'expliquer pourquoi — ça m'a fait perdre quelques secondes à comprendre. J'ai double-cliqué rapidement sur le "+" pour voir si ça buguait : non, l'incrément est resté propre. La roulette de quantités m'a permis d'aller vite pour sélectionner 1,5kg en un clic.

Au formulaire de coordonnées, j'ai rempli vite et cliqué sur Suivant. Comme rien ne bougeait visuellement tout de suite (pas de spinner, pas de changement d'apparence du bouton), j'ai recliqué par réflexe en pensant que ça n'avait pas marché — en fait le premier clic avait bien fonctionné, le second est tombé dans le vide sans casser quoi que ce soit. J'ai validé le récapitulatif sans le relire et j'ai atteint la confirmation sans problème.

Sur mobile, j'ai volontairement rafraîchi la page en plein milieu du formulaire de coordonnées pour voir ce qui se passerait : très bonne surprise, j'étais toujours à la même étape avec mes champs déjà remplis, rien n'a été perdu. Cette fois le clic sur Suivant a marché du premier coup, sans besoin de recliquer. J'ai validé ma commande (42,00€, total juste) et atteint la confirmation.

Les boutons +/- et la roulette sont assez rapides pour mon profil. Le point qui m'aurait vraiment fait décrocher si j'étais vraiment pressé, c'est l'absence de retour visuel immédiat après certains clics — ça me fait douter et recliquer, ce qui est exactement le genre de friction qui me ferait abandonner sur une vraie app si ça arrivait à une étape plus engageante.

### 🔍 Exigeant·e confort UX

La cohérence visuelle entre les 5 écrans est globalement bonne : même carte blanche centrée, même palette (fond beige, bouton bordeaux), même typographie, indicateur "Étape X/5" toujours au même endroit. J'ai testé la navigation au clavier sur le formulaire de coordonnées : l'ordre de tabulation est logique (Prénom → Nom → Téléphone → Précédent → Suivant), mais l'anneau de focus reste discret, facilement manqué par quelqu'un qui scanne vite. La touche Entée ne valide pas le formulaire depuis un champ texte, seulement depuis le bouton Suivant lui-même — un comportement un peu moins naturel que ce à quoi je m'attendais.

J'ai remarqué une incohérence de pattern entre l'étape Commande, où le bouton Suivant reste désactivé tant qu'aucune quantité n'est choisie (bon retour visuel clair), et l'étape Coordonnées, où le bouton est actif par défaut même formulaire vide. J'ai aussi confirmé les deux bugs déjà repérés par les personas précédents : le message "Prénom requis." qui reste affiché après correction, et l'incohérence "Date de retrait"/"Heure de retrait" (deux dates différentes, aucune heure) — reproduite à l'identique sur mes deux commandes test.

En testant un scénario de doublon de téléphone volontaire, j'ai découvert un problème plus sérieux que les avertissements cosmétiques : l'avertissement de doublon à l'étape Coordonnées laisse croire qu'on peut l'ignorer, mais la validation finale refuse réellement la commande pour ce motif. En revenant en arrière pour changer de numéro puis en revalidant, je suis tombé sur un message technique brut "Nonce déjà utilisé." qui bloque définitivement la validation — reproduit deux fois — sans aucune indication qu'un rechargement complet de la page est nécessaire pour s'en sortir. C'est le point le plus bloquant de tout mon test.

J'ai aussi noté : les zones cliquables des boutons +/- (36-40px) sont légèrement sous la taille tactile recommandée de 44px ; la roulette de quantités recouvre partiellement la carte suivante, pas très soigné visuellement ; les nombres passent de la virgule (étape commande) au point (récapitulatif) ; et les coordonnées saisies restent en clair dans le stockage local du navigateur entre deux rechargements, ce qui est pratique pour l'utilisateur mais à surveiller du point de vue confidentialité. Côté mobile (émulé en viewport \~390px), je n'ai trouvé aucune différence de mise en page notable par rapport au desktop : même colonne centrée, mêmes proportions, aucun texte tronqué.
