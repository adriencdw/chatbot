# DigiCitoyen Chatbot — Backend

Assistant virtuel pour une ASBL d'inclusion numérique. RAG basé sur 5 PDF, prise de RDV via Google Calendar, confirmation par email.

---

## Prérequis

- Node.js 18+
- Un compte Google avec accès aux 2 calendriers (`orbinou@gmail.com` et `orbinou123@gmail.com`)
- Une clé API Anthropic
- La validation en 2 étapes activée sur le compte Gmail expéditeur

---

## Installation

```bash
cd /home/adrien/Documents/chatbot-backend
npm install
```

---

## Configuration du .env

### 1. Clé API Anthropic (Claude)

- Va sur https://console.anthropic.com/settings/keys
- Crée une clé → copie-la dans `ANTHROPIC_API_KEY`

---

### 2. Google Calendar OAuth2

**Créer les identifiants Google :**

1. Va sur https://console.cloud.google.com
2. Crée un projet (ex: "DigiCitoyen Chatbot")
3. **APIs & Services → Bibliothèque** → cherche "Google Calendar API" → **Activer**
   - Si tu vois une erreur "API not enabled" plus tard, va directement sur :
     `https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=TON_PROJECT_ID`
     et clique Activer. Attends 1-2 minutes avant de réessayer.
4. **APIs & Services → Identifiants → Créer des identifiants → ID client OAuth 2.0**
   - Type : **Application Web**
   - URI de redirection autorisés : `http://localhost:3001/auth/google/callback`
   - Clique Créer → copie le **Client ID** et le **Client Secret** dans le `.env`
5. **APIs & Services → Écran de consentement OAuth → Audience → Utilisateurs tests**
   - Ajoute `orbinou@gmail.com`

**Obtenir le Refresh Token (une seule fois) :**

```bash
node scripts/oauth-setup.js
```

- Le script affiche une URL → ouvre-la dans le navigateur
- Connecte-toi avec `orbinou@gmail.com`
- Google redirige vers `localhost:3001/auth/google/callback?code=XXXX&scope=...`
  - La page affiche une erreur de connexion → c'est **normal**, le serveur ne tourne pas encore
  - Copie uniquement la valeur après `code=` et avant `&scope`
- Colle ce code dans le terminal → le script affiche le `GOOGLE_REFRESH_TOKEN`
- Copie ce token dans le `.env`

---

### 3. SMTP Gmail (envoi des emails)

**Créer un App Password Gmail :**

1. Va sur https://myaccount.google.com/apppasswords (connecté avec `orbinou@gmail.com`)
   - La validation en 2 étapes doit être activée sur le compte
2. Donne un nom (ex: `chatbot`) → clique **Créer**
3. Copie le code de 16 caractères → colle-le **sans espaces** dans `SMTP_PASS`

---

### 4. Rendre les calendriers publics (pour la page /calendars)

Pour que les iframes s'affichent sur `http://localhost:5173/calendars` :

1. Ouvre https://calendar.google.com connecté avec le bon compte
2. Clique sur l'engrenage ⚙️ en haut à droite → **Paramètres**
3. Dans le menu à gauche, sous "Paramètres des agendas", clique directement sur le nom de l'agenda
4. Descends jusqu'à **"Autorisations d'accès aux événements"**
5. Coche **"Rendre disponible publiquement"** → clique **OK**
6. Répète pour l'autre calendrier

---

### 5. Déploiement en production (Railway)

Quand tu déploies le backend sur Railway :

1. Mets à jour dans le `.env` (et dans les variables Railway) :
   - `BASE_URL=https://ton-app.railway.app`
   - `FRONTEND_ORIGIN=https://build-ai.be`
   - `GOOGLE_REDIRECT_URI=https://ton-app.railway.app/auth/google/callback`
2. Ajoute aussi cette nouvelle URI dans Google Cloud Console → Identifiants → ton client OAuth

Et dans le `.env` du frontend (`site-buildAI/.env`) :
   - `VITE_API_BASE=https://ton-app.railway.app`

---

## Lancer le projet en local

**Terminal 1 — Backend :**
```bash
cd /home/adrien/Documents/chatbot-backend
npm run dev
```

**Terminal 2 — Frontend :**
```bash
cd /home/adrien/Documents/site-buildAI
npm run dev
```

**URLs disponibles :**

| URL | Description |
|---|---|
| http://localhost:5173 | Site principal + widget chatbot |
| http://localhost:5173/docs | Liste des 5 PDFs DigiCitoyen |
| http://localhost:5173/calendars | Les 2 agendas Google embarqués |
| http://localhost:3001/api/health | Vérifier que le backend tourne |

**Mot de passe du chatbot :** `digicitoyen2025` (défini dans `site-buildAI/.env`)

---

## Générer les PDFs (déjà fait)

```bash
npm run generate-pdfs
```

Les 5 PDFs sont générés dans `/pdfs/` et servis statiquement par le backend sur `/pdfs/nom-fichier.pdf`.

---

## Architecture

```
Utilisateur
    ↓ question
ChatWidget (React)
    ↓ POST /api/chat
rag.js → Claude Haiku + 5 docs en system prompt
    ↓ réponse + intent RDV détecté
    ↓ GET /api/slots
calendar.js → Google freebusy (2 calendriers) → 3 créneaux libres
    ↓ utilisateur choisit un créneau + remplit formulaire
    ↓ POST /api/appointment
tokenStore.js → token UUID 24h
email.js → email manager avec liens CONFIRMER / REFUSER
    ↓ manager clique CONFIRMER
    ↓ GET /api/confirm/:token
calendar.js → createCalendarEvent()
email.js → email confirmation utilisateur
```
