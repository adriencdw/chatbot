import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "../pdfs");
mkdirSync(OUTPUT_DIR, { recursive: true });

const BLUE = "#2B5DB8";
const DARK = "#1a1a2e";
const GRAY = "#666688";

function generatePDF(filename, title, sections) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 55 });
    const stream = createWriteStream(join(OUTPUT_DIR, filename));
    doc.pipe(stream);

    // Header bar
    doc.rect(0, 0, doc.page.width, 75).fill(BLUE);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(18)
       .text("DigiCitoyen ASBL", 55, 22);
    doc.fillColor("rgba(255,255,255,0.75)").font("Helvetica").fontSize(9.5)
       .text("www.digicitoyen.be  |  info@digicitoyen.be  |  +32 2 218 44 67", 55, 48);

    // Title
    doc.moveDown(2.5)
       .fillColor(DARK).font("Helvetica-Bold").fontSize(17)
       .text(title);

    // Divider line
    const lineY = doc.y + 6;
    doc.moveTo(55, lineY).lineTo(doc.page.width - 55, lineY)
       .strokeColor(BLUE).lineWidth(2).stroke();
    doc.moveDown(1.2);

    // Sections
    for (const section of sections) {
      if (section.heading) {
        doc.moveDown(0.4)
           .fillColor(BLUE).font("Helvetica-Bold").fontSize(10.5)
           .text(section.heading.toUpperCase());
        doc.moveDown(0.3);
      }
      if (section.body) {
        doc.fillColor(DARK).font("Helvetica").fontSize(9.5)
           .text(section.body, { align: "left", lineGap: 3 });
        doc.moveDown(0.5);
      }
    }

    // Footer
    const footerY = doc.page.height - 42;
    doc.moveTo(55, footerY).lineTo(doc.page.width - 55, footerY)
       .strokeColor("#ccccdd").lineWidth(0.5).stroke();
    doc.fillColor(GRAY).font("Helvetica").fontSize(7.5)
       .text(
         `DigiCitoyen ASBL  —  BE 0789.123.456  —  Rue du Progrès 44, 1210 Bruxelles  —  Document ${new Date().toLocaleDateString("fr-BE")}`,
         55, footerY + 10, { align: "center" }
       );

    doc.end();
    stream.on("finish", () => { console.log(`✓ ${filename}`); resolve(); });
    stream.on("error", reject);
  });
}

