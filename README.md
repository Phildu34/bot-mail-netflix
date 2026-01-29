# Bot Mail Netflix - Docker

Bot automatique pour confirmer le foyer Netflix à partir des emails de Netflix.

## Prérequis

- Docker et Docker Compose installés
- Fichier `.env` avec les identifiants de votre email

## Configuration

1. Copiez le fichier d'exemple et configurez vos identifiants :

```bash
cp .env.example .env
```

2. Éditez `.env` avec vos données :

```
IMAP_USER=ton-email@gmail.com
IMAP_PASS=ton-mot-de-passe-d’application-gmail
```

**Note** : Pour Gmail, vous devez générer un « Mot de passe d’application » dans votre compte Google.

## Utilisation

### Construire et exécuter :

```bash
docker-compose up -d --build
```

### Voir les logs :

```bash
docker-compose logs -f
```

### Arrêter le bot :

```bash
docker-compose down
```

### Redémarrer le bot :

```bash
docker-compose restart
```

## Fonctionnement

Le bot s’exécute automatiquement toutes les **1 minutes** dans le conteneur, en vérifiant s’il y a de nouveaux emails de Netflix pour confirmer le foyer (Household).
