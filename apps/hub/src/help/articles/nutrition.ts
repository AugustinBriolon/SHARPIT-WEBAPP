import type { HelpCategory } from '../types';

export const NUTRITION: HelpCategory = {
  slug: 'nutrition',
  title: 'Nutrition',
  description:
    'Noter tes repas, tes aliments et recettes, et les notes de repas dans le journal SharpIt.',
  icon: 'nutrition',
  articles: [
    {
      slug: 'noter-un-repas',
      title: 'Noter un repas',
      summary:
        'Chaque repas a son « + » : cherche un aliment, décris un repas (Pro), scanne un code-barres, reprends un aliment récent ou fais un ajout rapide, puis choisis la portion.',
      body: `
Ouvre **Nutrition** depuis la carte du Résumé.

### Trouver un aliment

Tant que tu n’as pas commencé à chercher, les raccourcis restent visibles (scanner, décrire, mes repas…). Dès que tu tapes une recherche, ils s’effacent pour laisser la place aux résultats.

La recherche montre dans l’ordre :

1. **Déjà mangés** : tes aliments des 90 derniers jours, avec la dernière portion.
2. **Tes aliments**.
3. **Les aliments génériques** de la table Ciqual.
4. **Les produits** d’Open Food Facts.

Un aliment vérifié (Ciqual, ou valeurs fournies par le fabricant) porte un sceau après son nom.

### Décrire un repas (Pro)

**Décrire un repas** laisse SharpIt découper ta description en aliments distincts (ex. faux-filet, frites, brocolis), avec des grammes et macros estimés. Tu ajustes les portions, puis tu ajoutes le tout d’un geste.

### Scanner un code-barres

Le scanner s’ouvre depuis l’ajout d’un aliment, ou depuis le widget **Scanner un produit**.

### La portion

En grammes, avec des raccourcis, et l’aperçu des calories et macros qui suit.

### Corriger

Touche une entrée pour la modifier, glisse-la pour la supprimer. Tout s’affiche tout de suite et s’enregistre en arrière-plan.
`,
    },
    {
      slug: 'aliments-recettes-repas',
      title: 'Tes aliments, recettes et repas enregistrés',
      summary:
        'Crée tes propres aliments, compose une recette à partir d’autres aliments, enregistre un repas entier, ou copie celui de la veille en une touche.',
      body: `
### Mes aliments

Un aliment à toi se crée pour 100 g, depuis l’étiquette. Retrouve-les dans **Mes aliments** (et dans **Paramètres › Nutrition**) : glisse pour modifier ou supprimer. Les repas déjà notés gardent leurs valeurs.

### Créer une recette

**Créer une recette** assemble des ingrédients pesés crus. Le poids cuit et le nombre de portions sont facultatifs ; l’étiquette pour 100 g se calcule en direct.

### Mes repas

Le **…** d’un repas permet de **l’enregistrer** sous un nom. Ensuite, **Mes repas** l’ajoute en entier en une touche.

### Copier la veille

Le **…** d’un repas (ou un appui long sur sa ligne) copie le même repas de la veille. Une journée vide propose **Copier la veille** pour toute la journée.
`,
    },
    {
      slug: 'note-des-repas',
      title: 'La note des repas',
      summary:
        'Chaque aliment a une note qui s’explique. La note d’un repas est la moyenne de ses aliments, pondérée par leur énergie.',
      body: `
### La note d’un aliment

Elle s’appuie sur sa composition et dit pourquoi : ce qui la tire vers le haut, ce qui la tire vers le bas. Elle tient compte de ton régime alimentaire, si tu en suis un.

### La note d’un repas

La moyenne des notes de ses aliments, pondérée par l’énergie de chacun : une cuillère d’huile ne pèse pas comme une assiette de pâtes. La note de la journée s’affiche à côté de « Repas ».

### La lecture du coach

Chaque jour, le coach peut lire ce que tu as mangé face à ton entraînement : carburant, qualité, régime, avec une action concrète. Cette lecture fait partie de [SharpIt Pro](/aide/compte/sharpit-pro). Ton journal alimentaire, lui, reste ouvert à tous.
`,
    },
    {
      slug: 'objectifs-nutritionnels',
      title: 'Tes objectifs nutritionnels',
      summary:
        'Règle ton objectif d’énergie et la répartition de tes macros, en grammes ou en pourcentage, depuis le « … » de Nutrition.',
      body: `
### Énergie et macros

**Objectifs nutritionnels** fixe ton énergie quotidienne et tes protéines, glucides et lipides, en grammes ou en pourcentage de l’énergie.

### La jauge du jour

L’énergie consommée face à l’objectif, avec l’exercice et ce qu’il reste. En dessous, les trois macros et la répartition de ton énergie.

### Régularité

Quatorze jours face à ton objectif calorique. Un jour tenu gagne son sceau, que tu découvres en l’ouvrant.

### Le poids

Ta cible de poids se règle depuis le même menu, ou depuis Santé.
`,
    },
    {
      slug: 'priorites-nutrition',
      title: 'Nutrition et sources',
      summary:
        'Le journal alimentaire vit dans SharpIt. Choisis la source principale dans Priorités par catégorie ; Apple Santé complétera bientôt l’écriture.',
      body: `
### Où noter

Tout se passe dans **Nutrition** : recherche, scan, recettes et objectifs. Aucune connexion MyFitnessPal n’est proposée.

### Priorités

Dans **Paramètres › Sources de données › Priorités par catégorie**, la catégorie **Nutrition** met **SharpIt** en source principale quand tu actives le journal.

### Données déjà importées

Les jours importés autrefois depuis MyFitnessPal restent visibles en lecture seule jusqu’à ce que tu y ajoutes un aliment toi-même.

### Apple Santé

SharpIt lira et écrira progressivement nutrition et poids vers Apple Santé ; la formulation exacte suivra la mise en production.
`,
    },
  ],
};