const DOCS = [
  {
    filename: "presentation-generale.pdf",
    title: "Présentation Générale",
    sections: [
      { heading: "Mission", body: "DigiCitoyen est une association sans but lucratif bruxelloise fondée en 2018 dont la mission est de lutter contre la fracture numérique en Belgique. Nous accompagnons les personnes éloignées du numérique — seniors, demandeurs d'emploi, personnes en situation de précarité — vers une autonomie digitale réelle et durable." },
      { heading: "Vision", body: "Un Bruxelles où chaque citoyen, quel que soit son âge, son niveau de revenus ou son origine, dispose des compétences numériques nécessaires pour participer pleinement à la société." },
      { heading: "Valeurs", body: "• Accessibilité : nos services sont gratuits ou à prix solidaire\n• Bienveillance : accompagnement individualisé, sans jugement\n• Inclusion : multilinguisme (français, néerlandais, anglais, arabe)\n• Durabilité : former des formateurs pour démultiplier l'impact" },
      { heading: "Équipe", body: "Directrice : Marie Dubois (depuis 2018)\nCoordinatrice ateliers : Fatima El Amrani\nBénévoles actifs : 23 personnes\nPartenaires : CPAS de Bruxelles-Ville, Cocof, Actiris" },
      { heading: "Contact", body: "Email : info@digicitoyen.be\nTéléphone : +32 2 218 44 67\nAdresse : Rue du Progrès 44, 1210 Saint-Josse-ten-Noode\nPermanences : lundi–vendredi, 9h–17h" },
    ],
  },
  {
    filename: "services-ateliers.pdf",
    title: "Services et Ateliers 2024–2025",
    sections: [
      { heading: "Ateliers collectifs (6 à 10 personnes)", body: "" },
      { body: "1. PREMIERS PAS NUMÉRIQUES — 4 séances × 2h\n   Public : grands débutants, seniors\n   Contenu : allumer/éteindre, souris, clavier, navigateur\n   Lieux : Bibliothèque de Saint-Josse, Centre communautaire Molenbeek" },
      { body: "2. SMARTPHONE & TABLETTE — 2 séances × 2h\n   Public : tout public\n   Contenu : appels vidéo, WhatsApp, prise de photo, téléchargement d'apps" },
      { body: "3. ADMINISTRATION EN LIGNE — 3 séances × 2h\n   Public : adultes actifs, demandeurs d'emploi\n   Contenu : My eBox, CPAS en ligne, IRISbox, déclaration d'impôts, Actiris" },
      { body: "4. SÉCURITÉ ET VIE PRIVÉE — 1 séance × 2h\n   Public : tout public\n   Contenu : mots de passe, arnaques, paramètres de confidentialité, sauvegardes" },
      { heading: "Accompagnement individuel", body: "Rendez-vous d'1h sur demande, en présentiel ou à domicile (zone bruxelloise).\nIdéal pour : questions spécifiques, démarches urgentes (ImpôtsEnLigne, MyPension).\nPremière séance gratuite (bilan des besoins)." },
      { heading: "Médiation numérique à domicile", body: "Disponible pour personnes à mobilité réduite — sur prescription CPAS ou médecin." },
    ],
  },
  {
    filename: "programme-formation.pdf",
    title: "Programme de Formation Janvier–Juin 2025",
    sections: [
      { heading: "Janvier 2025", body: "08/01 → Smartphone & Tablette (Saint-Josse) — 14h–16h\n15/01 → Premiers Pas Numériques S1 (Molenbeek) — 10h–12h\n22/01 → Administration en ligne S1 (Saint-Josse) — 14h–16h\n29/01 → Premiers Pas Numériques S2 (Molenbeek) — 10h–12h" },
      { heading: "Février 2025", body: "05/02 → Sécurité & Vie Privée (Saint-Josse) — 14h–16h\n12/02 → Administration en ligne S2 (Molenbeek) — 10h–12h\n19/02 → Smartphone & Tablette (Saint-Josse) — 14h–16h (liste d'attente)\nSemaine du 24/02 : RELÂCHE" },
      { heading: "Mars–Juin 2025", body: "Inscriptions ouvertes — consulter notre agenda en ligne ou contacter le secrétariat." },
      { heading: "Formation de formateurs (nouveau 2025)", body: "Module de 3 jours — certifiant — pour bénévoles et professionnels du social.\nProchaine session : 14–16 avril 2025.\nPlaces limitées à 12 participants — inscription obligatoire avant le 28 mars.\nTarif particulier : 150€ | Tarif organisation : 250€" },
      { heading: "Inscription", body: "Par email : ateliers@digicitoyen.be\nPar téléphone : +32 2 218 44 67 (lundi–vendredi, 9h–12h)\nEn personne : Rue du Progrès 44, 1210 Saint-Josse" },
    ],
  },
  {
    filename: "tarifs-conditions.pdf",
    title: "Tarifs et Conditions d'Accès",
    sections: [
      { heading: "Principe général", body: "DigiCitoyen fonctionne sur le principe de la tarification solidaire. Personne ne doit être exclu pour des raisons financières." },
      { heading: "Ateliers collectifs", body: "• Tarif plein : 5€ / séance (revenus réguliers)\n• Tarif réduit : 2€ / séance (CPAS, chômage, RIS, invalidité — sur présentation)\n• Tarif zéro : gratuit (sur décision de la directrice)\nMatériel fourni : ordinateur, Wi-Fi, support papier." },
      { heading: "Accompagnement individuel", body: "• 1ère séance : gratuite (bilan des besoins)\n• Suivantes : 10€ / heure (plein) ou 3€ / heure (réduit)\n• À domicile : supplément de 5€ (zone bruxelloise)" },
      { heading: "Formation de formateurs", body: "• Tarif particulier : 150€ pour 3 jours\n• Tarif organisation : 250€ (avec attestation)\nFinancement possible via le Fonds Formation (demande 6 semaines à l'avance)." },
      { heading: "Conditions d'inscription", body: "Inscription obligatoire (places limitées).\nAnnulation possible jusqu'à 48h avant la séance sans frais.\nAnnulation tardive ou absence non signalée : séance comptabilisée.\nRemboursement intégral si annulation de notre côté ou force majeure." },
      { heading: "Soutenir DigiCitoyen", body: "Don via virement : BE45 0689 3456 7812 — Communication : \"DON 2025\"\nReconnue association d'utilité publique (déduction fiscale 60% dès 40€)." },
    ],
  },
  {
    filename: "faq.pdf",
    title: "Foire Aux Questions",
    sections: [
      { heading: "Faut-il apporter son propre ordinateur ?", body: "Non. DigiCitoyen met du matériel à disposition. Si vous souhaitez apporter le vôtre, c'est encouragé." },
      { heading: "Les ateliers sont-ils accessibles sans parler français ?", body: "Oui. Nous proposons des ateliers en arabe, anglais et partiellement en néerlandais. Contactez-nous pour les disponibilités." },
      { heading: "Puis-je venir si j'ai un handicap moteur ?", body: "Nos locaux de Saint-Josse sont accessibles PMR (ascenseur, rampe). Des séances à domicile sont possibles pour les personnes à mobilité réduite." },
      { heading: "Comment devenir bénévole ?", body: "Nous cherchons des formateurs bénévoles (niveau basique suffit), traducteurs et aides administratifs. Écrivez à info@digicitoyen.be" },
      { heading: "DigiCitoyen travaille-t-il avec les CPAS ?", body: "Oui, nous avons des conventions avec plusieurs CPAS bruxellois. Les assistants sociaux peuvent nous contacter pour des orientations individuelles ou groupées." },
      { heading: "Puis-je inscrire quelqu'un d'autre (ex: un parent âgé) ?", body: "Absolument. Vous pouvez vous inscrire pour un proche. Le participant doit se présenter en personne le jour J." },
      { heading: "Comment annuler mon inscription ?", body: "Par email (ateliers@digicitoyen.be) ou téléphone (+32 2 218 44 67), au moins 48h à l'avance pour éviter la facturation." },
    ],
  },
];

for (const doc of DOCS) {
  await generatePDF(doc.filename, doc.title, doc.sections);
}
console.log("\nTous les PDFs ont été générés dans /pdfs/");
