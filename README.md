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

on place les fichiers dans un dossier dans home
cd ce dossier

```bash
docker compose up -d --build
```
docker start bot-mail-netflix

docker update --restart unless-stopped bot-mail-netflix

sudo systemctl start docker


## Fonctionnement

Le bot s’exécute automatiquement toutes les **1 minutes** dans le conteneur, en vérifiant s’il y a de nouveaux emails de Netflix pour confirmer le foyer (Household).
