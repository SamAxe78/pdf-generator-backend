const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Route d'accueil
app.get('/', (req, res) => {
  res.send('✅ Serveur PDF BatiProAI en ligne (Version Full-Page) !');
});

async function fetchImageAsBase64(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const buffer = await response.arrayBuffer();
    return `data:${response.headers.get('content-type') || 'image/png'};base64,${Buffer.from(buffer).toString('base64')}`;
  } catch (error) {
    console.error("⚠️ Erreur téléchargement image:", error.message);
    return null;
  }
}

// 1. CORPS DU DOCUMENT + STYLE CSS
// Notez qu'on passe maintenant headerBase64 et logoBase64 ici
const generateBodyContent = (data, logoBase64, headerBase64) => {
  const formatPrice = (p) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(p || 0);
  const total_ht = data.total_ht || 0;
  const tva_amount = (total_ht * (data.tva || 20)) / 100;
  const total_ttc = total_ht + tva_amount;
  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR');

  // STRATÉGIE :
  // Si papier entête : On l'affiche en "fixed" (se répète sur chaque page) en arrière plan.
  // On gère les marges via le padding du body.
  
  // Padding standard (si pas de papier entête)
  let bodyPadding = '50mm 15mm 20mm 15mm'; 
  
  // Si papier entête, on peut ajuster le padding si besoin (ici on garde le même pour s'aligner sur votre image A4)
  if (data.papier_entete) {
     bodyPadding = '0mm 0mm 0mm 0mm'; // On reset, et on gère dans un conteneur interne
  }

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @page { margin: 0; size: A4; } /* IMPORTANT : On supprime les marges par défaut du PDF */
      
      html, body { 
        margin: 0; 
        padding: 0; 
        width: 210mm;
        min-height: 297mm;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
        font-size: 11px; 
        color: #333; 
        -webkit-print-color-adjust: exact;
      }

      /* Image de fond (Papier à en-tête) */
      .page-background {
        position: fixed;
        top: 0;
        left: 0;
        width: 210mm;
        height: 297mm;
        z-index: -1000; /* Derrière tout */
        background-image: url('${headerBase64 || ""}');
        background-size: 100% 100%;
        background-repeat: no-repeat;
      }

      /* Conteneur principal avec les marges de sécurité */
      .main-content {
        padding: 50mm 15mm 20mm 15mm; /* Top Right Bottom Left */
        position: relative;
        z-index: 1;
      }

      /* S'il y a un papier entête, le header standard est caché via CSS conditionnel ou JS */
      
      /* --- Styles Communs --- */
      :root { --primary: #3b82f6; --light-bg: #f8fafc; }

      .header-standard { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
      .col-left { display: flex; flex-direction: column; justify-content: center; }
      .company-details { font-size: 9px; color: #555; line-height: 1.3; margin-top: 5px; }
      .col-right { text-align: right; }
      .doc-title { font-size: 28px; font-weight: bold; color: #3b82f6; text-transform: uppercase; margin: 0; line-height: 1; }
      .doc-meta { font-size: 10px; margin-top: 5px; color: #444; }

      /* Info Document (Si papier entête actif, on affiche juste le numéro et la date en haut à droite) */
      .header-overlay { 
         text-align: right; 
         position: absolute;
         top: 55mm; /* Ajustez selon votre design */
         right: 15mm;
         background: rgba(255,255,255,0.7);
         padding: 5px;
         border-radius: 4px;
      }

      .client-section { display: flex; justify-content: flex-end; margin-bottom: 30px; margin-top: 20px;}
      .client-box { 
        width: 45%; 
        background: rgba(248, 250, 252, 0.95); 
        padding: 15px; 
        border-radius: 6px; 
        border-left: 4px solid var(--primary); 
      }
      .client-label { color: var(--primary); font-weight: bold; font-size: 10px; text-transform: uppercase; margin-bottom: 5px; }
      .client-name { font-weight: bold; font-size: 13px; margin-bottom: 3px; color: #1e3a8a; }

      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; margin-top: 20px; background: rgba(255,255,255,0.9); }
      th { background: var(--primary); color: white; padding: 10px; text-align: left; font-size: 10px; text-transform: uppercase; font-weight: bold; }
      td { padding: 12px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
      tr:nth-child(even) td { background-color: rgba(249, 250, 251, 0.8); } 

      .col-price, .col-total { text-align: right; }
      
      .totals-section { display: flex; justify-content: flex-end; page-break-inside: avoid; }
      .totals-box { width: 45%; background: rgba(255,255,255,0.9); padding: 10px; border-radius: 4px; }
      .total-row { display: flex; justify-content: space-between; padding: 8px 10px; background: var(--light-bg); margin-bottom: 2px; border-radius: 4px; font-weight: bold; color: #555; }
      .total-row.final { background: var(--primary); color: white; font-size: 14px; margin-top: 5px; }
    </style>
  </head>
  <body>

    ${headerBase64 ? `<div class="page-background"></div>` : ''}

    <div class="main-content">
      
      ${headerBase64 ? `
        <div class="header-overlay">
           <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${data.type_document}</div>
           <div style="font-size: 11px; font-weight:bold;">N° ${data.numero}<br>${formatDate(data.date_creation)}</div>
        </div>
        <div style="height: 20px;"></div> 
      ` : `
        <div class="header-standard">
          <div class="col-left">
            ${logoBase64 ? `<img src="${logoBase64}" style="height: 2cm; max-width: 250px; object-fit: contain; margin-bottom:10px;" />` : `<h1 style="color:#3b82f6; margin:0; font-size:22px;">${data.user_entreprise || 'Mon Entreprise'}</h1>`}
            <div class="company-details">
              <strong>${data.user_entreprise || ''}</strong><br>
              ${data.user_adresse || ''}<br>
              ${data.user_cp || ''} ${data.user_ville || ''}<br>
              SIRET: ${data.user_siret || ''}
            </div>
          </div>
          <div class="col-right">
            <div class="doc-title">${data.type_document || 'DEVIS'}</div>
            <div class="doc-meta"><strong>N° :</strong> ${data.numero || 'PROVISOIRE'}<br><strong>Date :</strong> ${formatDate(data.date_creation)}</div>
          </div>
        </div>
      `}

      <div class="client-section">
        <div class="client-box">
          <div class="client-label">ADRESSÉ À :</div>
          <div class="client-name">${data.client_nom}</div>
          <div class="client-details">
            ${data.client_adresse || ''}<br>
            ${data.client_cp || ''} ${data.client_ville || ''}
          </div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th width="45%">Description</th>
            <th width="10%" style="text-align:center">Unité</th>
            <th width="10%" style="text-align:center">Qté</th>
            <th width="15%" style="text-align:right">Prix U. HT</th>
            <th width="20%" style="text-align:right">Total HT</th>
          </tr>
        </thead>
        <tbody>
          ${data.prestations.map(p => `
            <tr>
              <td>
                <div style="font-weight:bold; color:#333;">${p.libelle.split('\n')[0]}</div>
                <div style="font-size:10px; color:#666; margin-top:2px;">${p.libelle.split('\n').slice(1).join('<br>')}</div>
              </td>
              <td style="text-align:center">${p.unite || '-'}</td>
              <td style="text-align:center">${p.quantite}</td>
              <td style="text-align:right">${formatPrice(p.prix_unitaire)}</td>
              <td style="text-align:right; font-weight:bold;">${formatPrice(p.total_ht)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="totals-box">
          <div class="total-row"><span>Total HT</span><span>${formatPrice(total_ht)}</span></div>
          <div class="total-row"><span>TVA (${data.tva}%)</span><span>${formatPrice(tva_amount)}</span></div>
          <div class="total-row final"><span>NET À PAYER</span><span>${formatPrice(total_ttc)}</span></div>
        </div>
      </div>

      ${data.conditions_generales ? `
        <div style="margin-top: 30px; font-size: 10px; color: #666; page-break-inside: avoid; background: rgba(255,255,255,0.8); padding: 10px; border-radius: 4px;">
          <strong>Conditions :</strong><br>${data.conditions_generales}
        </div>
      ` : ''}

      ${!headerBase64 ? `
        <div style="margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 10px; text-align: center; font-size: 8px; color: #94a3b8;">
          ${data.user_entreprise} - ${data.user_adresse} ${data.user_cp} ${data.user_ville} - Tél: ${data.user_phone || ''} - Email: ${data.user_email || ''}<br>
          SIRET : ${data.user_siret} - Document généré par BatiProAI
        </div>
      ` : ''}
    
    </div> </body>
  </html>
  `;
};

app.post('/generate-pdf', async (req, res) => {
  try {
    console.log('📲 Nouvelle demande PDF...');
    const data = req.body;
    
    // 1. Téléchargement des images AVANT de générer le HTML
    let logoBase64 = null;
    let headerBase64 = null;

    // Logo
    if (data.user_logo) { 
        logoBase64 = await fetchImageAsBase64(data.user_logo); 
    }

    // Papier Entête
    if (data.papier_entete) { 
      console.log('🖼️ Papier entête URL reçue:', data.papier_entete);
      headerBase64 = await fetchImageAsBase64(data.papier_entete); 
      if (!headerBase64) console.log('⚠️ Echec téléchargement papier entête');
      else console.log('✅ Papier entête téléchargé et converti');
    }

    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });

    const page = await browser.newPage();
    
    // On passe TOUT au générateur de HTML
    const htmlContent = generateBodyContent(data, logoBase64, headerBase64);
    
    await page.setContent(htmlContent, { waitUntil: 'load', timeout: 60000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      // ZERO MARGES ICI : On laisse le CSS gérer le padding
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false, // On désactive le header Puppeteer natif car on le gère en HTML/CSS
    });
    
    await browser.close();
    console.log('✅ PDF envoyé !');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdfBuffer.length });
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ ERREUR SERVEUR :', error);
    res.status(500).send('Erreur : ' + error.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Serveur PDF lancé sur le port ${PORT}`));
