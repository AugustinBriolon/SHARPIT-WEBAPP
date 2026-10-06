import type { HelpCategory } from '../types';

export const COACH: HelpCategory = {
  slug: 'coach',
  title: 'Le coach',
  description: 'Lui poser une question, valider ses propositions, et ce qu’il garde en mémoire.',
  icon: 'coach',
  articles: [
    {
      slug: 'poser-une-question',
      title: 'Poser une question au coach',
      summary:
        'L’onglet Coach répond depuis ton modèle : ton état, ton plan, tes séances et ton objectif. Tu peux écrire ou dicter.',
      body: `
### Écrire ou dicter

Tape ta question, ou touche le micro quand le champ est vide pour dicter en français.

### Depuis un écran

Les pastilles **Discuter de…** (ma récupération, mon sommeil, ma charge, ta nutrition du jour) ouvrent le coach avec cet écran déjà en contexte.

### Tes conversations

Elles sont gardées sur ton compte. Retrouve-les dans l’historique du Coach, et reprends-en une là où tu l’avais laissée.

Le coach a besoin du [consentement IA](/aide/confidentialite/consentements). Sans lui, les lectures et le verdict du jour fonctionnent, mais pas la conversation.
`,
    },
    {
      slug: 'valider-une-proposition',
      title: 'Valider ou refuser une proposition du coach',
      summary:
        'Quand le coach veut changer ton plan, il te montre une carte avec Valider et Refuser. Rien ne change sans ta réponse.',
      body: `
### La carte de proposition

Ajouter, déplacer, modifier ou supprimer une séance : chaque changement arrive comme une carte. Une suppression demande une seconde confirmation.

### Après ta réponse

Une fois toutes les cartes d’une étape répondues, le coach applique ce que tu as validé et poursuit sa réponse. Le Plan et le Résumé se rechargent.

### Si tu poses une autre question

Les propositions laissées sans réponse sont considérées comme refusées.
`,
    },
    {
      slug: 'memoire-du-coach',
      title: 'La mémoire du coach',
      summary:
        'Ce que le coach doit toujours savoir de toi : contraintes, contexte, déplacements. Ouvre-la depuis la barre d’outils de l’onglet Coach.',
      body: `
### Ce que tu peux y mettre

Des informations durables que le coach prend en compte dans chaque analyse et chaque recommandation : une contrainte de travail, un contexte familial, une préférence d’entraînement.

### Les déplacements

Un voyage enregistré apparaît dans ton Plan, à côté des dates de la semaine concernée. Le coach en tient compte quand il programme.
`,
    },
    {
      slug: 'limites',
      title: 'Ce que le coach fera, et ce qu’il ne fera pas',
      summary:
        'Le coach lit ton modèle, propose et explique. Il ne diagnostique pas, n’invente pas de science hors corpus, et ne force rien quand la confiance est trop basse.',
      body: `
### Ce qu’il fera

- Préparer ou ajuster une semaine selon ton objectif, ton état et tes créneaux.
- Répondre dans le chat avec le contexte Twin déjà chargé (récupération, charge, plan, contraintes).
- S’appuyer sur les apprentissages issus des séances déjà évaluées, quand assez de preuves existent.
- Citer les références internes SharpIt quand elles éclairent une prescription.
- Te laisser valider ou refuser chaque changement de plan.

### Ce qu’il ne fera pas

- Poser un diagnostic médical, ni remplacer un médecin ou un kiné.
- Inventer des études ou des chiffres hors de ton Twin et hors du corpus SharpIt.
- Passer une séance écrite quand le [niveau de confiance](/aide/methode/niveau-de-confiance) est faible ou insuffisant : les [garde-fous](/aide/plan/garde-fous) retirent la prescription plutôt que de feindre une certitude.
- Contourner un garde-fou (charge, récupération, zone à protéger, conflit d’agenda…).
- Appliquer un changement de plan sans ta validation.

### En pratique

Si une demande touche à la santé au-delà de l’entraînement, le coach reste factuel et te renvoie vers un professionnel. Pour le plan, ce sont toujours les contrôles fixes qui ont le dernier mot avant l’affichage.
`,
    },
    {
      slug: 'bilan-de-la-semaine',
      title: 'Le bilan de la semaine',
      summary:
        'Un bilan rédigé de ta semaine : faits marquants, chiffres, ce qui a bien marché, ce qu’il faut surveiller et la semaine suivante. Réservé à SharpIt Pro.',
      body: `
Ouvre-le depuis le **…** du Plan, **Bilan de la semaine**.

### Ce qu’il contient

- **Faits marquants** : ce qui a bien marché, ce qu’il faut surveiller.
- **Les chiffres de la semaine**, jour par jour, face à ta moyenne.
- **La semaine suivante**, et le texte complet sur sa propre page.

Le dernier bilan est relu à l’ouverture ; celui de la semaine en cours se rédige à la demande. Une notification « Ta semaine en revue est prête » peut te prévenir.

Le bilan fait partie de [SharpIt Pro](/aide/compte/sharpit-pro).
`,
    },
  ],
};
