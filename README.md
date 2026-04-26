# GRIMACE RUN - Neural Face Runner

> Projet IA2 2025-2026 - ML5.js + Neuro-Evolution

Un jeu de course infini cyberpunk contrôlé par les expressions du visage, avec des runners IA qui apprennent par algorithme génétique.

---

## Jouer

**[Jouer en ligne - GitHub Pages](https://marema06.github.io/grimace-run/)**

Ou en local :
```bash
npx serve . --listen 3001
# Ouvrir http://localhost:3001
```

---

## Contrôles

| Grimace | Action | Clavier |
|---------|--------|---------|
| 😮 Bouche ouverte | Saut | ESPACE |
| 😱 Grande bouche | Super saut | MAJ |
| 🤨 Sourcils levés | Dash (glisse sous barre) | Flèche bas |
| 😄 Sourire | Bouclier | A |

La caméra démarre automatiquement. La détection se calibre sur votre visage pendant 3 secondes au démarrage.

---

## Obstacles

- **Mur rouge** - sauter par-dessus
- **Barre orange** - passer en dessous (dash)
- **Trou violet** - rester en l'air

---

## Architecture ML5.js

### 1. Réseau de neurones (neural-net.js)

Réseau feedforward entièrement custom :
- Initialisation Xavier
- Activations : tanh (couches cachées), sigmoid (sortie)
- Pas de dépendance externe - zéro bibliothèque de NN

```
Entrées (6) → Couche cachée (8) → Sorties (2)
```

**Entrées :** distance prochain obstacle, type, hauteur, 2e obstacle, hauteur joueur, vitesse verticale
**Sorties :** signal saut, signal dash

### 2. Algorithme neuro-évolutif (ai-population.js)

Population de 20 runners IA évoluant par algorithme génétique :

- **Sélection** : élitisme - le meilleur cerveau passe intact à la génération suivante
- **Mutation** : taux 6%, amplitude 0.22 sur les poids
- **Fitness** : score de survie (distance parcourue)
- **Pas de crossover** : mutation seule depuis le meilleur individu

Les runners IA s'améliorent génération après génération en arrière-plan pendant que le joueur humain joue.

### 3. FaceMesh ML5 (facemesh-controller.js)

Détection des expressions faciales via ML5.js FaceMesh (MediaPipe, 468 landmarks) :

- **Calibration dynamique** : 90 frames de mesure au repos → seuils adaptés à chaque visage
- **Bouche** : distance landmarks 13/14 normalisée par hauteur du visage
- **Sourcils** : ratio distance sourcil-oeil
- **Sourire** : largeur coins de bouche normalisée

---

## Stack technique

- **p5.js 1.9.3** - rendu canvas 2D, boucle de jeu 60fps
- **ML5.js** - FaceMesh (MediaPipe) pour la détection faciale
- **Web Audio API** - sons synthétisés (aucun fichier audio)
- **Vanilla JS** - pas de framework, pas de build step

---

## Structure du projet

```
grimace-run/
├── index.html
├── style.css
├── js/
│   ├── neural-net.js        # Réseau de neurones custom
│   ├── ai-population.js     # Algorithme génétique
│   ├── facemesh-controller.js # Détection ML5 FaceMesh
│   ├── player.js            # Joueur humain
│   ├── obstacles.js         # Obstacles + gestion
│   ├── particles.js         # Effets visuels
│   ├── audio.js             # Sons synthétisés
│   └── sketch.js            # Boucle principale p5.js
```

---

## Lancer en local

Cloner le repo et servir les fichiers statiques :

```bash
git clone https://github.com/VOTRE_PSEUDO/grimace-run.git
cd grimace-run
npx serve . --listen 3001
```

Ouvrir **http://localhost:3001** dans Chrome (nécessaire pour l'accès webcam).

---

## Problèmes rencontrés et solutions

Cette section documente les difficultés techniques rencontrées pendant le développement et les solutions apportées. C'est l'aspect le plus instructif du projet.

### 1. Biais de MediaPipe FaceMesh sur les peaux foncées

**Problème :** Le modèle MediaPipe FaceMesh utilisé par ML5.js a été entraîné majoritairement sur des visages clairs et performe moins bien sur peaux foncées, particulièrement en faible luminosité ambiante. C'est un biais documenté dans la littérature scientifique sur la vision par ordinateur.

**Solutions implémentées :**
- **Boost de luminosité côté CSS** sur le canvas envoyé à ML5 : `brightness(2.0) contrast(1.4)`
- **Correction gamma au niveau pixel** via une lookup table (LUT) pré-calculée de 256 valeurs : chaque pixel passe par `255 * pow(value/255, gamma)` avec gamma = 0.45 par défaut. Beaucoup plus efficace qu'un simple multiplicateur de luminosité car ça étire spécifiquement les demi-tons.
- **Auto-ajustement adaptatif** : si aucun visage n'est détecté pendant 90 frames, le gamma se réduit automatiquement par paliers de 0.05 jusqu'à 0.25 (image très éclaircie).
- **Slider manuel** dans l'UI permettant à l'utilisateur d'ajuster le gamma en temps réel.

**Réflexion :** Ce problème illustre concrètement les enjeux éthiques des modèles de vision par ordinateur. Plutôt que de masquer la limitation, le projet la documente et la mitige par traitement d'image.

### 2. Désactivation involontaire de la caméra par la barre espace

**Problème :** Quand le joueur cliquait sur le bouton "Activer caméra", celui-ci gardait le focus. Pendant le jeu, appuyer sur ESPACE pour sauter déclenchait un re-clic du bouton focusé, ce qui désactivait la caméra. Comportement par défaut HTML pour les boutons focusés.

**Solutions implémentées :**
- `tabindex="-1"` sur tous les boutons → exclus du tab order
- `event.preventDefault()` sur les keydown des boutons
- `return false` dans le `keyPressed()` p5.js pour bloquer le comportement par défaut
- `btn.blur()` immédiat après chaque clic + transfert du focus vers le canvas
- **Refactorisation finale :** suppression complète de la possibilité de désactiver la caméra via le bouton principal. La caméra démarre automatiquement à l'ouverture de la page.

### 3. Race conditions entre activations concurrentes de la caméra

**Problème :** Un watchdog vérifiait toutes les secondes que le stream vidéo était toujours actif. S'il détectait un problème, il appelait `_activate()` à nouveau. Mais `getUserMedia()` peut échouer si la caméra est encore occupée par l'ancien stream → le catch block stoppait l'ancien stream qui fonctionnait → caméra perdue.

**Solution :**
- Suppression du watchdog
- Méthode `_activate()` rendue idempotente avec un flag `_activating` empêchant les appels concurrents
- Le catch block ne touche plus au DOM webcam-wrapper en cas d'échec partiel

### 4. Calibration des seuils de détection faciale

**Problème :** Les ratios calculés (ouverture bouche / hauteur visage, etc.) varient significativement selon la distance à la caméra, la morphologie et la résolution. Des seuils fixes ne pouvaient pas convenir à tous les utilisateurs.

**Tentative 1 (abandonnée) :** Calibration dynamique sur 90 frames - mesure du ratio au repos pendant 3s, puis seuils relatifs `baseline + delta`. Mais cela imposait à l'utilisateur de rester immobile et créait une fenêtre de 3 secondes où le timing coïncidait avec d'autres bugs.

**Solution finale :** Seuils fixes calibrés expérimentalement sur plusieurs visages, avec normalisation par la hauteur du visage (front → menton, landmarks 10 et 152) plutôt que par la largeur des yeux. Plus stable face aux rotations.

### 5. Erreurs dans le callback ML5 interrompant la détection

**Problème :** Si une erreur JavaScript survenait dans `_process()` ou `_drawOverlay()` (ex : landmark manquant), elle remontait dans la boucle interne de ML5 et pouvait stopper la détection.

**Solution :** Wrapping systématique du callback `detectStart` dans un `try/catch` qui absorbe silencieusement les erreurs. La détection continue même si une frame plante.

### 6. Conflit p5.js / canvas multiples

**Problème :** Initialement, la webcam était affichée dans un élément HTML `<div>` séparé. Quand le wrapper était caché (par n'importe quelle cause), l'utilisateur perdait totalement le retour visuel de la détection.

**Solution :** Implémentation d'une **picture-in-picture** dessinée DIRECTEMENT dans le canvas du jeu p5.js. La webcam est rendue via `image(face.videoEl, ...)` à chaque frame, avec les landmarks superposés. Aucune manipulation DOM ne peut la cacher car elle fait partie intégrante du rendu du jeu.

### 7. Calibration des seuils de mutation génétique

**Problème :** Au début, la mutation était trop forte (taux 20%, amplitude 0.5) → les bons cerveaux étaient détruits à chaque génération. Trop faible (taux 1%) → l'évolution stagnait.

**Solution :** Stratégie de mutation **graduée** :
- **Élitisme strict** : le meilleur cerveau passe intact (copie sans mutation)
- **Mutation douce** sur les 2 suivants (taux × 0.3, amplitude × 0.3)
- **Mutation pleine** sur le reste de la population (taux 6%, amplitude 0.22)

Convergence visible en 5 à 15 générations selon les conditions.

### 8. Intégration musique synthétisée sans fichiers audio

**Problème :** Le brief excluait les fichiers audio externes. Comment faire une musique de fond cohérente uniquement avec Web Audio API ?

**Solution :** Séquenceur basé sur le clock interne `audioContext.currentTime` :
- Progression Am - F - C - G (synthwave) en 112 BPM
- Basse saw + filtre passe-bas, arpèges square, kick sine modulé, snare/hihat via buffer de bruit blanc filtré
- Scheduling des notes avec 1.5s d'avance pour éviter les latences

---

## Limites et améliorations possibles

- La détection faciale reste sensible à la luminosité ambiante - une vraie solution serait d'utiliser un modèle entraîné sur un dataset plus diversifié (FairFace, etc.)
- L'algorithme génétique pourrait bénéficier d'un crossover (actuellement mutation seule)
- Le réseau de neurones est très simple (1 couche cachée, 8 neurones) - une architecture plus profonde pourrait apprendre des stratégies plus complexes
- Pas de persistance du meilleur cerveau entre sessions (export JSON manuel disponible)

---

*Projet réalisé dans le cadre du cours IA2 - MIAGE 2025-2026*
