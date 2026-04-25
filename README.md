# GRIMACE RUN - Neural Face Runner

> Projet IA2 2025-2026 - ML5.js + Neuro-Evolution

Un jeu de course infini cyberpunk contrôlé par les expressions du visage, avec des runners IA qui apprennent par algorithme génétique.

---

## Jouer

**[Jouer en ligne - GitHub Pages](https://VOTRE_PSEUDO.github.io/grimace-run/)**

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

*Projet réalisé dans le cadre du cours IA2 - MIAGE 2025-2026*
